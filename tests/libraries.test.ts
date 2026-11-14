/**
 * Smoke tests for the third-party libraries the app loads, so a dependency
 * bump that changes an import path or behaviour fails here instead of in the
 * browser. Imports mirror the dynamic imports in src/views/schema.ts and
 * src/app.ts.
 */
import { describe, expect, it } from "vitest";
import JSON5 from "json5";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const schema = {
  type: "object",
  required: ["id", "email"],
  properties: {
    id: { type: "integer", minimum: 1 },
    email: { type: "string", format: "email" },
    when: { type: "string", format: "date-time" },
  },
  additionalProperties: false,
};

describe("ajv (all supported drafts)", async () => {
  const formats = (await import("ajv-formats")).default;
  const drafts = {
    "draft-07": (await import("ajv")).default,
    "2019-09": (await import("ajv/dist/2019")).default,
    "2020-12": (await import("ajv/dist/2020")).default,
  };

  for (const [name, Ctor] of Object.entries(drafts)) {
    it(`validates with ${name} and formats`, () => {
      const ajv = new Ctor({ allErrors: true, strict: false });
      formats(ajv);
      const validate = ajv.compile(schema);
      expect(validate({ id: 1, email: "a@b.co", when: "2026-01-01T00:00:00Z" })).toBe(true);
      expect(validate({ id: 0, email: "nope", extra: 1 })).toBe(false);
      const keywords = validate.errors!.map((e) => e.keyword).sort();
      expect(keywords).toEqual(["additionalProperties", "format", "minimum"]);
    });
  }
});

describe("json5", () => {
  it("parses relaxed syntax", () => {
    expect(JSON5.parse("{a: 1, 'b': [2,], // c\n c: Infinity, d: 0x10}")).toEqual({ a: 1, b: [2], c: Infinity, d: 16 });
  });
});

describe("yaml", () => {
  it("round-trips nested data", () => {
    const value = { a: [1, "two", { three: null }], b: { "key with: colon": true } };
    expect(parseYaml(stringifyYaml(value))).toEqual(value);
  });
});
