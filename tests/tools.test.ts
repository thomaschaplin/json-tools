import { describe, expect, it } from "vitest";
import { query } from "../src/lib/jsonpath";
import { diffLines, diffValues } from "../src/lib/diff";
import { toCsv, fromCsv, toYaml, fromYaml, toXml, toToml, decodeJwt, fromQueryString, toMarkdownTable } from "../src/lib/convert";
import { toTypeScript, toZod, toGo, toJsonSchema, toRust, toPython, toKotlin } from "../src/lib/codegen";
import { flatten, unflatten } from "../src/lib/format";

const store = {
  store: {
    book: [
      { category: "reference", author: "Nigel Rees", title: "Sayings of the Century", price: 8.95 },
      { category: "fiction", author: "Evelyn Waugh", title: "Sword of Honour", price: 12.99 },
      { category: "fiction", author: "Herman Melville", title: "Moby Dick", isbn: "0-553-21311-3", price: 8.99 },
      { category: "fiction", author: "J. R. R. Tolkien", title: "The Lord of the Rings", isbn: "0-395-19395-8", price: 22.99 },
    ],
    bicycle: { color: "red", price: 19.95 },
  },
};

describe("jsonpath", () => {
  const vals = (q: string) => query(store, q).map((m) => m.value);
  it("supports the classic examples", () => {
    expect(vals("$.store.book[*].author")).toHaveLength(4);
    expect(vals("$..author")).toHaveLength(4);
    expect(vals("$.store.*")).toHaveLength(2);
    expect(vals("$..price")).toHaveLength(5);
    expect(vals("$..book[2].title")).toEqual(["Moby Dick"]);
    expect(vals("$..book[-1].title")).toEqual(["The Lord of the Rings"]);
    expect(vals("$..book[0,1].title")).toEqual(["Sayings of the Century", "Sword of Honour"]);
    expect(vals("$..book[:2].title")).toHaveLength(2);
    expect(vals("$..book[?(@.isbn)].title")).toEqual(["Moby Dick", "The Lord of the Rings"]);
    expect(vals("$..book[?(@.price < 10)].price")).toEqual([8.95, 8.99]);
    expect(vals("$..book[?(@.category == 'fiction' && @.price > 20)].title")).toEqual(["The Lord of the Rings"]);
    expect(vals("$..book[?(@.title =~ /lord/i)].price")).toEqual([22.99]);
    expect(vals("$.store.book.length")).toEqual([4]);
    expect(vals("store.bicycle.color")).toEqual(["red"]);
    expect(vals("$..book[?(@.category in ['reference'])].author")).toEqual(["Nigel Rees"]);
    expect(vals("$..book[::-1].price")[0]).toBe(22.99);
  });
  it("returns paths", () => {
    expect(query(store, "$..bicycle.color")[0].path).toEqual(["store", "bicycle", "color"]);
  });
  it("throws helpful errors", () => {
    expect(() => query(store, "$.store[")).toThrow();
  });
});

describe("diff", () => {
  it("finds structural changes", () => {
    const changes = diffValues({ a: 1, b: [1, 2], c: { d: "x" } }, { a: 2, b: [1], c: { d: "x", e: true }, f: null });
    expect(changes.map((c) => `${c.kind}:${c.path.join(".")}`)).toEqual(["changed:a", "removed:b.1", "added:c.e", "added:f"]);
  });
  it("matches arrays by key", () => {
    const a = [{ id: 1, v: "a" }, { id: 2, v: "b" }];
    const b = [{ id: 2, v: "B" }, { id: 1, v: "a" }];
    expect(diffValues(a, b, { arrayKey: "id" }).map((c) => c.kind)).toEqual(["changed"]);
  });
  it("diffs lines", () => {
    const ops = diffLines("a\nb\nc\nd", "a\nc\nd\ne");
    expect(ops.map((o) => o.op[0] + o.text).join(" ")).toBe("ea db ec ed ie");
  });
});

describe("convert", () => {
  const rows = [{ id: 1, name: "Ada, L", meta: { admin: true } }, { id: 2, name: 'Bob "B"', extra: null }];
  it("round-trips CSV", () => {
    const csv = toCsv(rows);
    expect(csv.split("\n")[0]).toBe("id,name,meta.admin,extra");
    expect(fromCsv(csv)).toEqual([{ id: 1, name: "Ada, L", meta: { admin: true }, extra: null }, { id: 2, name: 'Bob "B"', meta: { admin: null }, extra: null }]);
  });
  it("round-trips YAML", () => {
    expect(fromYaml(toYaml(store))).toEqual(store);
  });
  it("converts to XML / TOML / Markdown", () => {
    expect(toXml({ a: { "@id": 1, b: [1, 2] } })).toContain('<a id="1">\n  <b>1</b>\n  <b>2</b>\n</a>');
    expect(toToml({ title: "x", owner: { name: "y" }, items: [{ a: 1 }] })).toBe('title = "x"\n\n[owner]\nname = "y"\n\n[[items]]\na = 1\n');
    expect(toMarkdownTable([{ a: 1, b: "x|y" }])).toContain("| 1 | x\\|y |");
  });
  it("decodes JWTs and query strings", () => {
    const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    expect(decodeJwt(jwt).payload).toEqual({ sub: "1234567890", name: "John Doe", iat: 1516239022 });
    expect(fromQueryString("https://x.dev/?a=1&b=two&a=3")).toEqual({ a: [1, 3], b: "two" });
  });
  it("flattens and unflattens", () => {
    const v = { a: { b: [1, { c: 2 }] } };
    expect(flatten(v)).toEqual({ "a.b.0": 1, "a.b.1.c": 2 });
    expect(unflatten(flatten(v))).toEqual(v);
  });
});

describe("codegen", () => {
  const data = { users: [{ id: 1, name: "Ada", email: "ada@x.dev", tags: ["a"] }, { id: 2, name: "Bob", email: null, score: 1.5, tags: [] }] };
  it("generates TypeScript", () => {
    expect(toTypeScript(data)).toBe(
      "export interface Root {\n  users: User[];\n}\n\nexport interface User {\n  id: number;\n  name: string;\n  email: string | null;\n  tags: string[];\n  score?: number;\n}\n",
    );
  });
  it("generates other languages", () => {
    expect(toZod(data)).toContain("email: z.string().email().nullable(),");
    expect(toGo(data)).toContain("ID    int64    `json:\"id\"`");
    expect(toRust(data)).toContain("pub score: Option<f64>,");
    expect(toPython(data)).toContain("score: float | None = None");
    expect(toKotlin(data)).toContain("val score: Double? = null,");
    const schema = toJsonSchema(data) as { properties: { users: { items: { required: string[] } } } };
    expect(schema.properties.users.items.required).toEqual(["id", "name", "email", "tags"]);
  });
});
