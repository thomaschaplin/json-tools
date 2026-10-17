/**
 * Type inference from sample JSON, plus emitters for TypeScript, Zod,
 * JSON Schema, Go, Rust (serde), Python (Pydantic) and Kotlin.
 *
 * Arrays of objects are merged into a single shape: a field that is absent
 * from some items becomes optional, `null` alongside a value becomes nullable,
 * and int + float widens to number. Identical shapes share one named type.
 */

export type StringFormat = "date-time" | "date" | "email" | "uri" | "uuid";

export type T =
  | { k: "any" }
  | { k: "null" }
  | { k: "boolean" }
  | { k: "integer" }
  | { k: "number" }
  | { k: "string"; format?: StringFormat }
  | { k: "array"; item: T }
  | { k: "object"; fields: Map<string, Field>; hint: string }
  | { k: "union"; types: T[] };

export interface Field {
  type: T;
  optional: boolean;
}

function detectFormat(s: string): StringFormat | undefined {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.test(s)) return "date-time";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return "date";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return "uuid";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return "email";
  if (/^https?:\/\/\S+$/.test(s)) return "uri";
  return undefined;
}

export function infer(value: unknown, hint = "Root"): T {
  if (value === null || value === undefined) return { k: "null" };
  if (Array.isArray(value)) {
    let item: T | null = null;
    const itemHint = singular(hint);
    for (const v of value) {
      const t = infer(v, itemHint);
      item = item ? merge(item, t) : t;
    }
    return { k: "array", item: item ?? { k: "any" } };
  }
  switch (typeof value) {
    case "boolean":
      return { k: "boolean" };
    case "number":
      return Number.isInteger(value) ? { k: "integer" } : { k: "number" };
    case "string":
      return { k: "string", format: detectFormat(value) };
    case "object": {
      const fields = new Map<string, Field>();
      for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
        fields.set(key, { type: infer(v, key), optional: false });
      }
      return { k: "object", fields, hint };
    }
  }
  return { k: "any" };
}

function members(t: T): T[] {
  return t.k === "union" ? t.types : [t];
}

export function merge(a: T, b: T): T {
  if (a.k === "any") return b;
  if (b.k === "any") return a;
  if (a.k === b.k) {
    switch (a.k) {
      case "string": {
        const bf = (b as { format?: StringFormat }).format;
        return { k: "string", format: a.format === bf ? a.format : undefined };
      }
      case "array":
        return { k: "array", item: merge(a.item, (b as { item: T }).item) };
      case "object": {
        const bo = b as Extract<T, { k: "object" }>;
        const fields = new Map<string, Field>();
        for (const [key, f] of a.fields) {
          const other = bo.fields.get(key);
          fields.set(key, other
            ? { type: merge(f.type, other.type), optional: f.optional || other.optional }
            : { type: f.type, optional: true });
        }
        for (const [key, f] of bo.fields) if (!a.fields.has(key)) fields.set(key, { type: f.type, optional: true });
        return { k: "object", fields, hint: a.hint };
      }
      case "union":
        return [...(b as { types: T[] }).types].reduce<T>((acc, t) => merge(acc, t), a);
      default:
        return a;
    }
  }
  if ((a.k === "integer" && b.k === "number") || (a.k === "number" && b.k === "integer")) return { k: "number" };
  // Union: fold b's members into a's, merging same-kind members.
  const types = [...members(a)];
  for (const t of members(b)) {
    const i = types.findIndex(
      (x) => x.k === t.k || (x.k === "integer" && t.k === "number") || (x.k === "number" && t.k === "integer"),
    );
    if (i >= 0) types[i] = merge(types[i], t);
    else types.push(t);
  }
  return types.length === 1 ? types[0] : { k: "union", types };
}

/* ---------------------------------------------------------------- naming */

const IRREGULAR: Record<string, string> = { people: "person", children: "child", men: "man", women: "woman", data: "data", news: "news", series: "series" };

export function singular(word: string): string {
  const lower = word.toLowerCase();
  if (IRREGULAR[lower]) return IRREGULAR[lower];
  if (/ies$/i.test(word) && word.length > 4) return word.slice(0, -3) + "y";
  if (/(ss|us|is)$/i.test(word)) return word;
  if (/(ches|shes|xes|zes|sses)$/i.test(word)) return word.slice(0, -2);
  if (/s$/i.test(word) && word.length > 2) return word.slice(0, -1);
  return word + "Item";
}

function words(s: string): string[] {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

export function pascal(s: string): string {
  const w = words(s).map((x) => x[0].toUpperCase() + x.slice(1));
  let out = w.join("") || "Type";
  if (/^\d/.test(out)) out = "T" + out;
  return out;
}

export function camel(s: string): string {
  const p = pascal(s);
  return p[0].toLowerCase() + p.slice(1);
}

export function snake(s: string): string {
  let out = words(s).map((x) => x.toLowerCase()).join("_") || "field";
  if (/^\d/.test(out)) out = "_" + out;
  return out;
}

/** Assigns a unique name to every distinct object shape, in emission order. */
interface Named {
  name: string;
  type: Extract<T, { k: "object" }>;
}

function signature(t: T): string {
  switch (t.k) {
    case "object":
      return `{${[...t.fields].map(([k, f]) => `${k}${f.optional ? "?" : ""}:${signature(f.type)}`).join(",")}}`;
    case "array":
      return `[${signature(t.item)}]`;
    case "union":
      return t.types.map(signature).sort().join("|");
    case "string":
      return "string";
    default:
      return t.k;
  }
}

class Registry {
  readonly list: Named[] = [];
  private bySig = new Map<string, Named>();
  private used = new Set<string>();

  constructor(private readonly reserved: Set<string> = new Set()) {}

  nameFor(t: Extract<T, { k: "object" }>): string {
    return this.bySig.get(signature(t))!.name;
  }

  /** Walk the type, registering objects. `order: "post"` = dependencies first. */
  collect(t: T, order: "pre" | "post", rootName?: string): void {
    const visit = (x: T, forced?: string): void => {
      switch (x.k) {
        case "array":
          visit(x.item);
          return;
        case "union":
          x.types.forEach((y) => visit(y));
          return;
        case "object": {
          const sig = signature(x);
          if (this.bySig.has(sig)) return;
          let base = pascal(forced ?? x.hint);
          let name = base;
          let i = 2;
          while (this.used.has(name) || this.reserved.has(name)) name = `${base}${i++}`;
          this.used.add(name);
          const named = { name, type: x };
          this.bySig.set(sig, named);
          if (order === "pre") this.list.push(named);
          for (const f of x.fields.values()) visit(f.type);
          if (order === "post") this.list.push(named);
        }
      }
    };
    visit(t, rootName);
  }
}

function nullable(t: T): { inner: T; nullable: boolean } {
  if (t.k === "null") return { inner: { k: "any" }, nullable: true };
  if (t.k !== "union") return { inner: t, nullable: false };
  const rest = t.types.filter((x) => x.k !== "null");
  const isNull = rest.length !== t.types.length;
  return { inner: rest.length === 1 ? rest[0] : { k: "union", types: rest }, nullable: isNull };
}

const JS_IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/* ------------------------------------------------------------ TypeScript */

export interface GenOptions {
  rootName?: string;
}

export function toTypeScript(value: unknown, opts: GenOptions = {}): string {
  const root = infer(value, opts.rootName ?? "Root");
  const reg = new Registry();
  reg.collect(root, "pre", opts.rootName ?? "Root");

  const ts = (t: T): string => {
    switch (t.k) {
      case "any":
        return "unknown";
      case "null":
        return "null";
      case "boolean":
        return "boolean";
      case "integer":
      case "number":
        return "number";
      case "string":
        return "string";
      case "array": {
        const inner = ts(t.item);
        return /[|&]/.test(inner) ? `(${inner})[]` : `${inner}[]`;
      }
      case "object":
        return reg.nameFor(t);
      case "union":
        return t.types.map(ts).join(" | ");
    }
  };

  const blocks = reg.list.map(({ name, type }) => {
    const lines = [...type.fields].map(([key, f]) => {
      const k = JS_IDENT.test(key) ? key : JSON.stringify(key);
      return `  ${k}${f.optional ? "?" : ""}: ${ts(f.type)};`;
    });
    return `export interface ${name} {\n${lines.join("\n")}${lines.length ? "\n" : ""}}`;
  });
  if (root.k !== "object") {
    blocks.unshift(`export type ${pascal(opts.rootName ?? "Root")} = ${ts(root)};`);
  }
  return blocks.join("\n\n") + "\n";
}

/* ------------------------------------------------------------------- Zod */

export function toZod(value: unknown, opts: GenOptions = {}): string {
  const rootName = opts.rootName ?? "Root";
  const root = infer(value, rootName);
  const reg = new Registry();
  reg.collect(root, "post", rootName);

  const z = (t: T): string => {
    switch (t.k) {
      case "any":
        return "z.unknown()";
      case "null":
        return "z.null()";
      case "boolean":
        return "z.boolean()";
      case "integer":
        return "z.number().int()";
      case "number":
        return "z.number()";
      case "string":
        switch (t.format) {
          case "date-time":
            return "z.string().datetime({ offset: true })";
          case "date":
            return "z.string().date()";
          case "email":
            return "z.string().email()";
          case "uri":
            return "z.string().url()";
          case "uuid":
            return "z.string().uuid()";
        }
        return "z.string()";
      case "array":
        return `z.array(${z(t.item)})`;
      case "object":
        return `${reg.nameFor(t)}Schema`;
      case "union": {
        const n = nullable(t);
        if (n.nullable && n.inner.k !== "union") return `${z(n.inner)}.nullable()`;
        return `z.union([${t.types.map(z).join(", ")}])`;
      }
    }
  };

  const blocks = reg.list.map(({ name, type }) => {
    const lines = [...type.fields].map(([key, f]) => {
      const k = JS_IDENT.test(key) ? key : JSON.stringify(key);
      return `  ${k}: ${z(f.type)}${f.optional ? ".optional()" : ""},`;
    });
    return `export const ${name}Schema = z.object({\n${lines.join("\n")}${lines.length ? "\n" : ""}});\nexport type ${name} = z.infer<typeof ${name}Schema>;`;
  });
  if (root.k !== "object") {
    const n = pascal(rootName);
    blocks.push(`export const ${n}Schema = ${z(root)};\nexport type ${n} = z.infer<typeof ${n}Schema>;`);
  }
  return `import { z } from "zod";\n\n${blocks.join("\n\n")}\n`;
}

/* ----------------------------------------------------------- JSON Schema */

export function toJsonSchema(value: unknown, opts: { title?: string } = {}): Record<string, unknown> {
  const s = (t: T): Record<string, unknown> => {
    switch (t.k) {
      case "any":
        return {};
      case "null":
        return { type: "null" };
      case "boolean":
        return { type: "boolean" };
      case "integer":
        return { type: "integer" };
      case "number":
        return { type: "number" };
      case "string":
        return t.format ? { type: "string", format: t.format } : { type: "string" };
      case "array":
        return t.item.k === "any" ? { type: "array" } : { type: "array", items: s(t.item) };
      case "object": {
        const properties: Record<string, unknown> = {};
        const required: string[] = [];
        for (const [k, f] of t.fields) {
          properties[k] = s(f.type);
          if (!f.optional) required.push(k);
        }
        const out: Record<string, unknown> = { type: "object", properties };
        if (required.length) out.required = required;
        return out;
      }
      case "union": {
        const simple = t.types.every((x) => !["object", "array", "any"].includes(x.k) && !(x.k === "string" && x.format));
        if (simple) return { type: t.types.map((x) => x.k) };
        return { anyOf: t.types.map(s) };
      }
    }
  };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    ...(opts.title ? { title: opts.title } : {}),
    ...s(infer(value)),
  };
}

/* -------------------------------------------------------------------- Go */

const GO_INITIALISMS = new Set(["id", "url", "uri", "api", "http", "https", "json", "xml", "uuid", "ip", "html", "sql", "ui", "cpu"]);

function goName(key: string): string {
  const parts = words(key);
  if (!parts.length) return "Field";
  let out = parts
    .map((w) => (GO_INITIALISMS.has(w.toLowerCase()) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join("");
  if (/^\d/.test(out)) out = "F" + out;
  return out;
}

export function toGo(value: unknown, opts: GenOptions = {}): string {
  const rootName = opts.rootName ?? "Root";
  const root = infer(value, rootName);
  const reg = new Registry();
  reg.collect(root, "pre", rootName);
  let usesTime = false;

  const go = (t: T): string => {
    switch (t.k) {
      case "any":
      case "union": {
        const n = nullable(t);
        if (t.k === "union" && n.inner.k !== "union" && n.inner.k !== "any") return "*" + go(n.inner).replace(/^\*/, "");
        return "any";
      }
      case "null":
        return "any";
      case "boolean":
        return "bool";
      case "integer":
        return "int64";
      case "number":
        return "float64";
      case "string":
        if (t.format === "date-time") {
          usesTime = true;
          return "time.Time";
        }
        return "string";
      case "array":
        return "[]" + go(t.item);
      case "object":
        return reg.nameFor(t);
    }
  };

  const blocks = reg.list.map(({ name, type }) => {
    const rows = [...type.fields].map(([key, f]) => {
      let typ = go(f.type);
      if (f.optional && !typ.startsWith("*") && !typ.startsWith("[]") && typ !== "any") typ = "*" + typ;
      return [goName(key), typ, `\`json:"${key}${f.optional ? ",omitempty" : ""}"\``];
    });
    const w0 = Math.max(0, ...rows.map((r) => r[0].length));
    const w1 = Math.max(0, ...rows.map((r) => r[1].length));
    const lines = rows.map((r) => `\t${r[0].padEnd(w0)} ${r[1].padEnd(w1)} ${r[2]}`);
    return `type ${name} struct {\n${lines.join("\n")}${lines.length ? "\n" : ""}}`;
  });
  if (root.k !== "object") blocks.unshift(`type ${pascal(rootName)} ${go(root)}`);
  const header = `package main\n\n${usesTime ? 'import "time"\n\n' : ""}`;
  return header + blocks.join("\n\n") + "\n";
}

/* ------------------------------------------------------------------ Rust */

const RUST_KEYWORDS = new Set(["as", "break", "const", "continue", "crate", "else", "enum", "extern", "false", "fn", "for", "if", "impl", "in", "let", "loop", "match", "mod", "move", "mut", "pub", "ref", "return", "self", "static", "struct", "super", "trait", "true", "type", "unsafe", "use", "where", "while", "async", "await", "dyn"]);

export function toRust(value: unknown, opts: GenOptions = {}): string {
  const rootName = opts.rootName ?? "Root";
  const root = infer(value, rootName);
  const reg = new Registry();
  reg.collect(root, "pre", rootName);

  const rs = (t: T): string => {
    switch (t.k) {
      case "any":
      case "null":
        return "serde_json::Value";
      case "boolean":
        return "bool";
      case "integer":
        return "i64";
      case "number":
        return "f64";
      case "string":
        return "String";
      case "array":
        return `Vec<${rs(t.item)}>`;
      case "object":
        return reg.nameFor(t);
      case "union": {
        const n = nullable(t);
        if (n.nullable && n.inner.k !== "union") return `Option<${rs(n.inner)}>`;
        return "serde_json::Value";
      }
    }
  };

  const blocks = reg.list.map(({ name, type }) => {
    const lines: string[] = [];
    for (const [key, f] of type.fields) {
      let field = snake(key);
      if (RUST_KEYWORDS.has(field)) field = `r#${field}`;
      if (field !== key) lines.push(`    #[serde(rename = ${JSON.stringify(key)})]`);
      let typ = rs(f.type);
      if (f.optional && !typ.startsWith("Option<")) {
        lines.push(`    #[serde(skip_serializing_if = "Option::is_none")]`);
        typ = `Option<${typ}>`;
      }
      lines.push(`    pub ${field}: ${typ},`);
    }
    return `#[derive(Debug, Clone, Serialize, Deserialize)]\npub struct ${name} {\n${lines.join("\n")}${lines.length ? "\n" : ""}}`;
  });
  if (root.k !== "object") blocks.unshift(`pub type ${pascal(rootName)} = ${rs(root)};`);
  return `use serde::{Deserialize, Serialize};\n\n${blocks.join("\n\n")}\n`;
}

/* ---------------------------------------------------------------- Python */

const PY_KEYWORDS = new Set(["False", "None", "True", "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del", "elif", "else", "except", "finally", "for", "from", "global", "if", "import", "in", "is", "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "try", "while", "with", "yield"]);

export function toPython(value: unknown, opts: GenOptions = {}): string {
  const rootName = opts.rootName ?? "Root";
  const root = infer(value, rootName);
  const reg = new Registry();
  reg.collect(root, "post", rootName);
  const imports = new Set<string>();

  const py = (t: T): string => {
    switch (t.k) {
      case "any":
        imports.add("Any");
        return "Any";
      case "null":
        return "None";
      case "boolean":
        return "bool";
      case "integer":
        return "int";
      case "number":
        return "float";
      case "string":
        if (t.format === "date-time") {
          imports.add("datetime");
          return "datetime";
        }
        return "str";
      case "array":
        return `list[${py(t.item)}]`;
      case "object":
        return reg.nameFor(t);
      case "union":
        return t.types.map(py).join(" | ");
    }
  };

  let needsField = false;
  const blocks = reg.list.map(({ name, type }) => {
    const lines = [...type.fields].map(([key, f]) => {
      let field = snake(key);
      if (PY_KEYWORDS.has(field)) field += "_";
      let typ = py(f.type);
      const alias = field !== key;
      if (f.optional && !/\bNone\b/.test(typ)) typ += " | None";
      if (alias) {
        needsField = true;
        return `    ${field}: ${typ} = Field(${f.optional ? "None, " : ""}alias=${JSON.stringify(key)})`;
      }
      return `    ${field}: ${typ}${f.optional ? " = None" : ""}`;
    });
    return `class ${name}(BaseModel):\n${lines.length ? lines.join("\n") : "    pass"}`;
  });
  if (root.k !== "object") blocks.push(`${pascal(rootName)} = ${py(root)}`);

  const head: string[] = ["from __future__ import annotations", ""];
  if (imports.has("datetime")) head.push("from datetime import datetime");
  if (imports.has("Any")) head.push("from typing import Any");
  head.push(`from pydantic import BaseModel${needsField ? ", Field" : ""}`);
  return `${head.join("\n")}\n\n\n${blocks.join("\n\n\n")}\n`;
}

/* ---------------------------------------------------------------- Kotlin */

export function toKotlin(value: unknown, opts: GenOptions = {}): string {
  const rootName = opts.rootName ?? "Root";
  const root = infer(value, rootName);
  const reg = new Registry();
  reg.collect(root, "pre", rootName);

  const kt = (t: T): string => {
    switch (t.k) {
      case "any":
      case "null":
        return "JsonElement?";
      case "boolean":
        return "Boolean";
      case "integer":
        return "Long";
      case "number":
        return "Double";
      case "string":
        return "String";
      case "array":
        return `List<${kt(t.item)}>`;
      case "object":
        return reg.nameFor(t);
      case "union": {
        const n = nullable(t);
        if (n.nullable && n.inner.k !== "union") return `${kt(n.inner)}?`;
        return "JsonElement";
      }
    }
  };

  const blocks = reg.list.map(({ name, type }) => {
    const lines = [...type.fields].map(([key, f]) => {
      const field = camel(key);
      let typ = kt(f.type);
      if (f.optional && !typ.endsWith("?")) typ += "?";
      const ann = field !== key ? `@SerialName(${JSON.stringify(key)}) ` : "";
      return `    ${ann}val ${field}: ${typ}${f.optional ? " = null" : ""},`;
    });
    return `@Serializable\ndata class ${name}(\n${lines.join("\n")}\n)`;
  });
  if (root.k !== "object") blocks.unshift(`typealias ${pascal(rootName)} = ${kt(root)}`);
  return `import kotlinx.serialization.SerialName\nimport kotlinx.serialization.Serializable\nimport kotlinx.serialization.json.JsonElement\n\n${blocks.join("\n\n")}\n`;
}
