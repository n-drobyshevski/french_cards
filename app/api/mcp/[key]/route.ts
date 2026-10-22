// The Claude connector: a remote MCP server (stateless Streamable HTTP, mcp-handler + SDK v2) at
// /api/mcp/<MCP_SECRET>. It is an authless connector, so the secret path segment is the only
// credential: a wrong key, a short or missing secret, or local-only mode all answer a plain 404.
// The path is never logged. Tools and their data rules live in lib/mcp/*; docs/CONNECTOR.md has
// the setup. proxy.ts does not match /api/mcp/*.
import { createMcpHandler } from "mcp-handler";
import packageJson from "@/package.json";
import { resolveMcpAccess, type McpConfig } from "@/lib/mcp/config";
import { createMcpRepo } from "@/lib/mcp/repo";
import { registerTools, SERVER_INSTRUCTIONS } from "@/lib/mcp/tools";

export const maxDuration = 60;

const notFound = () =>
  new Response("Not Found", { status: 404, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });

/** A stateless handler: mcp-handler builds a fresh McpServer (and repo) for every request. */
function handlerFor(config: McpConfig) {
  return createMcpHandler(
    (server) =>
      registerTools(server, {
        repo: createMcpRepo(config),
        userId: config.userId,
        timeZone: config.timeZone,
        now: () => new Date(),
      }),
    // The tool list never changes, so no `subscriptions/listen` stream: each would hold a function open until maxDuration.
    { serverInfo: { name: "kartochki", version: packageJson.version }, instructions: SERVER_INSTRUCTIONS, maxSubscriptions: 0 },
  );
}

async function handle(req: Request, ctx: RouteContext<"/api/mcp/[key]">): Promise<Response> {
  const { key } = await ctx.params;
  const config = resolveMcpAccess(key);
  if (!config) return notFound();
  try {
    const res = await handlerFor(config)(req);
    const headers = new Headers(res.headers);
    headers.set("Cache-Control", "no-store");
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  } catch (error) {
    console.error("[mcp] request failed", error instanceof Error ? error.message : error);
    return Response.json({ error: "internal_error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

// Every method Next routes (HEAD falls back to GET), so neither its automatic OPTIONS answer nor
// its 405 for an unexported method can reveal the route: each checks the key first (the SDK
// answers the ones it doesn't serve with 405).
export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as OPTIONS };
