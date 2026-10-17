import type { JsonNode, Prop } from "./parse";

export type Indent = number | "\t";

export interface PrintOptions {
  /** Spaces per level, or a tab. 0 = minified. */
  indent?: Indent;
  /** Keep small containers on one line when they fit within this width (0 = never). */
  inlineWidth?: number;
}

function unit(indent: Indent): string {
  return indent === "\t" ? "\t" : " ".repeat(indent);
}

function str(s: string): string {
  return JSON.stringify(s);
}

function prim(n: JsonNode): string {
  switch (n.type) {
    case "string":
      return str(n.value);
    case "number":
      return n.raw;
    case "boolean":
      return n.value ? "true" : "false";
    default:
      return "null";
  }
}

/** Print an AST as compact JSON (lossless for numbers). */
export function minify(node: JsonNode): string {
  const walk = (n: JsonNode): string => {
    if (n.type === "object") {
      let out = "{";
      const props = n.props;
      for (let i = 0; i < props.length; i++) {
        if (i) out += ",";
        out += str(props[i].key) + ":" + walk(props[i].value);
      }
      return out + "}";
    }
    if (n.type === "array") {
      let out = "[";
      const items = n.items;
      for (let i = 0; i < items.length; i++) {
        if (i) out += ",";
        out += walk(items[i]);
      }
      return out + "]";
    }
    return prim(n);
  };
  return walk(node);
}

/** Single-line form with a space after ':' and ',' — used for inline containers. */
function inline(node: JsonNode): string {
  switch (node.type) {
    case "object":
      return node.props.length
        ? `{ ${node.props.map((p) => `${str(p.key)}: ${inline(p.value)}`).join(", ")} }`
        : "{}";
    case "array":
      return `[${node.items.map(inline).join(", ")}]`;
    default:
      return minify(node);
  }
}

export function print(node: JsonNode, options: PrintOptions = {}): string {
  const indent = options.indent ?? 2;
  if (indent === 0) return minify(node);
  const step = unit(indent);
  const width = options.inlineWidth ?? 0;

  const walk = (n: JsonNode, pad: string): string => {
    if (n.type !== "object" && n.type !== "array") return prim(n);
    const empty = n.type === "object" ? n.props.length === 0 : n.items.length === 0;
    if (empty) return n.type === "object" ? "{}" : "[]";
    if (width > 0) {
      const one = inline(n);
      if (one.length + pad.length <= width) return one;
    }
    const inner = pad + step;
    let out: string;
    if (n.type === "object") {
      out = "{\n";
      const props = n.props;
      for (let i = 0; i < props.length; i++) {
        out += inner + str(props[i].key) + ": " + walk(props[i].value, inner) + (i < props.length - 1 ? ",\n" : "\n");
      }
      return out + pad + "}";
    }
    out = "[\n";
    const items = n.items;
    for (let i = 0; i < items.length; i++) {
      out += inner + walk(items[i], inner) + (i < items.length - 1 ? ",\n" : "\n");
    }
    return out + pad + "]";
  };
  return walk(node, "");
}

export interface SortOptions {
  /** Also sort arrays of primitives. */
  arrays?: boolean;
  descending?: boolean;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function primitiveKey(n: JsonNode): string {
  switch (n.type) {
    case "string":
      return n.value;
    case "number":
      return n.raw;
    case "boolean":
      return String(n.value);
    case "null":
      return "null";
    default:
      return "";
  }
}

/** Deep-sort object keys (and optionally primitive arrays). Returns a new AST. */
export function sortKeys(node: JsonNode, options: SortOptions = {}): JsonNode {
  const dir = options.descending ? -1 : 1;
  const walk = (n: JsonNode): JsonNode => {
    if (n.type === "object") {
      const props: Prop[] = n.props
        .map((p) => ({ ...p, value: walk(p.value) }))
        .sort((a, b) => dir * collator.compare(a.key, b.key));
      return { ...n, props };
    }
    if (n.type === "array") {
      let items = n.items.map(walk);
      if (options.arrays && items.every((i) => i.type !== "object" && i.type !== "array")) {
        items = [...items].sort((a, b) => {
          if (a.type === "number" && b.type === "number") return dir * (a.value - b.value);
          return dir * collator.compare(primitiveKey(a), primitiveKey(b));
        });
      }
      return { ...n, items };
    }
    return n;
  };
  return walk(node);
}

/** Remove null values, empty strings, empty arrays and empty objects (deep). */
export function compact(node: JsonNode): JsonNode {
  const isEmpty = (n: JsonNode): boolean =>
    n.type === "null" ||
    (n.type === "string" && n.value === "") ||
    (n.type === "array" && n.items.length === 0) ||
    (n.type === "object" && n.props.length === 0);
  const walk = (n: JsonNode): JsonNode => {
    if (n.type === "object") {
      return {
        ...n,
        props: n.props.map((p) => ({ ...p, value: walk(p.value) })).filter((p) => !isEmpty(p.value)),
      };
    }
    if (n.type === "array") {
      return { ...n, items: n.items.map(walk).filter((i) => !isEmpty(i)) };
    }
    return n;
  };
  return walk(node);
}

/** Flatten nested objects into a single level of dotted keys. */
export function flatten(value: unknown, separator = "."): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const walk = (v: unknown, prefix: string): void => {
    if (v !== null && typeof v === "object") {
      const entries = Array.isArray(v) ? v.map((x, i) => [String(i), x] as const) : Object.entries(v);
      if (entries.length === 0) {
        if (prefix) out[prefix] = Array.isArray(v) ? [] : {};
        return;
      }
      for (const [k, x] of entries) walk(x, prefix ? `${prefix}${separator}${k}` : k);
      return;
    }
    out[prefix] = v;
  };
  walk(value, "");
  return out;
}

/** Reverse of flatten — numeric segments become array indices. */
export function unflatten(value: Record<string, unknown>, separator = "."): unknown {
  const root: Record<string, unknown> = {};
  for (const [path, v] of Object.entries(value)) {
    const parts = path.split(separator);
    let cur: Record<string, unknown> = root;
    parts.forEach((part, i) => {
      if (i === parts.length - 1) {
        cur[part] = v;
      } else {
        if (cur[part] === null || typeof cur[part] !== "object") {
          cur[part] = /^\d+$/.test(parts[i + 1]) ? [] : {};
        }
        cur = cur[part] as Record<string, unknown>;
      }
    });
  }
  return root;
}

/** Escape a JSON document so it can be embedded as a string literal. */
export function stringifyAsString(text: string): string {
  return JSON.stringify(text);
}

/**
 * Undo `stringifyAsString` — accepts a JSON string literal (with or without
 * surrounding quotes) and returns the inner text.
 */
export function unescapeString(text: string): string {
  const t = text.trim();
  if (t.startsWith('"') && t.endsWith('"')) return JSON.parse(t) as string;
  return JSON.parse(`"${t.replace(/(?<!\\)"/g, '\\"')}"`) as string;
}
