import { describe, expect, it } from "vitest";
import { cleanField, cleanFields } from "./clean";
import { ANKI_FIELD_CHARS, ANKI_FIELDS_MAX } from "./types";

describe("cleanField", () => {
  it("turns line-break and block tags into single newlines and drops other tags", () => {
    expect(cleanField("<b>la thune</b><br>money<br/><br />")).toBe("la thune\nmoney");
    expect(cleanField("avoir la flemme<div>être paresseux</div><div><i>fam.</i></div>")).toBe(
      "avoir la flemme\nêtre paresseux\nfam.",
    );
    expect(cleanField("<ul><li>un</li><li>deux</li></ul><p>trois</p>")).toBe("un\ndeux\ntrois");
    expect(cleanField('<span style="color: red">rouge</span>')).toBe("rouge");
  });

  it("decodes named and numeric entities", () => {
    expect(cleanField("caf&eacute; &amp; cr&egrave;me&nbsp;br&ucirc;l&eacute;e")).toBe("café & crème brûlée");
    expect(cleanField("&lt;b&gt; is &quot;bold&quot; &#39;x&#39; &#x2014; &laquo;ok&raquo;")).toBe("<b> is \"bold\" 'x' — «ok»");
    expect(cleanField("&unknown; &#xD800;")).toBe("&unknown; &#xD800;");
  });

  it("keeps a lone «<» that is not a tag", () => {
    expect(cleanField("a < b > c")).toBe("a < b > c");
  });

  it("drops sound, images, scripts and comments", () => {
    expect(cleanField('meuf [sound:meuf.mp3]<img src="meuf.jpg">')).toBe("meuf");
    expect(cleanField("<style>.x{}</style>mec<!-- note --><script>alert(1)</script>")).toBe("mec");
  });

  it("reduces cloze markup to its answer", () => {
    expect(cleanField("J'ai {{c1::kiffé}} ce film")).toBe("J'ai kiffé ce film");
    expect(cleanField("{{c1::bouffer::manger}} et {{c2::pioncer}}")).toBe("bouffer et pioncer");
    expect(cleanField("{{c1::avoir {{c2::la dalle}}}}")).toBe("avoir la dalle");
  });

  it("collapses whitespace and trims each line", () => {
    expect(cleanField("  un   deux \t trois  <br>   <br>  quatre  ")).toBe("un deux trois\nquatre");
    expect(cleanField("ligne\nsource")).toBe("ligne source"); // a newline in HTML source is a space
    expect(cleanField("   ")).toBe("");
  });

  it("keeps newlines and «&» as written in plain text", () => {
    expect(cleanField("un\r\n\r\n  deux &amp; <b>", { html: false })).toBe("un\ndeux &amp; <b>");
  });

  it("truncates long fields with an ellipsis", () => {
    const long = "a".repeat(ANKI_FIELD_CHARS + 50);
    const out = cleanField(long);
    expect(out).toHaveLength(ANKI_FIELD_CHARS);
    expect(out.endsWith("…")).toBe(true);
    expect(cleanField("a".repeat(ANKI_FIELD_CHARS))).toHaveLength(ANKI_FIELD_CHARS);
    // Never splits an emoji.
    const emoji = cleanField("a".repeat(ANKI_FIELD_CHARS - 2) + "😀".repeat(5));
    expect(emoji).toBe("a".repeat(ANKI_FIELD_CHARS - 2) + "…");
  });
});

describe("cleanFields", () => {
  it("pairs names with cleaned values, drops empties and caps the count", () => {
    expect(cleanFields(["Front", "Back", "Audio"], ["la thune", "деньги", "[sound:x.mp3]"])).toEqual([
      { name: "Front", text: "la thune" },
      { name: "Back", text: "деньги" },
    ]);
    expect(cleanFields(["Front"], ["a", "b"])).toEqual([
      { name: "Front", text: "a" },
      { name: "Поле 2", text: "b" },
    ]);
    const many = cleanFields(
      [],
      Array.from({ length: ANKI_FIELDS_MAX + 3 }, (_, i) => `v${i}`),
    );
    expect(many).toHaveLength(ANKI_FIELDS_MAX);
  });
});
