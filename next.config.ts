import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Auto-memoises components and hooks (needs babel-plugin-react-compiler).
  reactCompiler: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        // The service worker (app/sw.ts, served by app/serwist/[path]/route.ts) must never be served stale.
        source: "/serwist/:path*",
        headers: [
          { key: "Cache-Control", value: "no-cache, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

// Adds esbuild to serverExternalPackages for the service worker build.
export default withSerwist(nextConfig);
