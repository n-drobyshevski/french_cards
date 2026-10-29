// A few lines of DOM building for the chat pages (player and review): vanilla TypeScript (no React,
// to stay one small inline script), and every screen is rebuilt from its state on each change.

type Attr = string | number | boolean | null | undefined | ((event: Event) => void);
export type Child = Node | string | null | undefined | false | readonly Child[];

/** `h("p", { class: "q", onclick: fn }, "text", child)`; false / null attributes and children are left out. */
export function h(tag: string, attrs: Record<string, Attr> | null = null, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (typeof value === "function") el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  append(el, children);
  return el;
}

function append(el: HTMLElement, child: Child) {
  if (child === null || child === undefined || child === false) return;
  if (Array.isArray(child)) for (const c of child as readonly Child[]) append(el, c);
  else el.append(child as Node | string);
}

const PATHS = {
  check: "m5 12.5 4.5 4.5L19 7.5",
  close: "M6 6l12 12M18 6 6 18",
  /** The checkbox's tick (Chat-Levels-A, Chat-Words-A). */
  tick: "M20 6 9 17l-5-5",
  timer: "M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM12 9v4l2.5 2M10 2h4",
  chevron: "m6 9 6 6 6-6",
  expand: "M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7",
  collapse: "M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7",
  external: "M7 17 17 7M8 7h9v9",
  dash: "M7 12h10",
  /** «Отменить последний ответ» (the review screen's undo, mockups L-Review-Q-A). */
  undo: "M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
} as const;

export type IconName = keyof typeof PATHS;

/** The app's glyphs (components/ui/Icons and the chat mockups' strokes), stroked in currentColor. */
export function icon(name: IconName, size = 20, stroke = 2, className?: string): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  for (const [k, v] of Object.entries({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": stroke, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) {
    svg.setAttribute(k, String(v));
  }
  if (className) svg.setAttribute("class", className);
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", PATHS[name]);
  svg.append(path);
  return svg;
}
