import { describe, expect, it } from "vitest";
import { parse } from "../src/lib/parse";
import { byteLength, computeStats, formatBytes, formatCount } from "../src/lib/stats";
import { decodeShare, encodeShare } from "../src/lib/share";

const ast = (text: string) => {
  const r = parse(text);
  if (!r.ok) throw new Error(r.error.message);
  return r.ast;
};

describe("stats", () => {
  it("counts every node type, depth and keys", () => {
    const text = '{\n"a":[1,2,3],\n"b":{"a":"x","c":null},\n"d":true\n}';
    const s = computeStats(ast(text), text);
    expect(s).toMatchObject({
      lines: 5,
      depth: 3,
      objects: 2,
      arrays: 1,
      strings: 1,
      numbers: 3,
      booleans: 1,
      nulls: 1,
      keys: 5,
      uniqueKeys: 4,
      longestArray: 3,
    });
    expect(s.topKeys[0]).toEqual(["a", 2]);
    expect(s.bytes).toBe(text.length);
  });

  it("measures UTF-8 bytes, not UTF-16 code units", () => {
    expect(byteLength("é")).toBe(2);
    expect(byteLength("😀")).toBe(4);
  });

  it("formats sizes and counts", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(20480)).toBe("20 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.00 MB");
    expect(formatCount(1234567)).toBe("1,234,567");
  });
});

describe("share links", () => {
  it("round-trips text, including unicode, through a URL-safe fragment", async () => {
    const text = JSON.stringify({ name: "Zoë", emoji: "🚀", list: Array.from({ length: 200 }, (_, i) => i) });
    const encoded = await encodeShare(text);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded.length).toBeLessThan(text.length);
    expect(await decodeShare(encoded)).toBe(text);
  });

  it("handles empty and large documents", async () => {
    expect(await decodeShare(await encodeShare(""))).toBe("");
    const big = "x".repeat(200_000);
    expect(await decodeShare(await encodeShare(big))).toBe(big);
  });
});
