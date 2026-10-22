// Serves the service worker bundled from app/sw.ts at /serwist/sw.js (+ its source map).
// @serwist/turbopack's route exports `dynamic`/`dynamicParams`/`revalidate`, which Cache Components
// rejects, so only its GET and generateStaticParams are used. The build goes through `use cache`
// so it runs once at `next build` and is prerendered; esbuild is never needed at request time.
import { createSerwistRoute } from "@serwist/turbopack";
import { cacheLife } from "next/cache";
import { spawnSync } from "node:child_process";

/** Changes on every deploy, so the precached offline page always matches the current CSS/JS. */
function buildRevision(): string {
  const fromEnv = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromEnv) return fromEnv;
  const git = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" });
  return git.status === 0 && git.stdout.trim() ? git.stdout.trim() : "local";
}

const revision = buildRevision();

const serwist = createSerwistRoute({
  swSrc: "app/sw.ts",
  useNativeEsbuild: true,
  additionalPrecacheEntries: [{ url: "/~offline", revision }],
  // Everything in public/ is precached by default; sql.js's wasm (public/vendor/, ~700 KB) is only needed
  // for the Anki import, so it is fetched when first used instead of on every install.
  globIgnores: ["**/node_modules/**/*", "public/vendor/**/*"],
});

export const generateStaticParams = serwist.generateStaticParams;

interface BuiltFile {
  body: string;
  contentType: string;
}

async function buildFile(path: string): Promise<BuiltFile | null> {
  const response = await serwist.GET(new Request(`http://localhost/serwist/${path}`), { params: Promise.resolve({ path }) });
  const body = await response.text();
  return body ? { body, contentType: response.headers.get("Content-Type") ?? "application/javascript" } : null;
}

async function cachedBuildFile(path: string): Promise<BuiltFile | null> {
  "use cache";
  cacheLife("max");
  return buildFile(path);
}

export async function GET(_request: Request, { params }: { params: Promise<{ path: string }> }) {
  const { path } = await params;
  // In dev, Serwist rebuilds whenever app/sw.ts changes; caching would hide that.
  const file = process.env.NODE_ENV === "development" ? await buildFile(path) : await cachedBuildFile(path);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file.body, {
    headers: {
      "Content-Type": file.contentType,
      "Service-Worker-Allowed": "/",
      "Cache-Control": "no-cache, max-age=0, must-revalidate",
    },
  });
}
