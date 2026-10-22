// Best-effort in-memory token buckets per caller and route. State lives in one server instance
// only (serverless instances don't share it), which is enough to stop a runaway client loop.

export interface BucketConfig {
  /** Burst size. */
  capacity: number;
  /** Tokens added per second. */
  refillPerSec: number;
}

export const RATE_LIMITS = {
  // Debounced keystrokes: bursts while typing, ~30/min sustained.
  suggest: { capacity: 20, refillPerSec: 0.5 },
  // Up to 4 images each; ~3/min sustained.
  extract: { capacity: 6, refillPerSec: 1 / 20 },
  // Re-sort runs pass B in parallel chunks.
  classify: { capacity: 20, refillPerSec: 1 / 3 },
  // Manual cards one by one, pasted lists and the library backfill in parallel chunks.
  enrich: { capacity: 30, refillPerSec: 1 / 2 },
  example: { capacity: 20, refillPerSec: 1 / 3 },
} satisfies Record<string, BucketConfig>;

export type RateLimitedRoute = keyof typeof RATE_LIMITS;

interface Bucket {
  tokens: number;
  updated: number;
}

const MAX_KEYS = 5000;

export class TokenBucketLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(private readonly config: BucketConfig) {}

  /** Takes `cost` tokens if available. `retryAfterSec` is set when refused. */
  take(key: string, cost = 1, now = Date.now()): { ok: boolean; remaining: number; retryAfterSec: number } {
    const { capacity, refillPerSec } = this.config;
    const prev = this.buckets.get(key);
    const tokens = prev ? Math.min(capacity, prev.tokens + ((now - prev.updated) / 1000) * refillPerSec) : capacity;
    // Re-insert so Map order tracks recency for eviction.
    this.buckets.delete(key);
    if (tokens >= cost) {
      this.buckets.set(key, { tokens: tokens - cost, updated: now });
      this.evict();
      return { ok: true, remaining: Math.floor(tokens - cost), retryAfterSec: 0 };
    }
    this.buckets.set(key, { tokens, updated: now });
    this.evict();
    return { ok: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((cost - tokens) / refillPerSec)) };
  }

  reset(): void {
    this.buckets.clear();
  }

  private evict(): void {
    while (this.buckets.size > MAX_KEYS) {
      const oldest = this.buckets.keys().next().value;
      if (oldest === undefined) break;
      this.buckets.delete(oldest);
    }
  }
}

const limiters = new Map<RateLimitedRoute, TokenBucketLimiter>();

function limiterFor(route: RateLimitedRoute): TokenBucketLimiter {
  let limiter = limiters.get(route);
  if (!limiter) {
    limiter = new TokenBucketLimiter(RATE_LIMITS[route]);
    limiters.set(route, limiter);
  }
  return limiter;
}

/** Caller key: the user id when signed in, otherwise the client IP. */
export function clientKey(req: Request, userId: string | null): string {
  if (userId) return `u:${userId}`;
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || req.headers.get("x-real-ip")?.trim();
  return `ip:${ip || "unknown"}`;
}

/** Returns a 429 Response when the caller is over the limit, otherwise null. */
export function rateLimit(route: RateLimitedRoute, key: string, cost = 1): Response | null {
  const result = limiterFor(route).take(key, cost);
  if (result.ok) return null;
  return Response.json(
    { error: "rate_limited" },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSec), "Cache-Control": "no-store" } },
  );
}

/** Test helper. */
export function resetRateLimits(): void {
  for (const limiter of limiters.values()) limiter.reset();
}
