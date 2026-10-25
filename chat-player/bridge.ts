// The MCP Apps side of the player (spec io.modelcontextprotocol/ui, 2026-01-26): JSON-RPC 2.0 over
// postMessage with the host's window. Written by hand rather than with the ext-apps SDK: the page
// is one small inline script, and it needs only the handshake, a few notifications and two
// requests (tools/call save_exercise_result, ui/message).

export const MCP_APPS_PROTOCOL = "2026-01-26";

type Params = Record<string, unknown>;

/** What the player reads of the host's context: the theme and the style variables (fonts). */
export interface HostContext {
  theme?: unknown;
  styles?: { variables?: Record<string, unknown>; css?: { fonts?: unknown } };
}

export interface Bridge {
  request(method: string, params?: Params): Promise<unknown>;
  notify(method: string, params?: Params): void;
  /** Resolves with the host context of `ui/initialize` (null when the host never answers). */
  ready: Promise<HostContext | null>;
}

const isObject = (value: unknown): value is Params => !!value && typeof value === "object" && !Array.isArray(value);

/** Opens the bridge to `window.parent` and runs the handshake; host notifications go to `onNotification`. */
export function connectHost(onNotification: (method: string, params: Params) => void): Bridge {
  const host = window.parent;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  let nextId = 1;
  const post = (message: Params) => host.postMessage({ jsonrpc: "2.0", ...message }, "*");

  window.addEventListener("message", (event) => {
    if (event.source !== host) return;
    const msg: unknown = event.data;
    if (!isObject(msg) || msg.jsonrpc !== "2.0") return;
    if (typeof msg.method !== "string") {
      // A response to one of ours.
      const waiting = typeof msg.id === "number" ? pending.get(msg.id) : undefined;
      if (!waiting) return;
      pending.delete(msg.id as number);
      if (isObject(msg.error)) waiting.reject(new Error(typeof msg.error.message === "string" ? msg.error.message : "Ошибка"));
      else waiting.resolve(msg.result);
      return;
    }
    if ("id" in msg) {
      // The host asks: teardown (nothing to keep: the round lives in the page) and ping get an empty result.
      const known = msg.method === "ui/resource-teardown" || msg.method === "ping";
      post(known ? { id: msg.id, result: {} } : { id: msg.id, error: { code: -32601, message: `Unknown method ${msg.method}` } });
      return;
    }
    onNotification(msg.method, isObject(msg.params) ? msg.params : {});
  });

  const request = (method: string, params: Params = {}) =>
    new Promise<unknown>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      post({ id, method, params });
    });
  const notify = (method: string, params: Params = {}) => post({ method, params });

  const info = { name: "kartochki-player", version: "1" };
  const ready = request("ui/initialize", { protocolVersion: MCP_APPS_PROTOCOL, appCapabilities: {}, appInfo: info, clientInfo: info })
    .then((result) => {
      notify("ui/notifications/initialized");
      return isObject(result) && isObject(result.hostContext) ? (result.hostContext as HostContext) : {};
    })
    .catch(() => null);

  return { request, notify, ready };
}

/** The host's theme and style variables on the page: `--font-sans` / `--font-mono` feed the app's stacks. */
export function applyHostContext(ctx: HostContext): void {
  const root = document.documentElement;
  if (ctx.theme === "light" || ctx.theme === "dark") root.dataset.theme = ctx.theme;
  const variables = ctx.styles?.variables;
  if (isObject(variables)) {
    for (const [name, value] of Object.entries(variables)) {
      if (name.startsWith("--") && typeof value === "string" && value) root.style.setProperty(name, value);
    }
  }
  const fonts = ctx.styles?.css?.fonts;
  if (typeof fonts === "string" && fonts) {
    let style = document.getElementById("host-fonts");
    if (!style) {
      style = document.createElement("style");
      style.id = "host-fonts";
      document.head.append(style);
    }
    style.textContent = fonts;
  }
}

/** Reports the page's height to the host (`ui/notifications/size-changed`): the player sizes itself, no inner scroll. */
export function reportSize(bridge: Bridge): void {
  let last = -1;
  const send = () => {
    const height = Math.ceil(document.body.getBoundingClientRect().height);
    if (height === last) return;
    last = height;
    bridge.notify("ui/notifications/size-changed", { height });
  };
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(send).observe(document.body);
  send();
}
