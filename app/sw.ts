/// <reference lib="webworker" />
// Service worker, bundled by @serwist/turbopack (see app/serwist/[path]/route.ts) and served at /serwist/sw.js.
// - Precaches the build's static assets, public/ (icons, lexique: fr-lemmas, fr-conj, fr-morpho and the
//   FLELex levels fr-cefr.json) and the offline page.
// - Shell routes open from the HTML warmShell cached for this deploy and refresh it in the background;
//   other pages are network first with a 1 s timeout. Cached copies offline, /~offline as a last resort.
// - Never touches /api/* or cross-origin requests (Supabase), so they always hit the network uncached.
// - Android share target: POST /import is answered here (see components/pwa/share-target.ts).
import type { PrecacheEntry, RouteMatchCallbackOptions, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { CacheFirst, CacheableResponsePlugin, ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist, StaleWhileRevalidate } from "serwist";
import { SHARE_TARGET_ACTION, sharedImportUrl, stashSharedFiles } from "../components/pwa/share-target";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const DEV = process.env.NODE_ENV !== "production";

const PAGES_CACHE = "pages";
/** App routes whose HTML is fetched on install, so the app opens offline right after it's installed. */
const SHELL_ROUTES = [
  "/",
  "/exercises",
  "/exercises/play",
  "/library",
  "/context",
  "/settings",
  "/settings/plan",
  "/settings/review",
  "/settings/exercises",
  "/settings/ai",
  "/settings/fields",
  "/settings/data",
  "/import",
  "/login",
];

const DAY = 24 * 60 * 60;

// /auth/* (email links, password reset) is treated like the API: always network, never cached.
const isApi = (pathname: string) => pathname === "/api" || pathname.startsWith("/api/") || pathname.startsWith("/auth/");
const isRsc = (request: Request) => request.headers.get("RSC") === "1";
const isWorkerFile = (pathname: string) => pathname.startsWith("/serwist/");

function isPageRequest({ request, url, sameOrigin }: RouteMatchCallbackOptions): boolean {
  if (!sameOrigin || isApi(url.pathname) || isWorkerFile(url.pathname) || isRsc(request)) return false;
  return request.mode === "navigate" || (request.headers.get("Accept") ?? "").includes("text/html");
}

/**
 * A shell route without a query: its cached HTML was fetched by warmShell for this deploy, so it
 * matches the precached chunks. Queries (/import?shared=N, a stray ?code=) still go to the network.
 */
const isShellPage = (options: RouteMatchCallbackOptions) =>
  isPageRequest(options) && options.url.search === "" && SHELL_ROUTES.includes(options.url.pathname);

const ok = () => new CacheableResponsePlugin({ statuses: [200] });
/** One instance for both page rules, since they share the cache. */
const pagesExpiration = new ExpirationPlugin({ maxEntries: 48, maxAgeSeconds: 30 * DAY });

const runtimeCaching: RuntimeCaching[] = DEV
  ? [{ matcher: ({ sameOrigin, url }) => sameOrigin && !isApi(url.pathname), handler: new NetworkOnly() }]
  : [
      {
        // A cold open never waits on a slow network for the static shell.
        matcher: isShellPage,
        handler: new StaleWhileRevalidate({ cacheName: PAGES_CACHE, plugins: [ok(), pagesExpiration] }),
      },
      {
        matcher: isPageRequest,
        handler: new NetworkFirst({ cacheName: PAGES_CACHE, networkTimeoutSeconds: 1, plugins: [ok(), pagesExpiration] }),
      },
      {
        // Router payloads for client-side navigations (and their prefetches).
        matcher: ({ request, url, sameOrigin }) => sameOrigin && isRsc(request) && !isApi(url.pathname),
        handler: new NetworkFirst({
          cacheName: "pages-rsc",
          // Longer than pages: a payload from an older deploy turns the navigation into a hard one.
          networkTimeoutSeconds: 2,
          plugins: [ok(), new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 7 * DAY })],
        }),
      },
      {
        // next/font files are content-hashed; only the subsets actually used get cached.
        matcher: ({ url, sameOrigin }) => sameOrigin && /\.(?:woff2?|ttf|otf|eot)$/i.test(url.pathname),
        handler: new CacheFirst({
          cacheName: "fonts",
          plugins: [ok(), new ExpirationPlugin({ maxEntries: 48, maxAgeSeconds: 365 * DAY, maxAgeFrom: "last-used" })],
        }),
      },
      {
        // Hashed build output that isn't in the precache manifest (e.g. chunks of a newer deploy).
        matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/_next/static/"),
        handler: new CacheFirst({
          cacheName: "next-static",
          plugins: [ok(), new ExpirationPlugin({ maxEntries: 128, maxAgeSeconds: 30 * DAY, maxAgeFrom: "last-used" })],
        }),
      },
      {
        matcher: ({ url, sameOrigin }) =>
          sameOrigin && !isApi(url.pathname) && /\.(?:png|jpe?g|webp|avif|gif|svg|ico)$/i.test(url.pathname),
        handler: new StaleWhileRevalidate({
          cacheName: "static-images",
          plugins: [ok(), new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 30 * DAY })],
        }),
      },
      {
        // Everything else same-origin (manifest, /lexique, metadata routes), still never /api.
        matcher: ({ url, sameOrigin }) => sameOrigin && !isApi(url.pathname) && !isWorkerFile(url.pathname),
        handler: new NetworkFirst({
          cacheName: "others",
          networkTimeoutSeconds: 10,
          plugins: [ok(), new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 7 * DAY })],
        }),
      },
    ];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  disableDevLogs: true,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

// Android share target: keep the images, then hand over to the import screen.
serwist.registerCapture(
  ({ url, sameOrigin }) => sameOrigin && url.pathname === SHARE_TARGET_ACTION,
  async ({ request }) => {
    let count = 0;
    try {
      count = await stashSharedFiles(await request.formData());
    } catch (error) {
      console.error("Share target: could not keep the shared images", error);
    }
    return Response.redirect(new URL(sharedImportUrl(count), self.location.origin).href, 303);
  },
  "POST",
);

/** Refreshes the cached HTML of the main routes, so each deploy's pages match its precached chunks. */
async function warmShell(): Promise<void> {
  const cache = await caches.open(PAGES_CACHE);
  await Promise.all(
    SHELL_ROUTES.map(async (path) => {
      try {
        const response = await fetch(
          new Request(path, { credentials: "same-origin", cache: "reload", headers: { Accept: "text/html" } }),
        );
        if (response.ok && response.type === "basic" && !response.redirected) await cache.put(path, response);
      } catch {
        // Offline during install: pages get cached as they are visited instead.
      }
    }),
  );
}

if (!DEV) {
  self.addEventListener("install", (event) => {
    event.waitUntil(warmShell());
  });
}

serwist.addEventListeners();
