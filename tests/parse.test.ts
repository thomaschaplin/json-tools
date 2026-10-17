import { describe, expect, it } from "vitest";
import { parse, toValue } from "../src/lib/parse";
import { print, minify, sortKeys } from "../src/lib/format";
import { pathAtOffset, toJsonPath, toPointer, nodeAtPath } from "../src/lib/path";

const ok = (text: string, loose = false) => {
  const r = parse(text, { loose });
  if (!r.ok) throw new Error(r.error.message);
  return r;
};

describe("parse (strict)", () => {
  it("matches JSON.parse on valid input", () => {
    const samples = ['{"a":[1,2,{"b":null}],"c":"x\\n\\u00e9","d":-1.5e3,"e":true}', "[]", '"s"', "0", "null"];
    for (const s of samples) expect(toValue(ok(s).ast)).toEqual(JSON.parse(s));
  });

  it("reports precise errors with line/column", () => {
    const r = parse('{\n  "a": 1,\n  "b": 2,\n}');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toMatch(/Trailing comma/);
      expect(r.error.line).toBe(3);
    }
    const r2 = parse('{"a" 1}');
    expect(!r2.ok && r2.error.message).toMatch(/Expected ':'/);
    const r3 = parse("{a:1}");
    expect(!r3.ok && r3.error.message).toMatch(/double quotes/);
    const r4 = parse("");
    expect(!r4.ok && r4.error.message).toMatch(/empty/);
    const r5 = parse("[1,2");
    expect(!r5.ok && r5.error.message).toMatch(/never closed/);
    const r6 = parse("01");
    expect(r6.ok).toBe(false);
  });

  it("keeps big numbers lossless and warns", () => {
    const r = ok('{"id": 12345678901234567890, "x": 1.10}');
    expect(minify(r.ast)).toBe('{"id":12345678901234567890,"x":1.10}');
    expect(r.warnings[0].message).toMatch(/safe integer/);
  });

  it("warns about duplicate keys", () => {
    expect(ok('{"a":1,"a":2}').warnings[0].message).toMatch(/Duplicate key/);
  });
});

describe("parse (loose / repair)", () => {
  it("repairs common breakage", () => {
    const input = `// config
{
  name: 'demo', /* inline */
  "tags": ["a", "b",],
  enabled: True,
  missing: None
  "count": 0x10,
  "nan": NaN,
}`;
    const r = ok(input, true);
    expect(toValue(r.ast)).toEqual({ name: "demo", tags: ["a", "b"], enabled: true, missing: null, count: 16, nan: null });
    expect(r.fixes.length).toBeGreaterThan(5);
  });

  it("closes unclosed containers and wraps NDJSON", () => {
    expect(toValue(ok('{"a": [1, 2', true).ast)).toEqual({ a: [1, 2] });
    expect(toValue(ok('{"a":1}\n{"a":2}', true).ast)).toEqual([{ a: 1 }, { a: 2 }]);
  });
});

describe("print", () => {
  const ast = ok('{"b":[1,2,{"c":[]}],"a":{}}').ast;
  it("pretty prints with indent", () => {
    expect(print(ast, { indent: 2 })).toBe(JSON.stringify(JSON.parse(minify(ast)), null, 2));
    expect(print(ast, { indent: "\t" })).toBe(JSON.stringify(JSON.parse(minify(ast)), null, "\t"));
  });
  it("inlines short containers", () => {
    expect(print(ast, { indent: 2, inlineWidth: 80 })).toBe('{ "b": [1, 2, { "c": [] }], "a": {} }');
  });
  it("sorts keys deeply", () => {
    expect(minify(sortKeys(ok('{"b":1,"a":{"d":1,"c":2},"k10":0,"k9":0}').ast))).toBe('{"a":{"c":2,"d":1},"b":1,"k9":0,"k10":0}');
  });
});

describe("paths", () => {
  const text = '{"users":[{"name":"Ada"},{"first name":"Bob"}]}';
  const ast = ok(text).ast;
  it("finds the path at an offset", () => {
    const at = pathAtOffset(ast, text.indexOf("Bob"))!;
    expect(at.path).toEqual(["users", 1, "first name"]);
    expect(toJsonPath(at.path)).toBe('$.users[1]["first name"]');
    expect(toPointer(["a/b", "c~d"])).toBe("/a~1b/c~0d");
  });
  it("resolves nodes by path", () => {
    const n = nodeAtPath(ast, ["users", 0, "name"]);
    expect(n?.type === "string" && n.value).toBe("Ada");
  });
});
