import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button, buttonClasses } from "./Button";
import { Chip } from "./Chip";
import { Collapse } from "./Collapse";
import { ICON_NAMES, Icon } from "./Icons";
import { Segmented } from "./Segmented";
import { SlangMeter, slangAbbr, slangAriaLabel } from "./SlangMeter";
import { hidesTabBar, tabForPath } from "./TabBar";
import { Toggle } from "./Toggle";

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("SlangMeter", () => {
  it("labels levels in Russian with position and verlan", () => {
    expect(slangAriaLabel(2)).toBe("Уровень сленга: арго, 3 из 4");
    expect(slangAriaLabel(1, true)).toBe("Уровень сленга: фамильярный, 2 из 4, верлан");
    expect(slangAriaLabel(0)).toBe("Уровень сленга: нейтральный, 1 из 4");
  });

  it("abbreviates like a dictionary entry", () => {
    expect(slangAbbr(2)).toBe("arg.");
    expect(slangAbbr(1, true)).toBe("fam. · verl.");
    expect(slangAbbr(3)).toBe("vulg.");
  });

  it("fills segments up to the level, red only for vulg.", () => {
    const arg = renderToStaticMarkup(h(SlangMeter, { level: 2 }));
    expect(count(arg, "bg-ink")).toBe(3);
    expect(count(arg, "bg-rule")).toBe(1);
    expect(arg).toContain("arg.");

    const vulg = renderToStaticMarkup(h(SlangMeter, { level: 3 }));
    expect(count(vulg, "bg-red")).toBe(4);
    expect(vulg).not.toContain("bg-ink");
  });

  it("can render the meter alone", () => {
    const html = renderToStaticMarkup(h(SlangMeter, { level: 1, verlan: true, showLabel: false }));
    expect(html).not.toContain("fam.");
    expect(html).toContain('aria-label="Уровень сленга: фамильярный, 2 из 4, верлан"');
  });
});

describe("Button", () => {
  it("defaults to a 52px primary button of type=button", () => {
    const html = renderToStaticMarkup(h(Button, null, "Показать ответ"));
    expect(html).toContain('type="button"');
    expect(html).toContain("bg-ink");
    expect(html).toContain("h-[52px]");
  });

  it("blocks taps and marks busy while pending, keeping full contrast and both labels in one cell", () => {
    const html = renderToStaticMarkup(h(Button, { pending: true, pendingLabel: "Добавляем…" }, "Добавить"));
    expect(html).not.toContain(`disabled=""`);
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("data-blocked");
    expect(html).toContain("Добавить<");
    expect(html).toContain("Добавляем…");
  });

  it("exposes classes for links", () => {
    expect(buttonClasses({ variant: "secondary", block: true })).toContain("w-full");
    expect(buttonClasses({ variant: "danger" })).toContain("text-again");
  });
});

describe("Chip", () => {
  it("uses aria-pressed by default and aria-checked as a radio", () => {
    expect(renderToStaticMarkup(h(Chip, { selected: true }, "Все"))).toContain('aria-pressed="true"');
    const radio = renderToStaticMarkup(h(Chip, { selected: false, role: "radio" }, "Тусовка"));
    expect(radio).toContain('aria-checked="false"');
    expect(radio).not.toContain("aria-pressed");
  });

  it("renders a count and no state attribute for action chips", () => {
    const html = renderToStaticMarkup(h(Chip, { count: 23 }, "К повторению"));
    expect(html).toContain(">23<");
    expect(html).not.toContain("aria-pressed");
  });
});

describe("Toggle and Segmented", () => {
  it("renders a switch", () => {
    const html = renderToStaticMarkup(h(Toggle, { checked: true, onCheckedChange: () => {}, "aria-label": "Свайпы" }));
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    // The thumb sits at the end by translation (it slides there after a tap), and the switch presses in.
    expect(html).toContain("translate-x-5");
    expect(html).toContain("press-sm");
  });

  it("renders a radiogroup with one tabbable option", () => {
    const html = renderToStaticMarkup(
      h(Segmented<"system" | "light" | "dark">, {
        ariaLabel: "Тема оформления",
        value: "light",
        onChange: () => {},
        options: [
          { value: "system", label: "Система" },
          { value: "light", label: "Светлая" },
          { value: "dark", label: "Тёмная" },
        ],
      }),
    );
    expect(html).toContain('role="radiogroup"');
    expect(count(html, 'aria-checked="true"')).toBe(1);
    expect(count(html, 'tabindex="0"')).toBe(1);
  });
});

describe("Collapse", () => {
  it("animates the grid row and takes a closed row out of focus order", () => {
    const open = renderToStaticMarkup(h(Collapse, { open: true, children: "строка" }));
    expect(open).toContain('data-state="open"');
    expect(open).toContain("grid-rows-[1fr]");
    expect(open).not.toContain("inert");
    const closed = renderToStaticMarkup(h(Collapse, { open: false, appear: true, children: "строка" }));
    expect(closed).toContain('data-state="closed"');
    expect(closed).toContain("grid-rows-[0fr]");
    expect(closed).toContain("inert");
    expect(closed).toContain("starting:grid-rows-[0fr]");
  });
});

describe("Icon", () => {
  it("renders every icon as decorative stroke SVG", () => {
    for (const name of ICON_NAMES) {
      const html = renderToStaticMarkup(h(Icon, { name }));
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('stroke="currentColor"');
    }
  });

  it("is labelled when given a label", () => {
    expect(renderToStaticMarkup(h(Icon, { name: "check", label: "Готово" }))).toContain('aria-label="Готово"');
  });
});

describe("TabBar routing", () => {
  it("maps paths to tabs", () => {
    expect(tabForPath("/")).toBe("review");
    expect(tabForPath("/library")).toBe("library");
    expect(tabForPath("/library/abc")).toBe("library");
    expect(tabForPath("/settings")).toBe("library");
    // «Контекст» opens from the Library header, so Библиотека stays active there.
    expect(tabForPath("/context")).toBe("library");
    expect(tabForPath("/exercises")).toBe("exercises");
    expect(tabForPath("/exercises/play")).toBe("exercises");
    expect(tabForPath("/import")).toBeNull();
    expect(tabForPath(null)).toBeNull();
  });

  it("hides on full-screen import and the exercise player", () => {
    expect(hidesTabBar("/import")).toBe(true);
    expect(hidesTabBar("/exercises/play")).toBe(true);
    expect(hidesTabBar("/exercises")).toBe(false);
    expect(hidesTabBar("/library")).toBe(false);
    expect(hidesTabBar("/context")).toBe(false);
    expect(hidesTabBar(null)).toBe(false);
  });
});
