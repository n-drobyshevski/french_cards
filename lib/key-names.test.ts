import { describe, expect, it } from "vitest";
import { formatKeys, isMacPlatform } from "./key-names";

describe("formatKeys", () => {
  it("uses Mac glyphs on Apple devices", () => {
    expect(formatKeys("Mod+Enter", true)).toBe("⌘↵");
    expect(formatKeys("Shift+Mod+Enter", true)).toBe("⇧⌘↵");
    expect(formatKeys("Mod+Shift+Enter", true)).toBe("⇧⌘↵");
    expect(formatKeys("Mod+Backspace", true)).toBe("⌘⌫");
    expect(formatKeys("Mod+v", true)).toBe("⌘V");
    expect(formatKeys("Enter", true)).toBe("↵");
    expect(formatKeys("Shift+Down", true)).toBe("⇧↓");
  });

  it("spells modifiers out elsewhere", () => {
    expect(formatKeys("Mod+Enter", false)).toBe("Ctrl+Enter");
    expect(formatKeys("Shift+Mod+Enter", false)).toBe("Ctrl+Shift+Enter");
    expect(formatKeys("Mod+A", false)).toBe("Ctrl+A");
    expect(formatKeys("Enter", false)).toBe("Enter");
  });

  it("names plain keys the same everywhere", () => {
    for (const mac of [true, false]) {
      expect(formatKeys("n", mac)).toBe("N");
      expect(formatKeys("Escape", mac)).toBe("Esc");
      expect(formatKeys("Space", mac)).toBe("Пробел");
      expect(formatKeys("Delete", mac)).toBe("Delete");
      expect(formatKeys("F2", mac)).toBe("F2");
      expect(formatKeys("/", mac)).toBe("/");
    }
  });
});

describe("isMacPlatform", () => {
  it("detects macOS and iOS", () => {
    expect(isMacPlatform({ platform: "MacIntel" })).toBe(true);
    expect(isMacPlatform({ userAgentData: { platform: "macOS" } })).toBe(true);
    expect(isMacPlatform({ platform: "iPad" })).toBe(true);
    expect(isMacPlatform({ platform: "Win32" })).toBe(false);
    expect(isMacPlatform({ platform: "Linux x86_64" })).toBe(false);
    expect(isMacPlatform(undefined)).toBe(false);
  });
});
