import { describe, expect, it } from "vitest";
import { dragHasFiles, handOffImages, imagesFrom, takeHandedOffImages } from "./clipboard";

const png = (name = "a.png") => new File([new Uint8Array([1])], name, { type: "image/png" });

describe("imagesFrom", () => {
  it("prefers files, falls back to file items", () => {
    const a = png();
    expect(imagesFrom({ files: [a] })).toEqual([a]);
    const b = png("b.png");
    expect(
      imagesFrom({
        files: [],
        items: [
          { kind: "string", getAsFile: () => null },
          { kind: "file", getAsFile: () => b },
        ],
      }),
    ).toEqual([b]);
    expect(imagesFrom(null)).toEqual([]);
  });
});

describe("dragHasFiles", () => {
  it("is true only for drags that carry files", () => {
    expect(dragHasFiles({ types: ["Files"] })).toBe(true);
    expect(dragHasFiles({ types: ["text/plain", "application/x-kartochki-words"] })).toBe(false);
    expect(dragHasFiles(null)).toBe(false);
  });
});

describe("hand-over to /import", () => {
  it("is taken once", () => {
    const a = png();
    handOffImages([a]);
    expect(takeHandedOffImages()).toEqual([a]);
    expect(takeHandedOffImages()).toEqual([]);
  });
});
