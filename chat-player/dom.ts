// A few lines of DOM building for the chat player: the page is vanilla TypeScript (no React, to stay
// one small inline script), and every screen is rebuilt from its state on each change.

type Attr = string | number | boolean | null | undefined | ((event: Event) => void);
export type Child = Node | string | null | undefined | false;

/** `h("p", { class: "q", onclick: fn }, "text", child)`; false / null attributes and children are left out. */
export function h(tag: string, attrs: Record<string, Attr> | null = null, ...children: (Child | Child[])[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (typeof value === "function") el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child);
  }
  return el;
}

const PATHS = {
  check: "m5 12.5 4.5 4.5L19 7.5",
  close: "M6 6l12 12M18 6 6 18",
} as const;

/** The app's check / close glyphs (components/ui/Icons), stroked in currentColor. */
export function icon(name: keyof typeof PATHS, size = 20, stroke = 2, className?: string): SVGSVGElement {
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
