import YAML from "yaml";
import { flatten, unflatten } from "./format";

/* ------------------------------------------------------------------ YAML */

export function toYaml(value: unknown): string {
  return YAML.stringify(value, { lineWidth: 0, aliasDuplicateObjects: false });
}

export function fromYaml(text: string): unknown {
  const docs = YAML.parseAllDocuments(text);
  const values = docs.map((d) => {
    if (d.errors.length) throw new Error(d.errors[0].message);
    return d.toJS({ maxAliasCount: 1000 });
  });
  return values.length === 1 ? values[0] : values;
}

/* ------------------------------------------------------------------- CSV */

export interface CsvOptions {
  delimiter?: string;
  /** Flatten nested objects into dotted column names (default true). */
  flatten?: boolean;
}

function csvCell(v: unknown, delimiter: string): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.includes(delimiter) || /["\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(value: unknown, options: CsvOptions = {}): string {
  const delimiter = options.delimiter ?? ",";
  const rowsIn = Array.isArray(value) ? value : [value];
  const rows = rowsIn.map((r): Record<string, unknown> =>
    r !== null && typeof r === "object" && !Array.isArray(r)
      ? options.flatten === false
        ? (r as Record<string, unknown>)
        : flatten(r)
      : { value: r },
  );
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const r of rows)
    for (const k of Object.keys(r))
      if (!seen.has(k)) {
        seen.add(k);
        headers.push(k);
      }
  const lines = [headers.map((h) => csvCell(h, delimiter)).join(delimiter)];
  for (const r of rows) lines.push(headers.map((h) => csvCell(r[h], delimiter)).join(delimiter));
  return lines.join("\n") + "\n";
}

/** RFC 4180 CSV parser. */
export function parseCsvRows(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  while (i < src.length) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      cell += c;
      i++;
      continue;
    }
    if (c === '"' && cell === "") {
      quoted = true;
      i++;
      continue;
    }
    if (c === delimiter) {
      row.push(cell);
      cell = "";
      i++;
      continue;
    }
    if (c === "\n" || c === "\r") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += c === "\r" && src[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    cell += c;
    i++;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

export function guessDelimiter(text: string): string {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = [",", "\t", ";", "|"].map((d) => [d, first.split(d).length] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 1 ? counts[0][0] : ",";
}

function typed(s: string): unknown {
  if (s === "") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null") return null;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(s) && Number.isFinite(Number(s))) {
    const n = Number(s);
    if (Number.isSafeInteger(n) || !/^-?\d+$/.test(s)) return n;
  }
  return s;
}

export function fromCsv(text: string, options: { delimiter?: string; inferTypes?: boolean } = {}): unknown[] {
  const delimiter = options.delimiter ?? guessDelimiter(text);
  const [header, ...body] = parseCsvRows(text, delimiter);
  if (!header) return [];
  const infer = options.inferTypes !== false;
  const nested = header.some((h) => h.includes("."));
  return body.map((cells) => {
    const obj: Record<string, unknown> = {};
    header.forEach((h, i) => {
      const raw = cells[i] ?? "";
      obj[h] = infer ? typed(raw) : raw;
    });
    return nested ? unflatten(obj) : obj;
  });
}

/* ------------------------------------------------------------------- XML */

function xmlName(key: string): string {
  let n = key.replace(/[^A-Za-z0-9_.\-]/g, "_");
  if (!/^[A-Za-z_]/.test(n)) n = "_" + n;
  return n;
}

function xmlEscape(s: string, attr = false): string {
  const out = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return attr ? out.replace(/"/g, "&quot;") : out;
}

export function toXml(value: unknown, rootName = "root"): string {
  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];
  const el = (name: string, v: unknown, pad: string): void => {
    const tag = xmlName(name);
    if (Array.isArray(v)) {
      for (const item of v) el(name === rootName && pad === "" ? "item" : name, item, pad);
      return;
    }
    if (v === null || v === undefined) {
      lines.push(`${pad}<${tag}/>`);
      return;
    }
    if (typeof v !== "object") {
      lines.push(`${pad}<${tag}>${xmlEscape(String(v))}</${tag}>`);
      return;
    }
    const entries = Object.entries(v as Record<string, unknown>);
    const attrs = entries
      .filter(([k, x]) => k.startsWith("@") && (x === null || typeof x !== "object"))
      .map(([k, x]) => ` ${xmlName(k.slice(1))}="${xmlEscape(String(x ?? ""), true)}"`)
      .join("");
    const text = entries.find(([k]) => k === "#text");
    const kids = entries.filter(([k]) => !k.startsWith("@") && k !== "#text");
    if (!kids.length) {
      if (text) lines.push(`${pad}<${tag}${attrs}>${xmlEscape(String(text[1]))}</${tag}>`);
      else lines.push(`${pad}<${tag}${attrs}/>`);
      return;
    }
    lines.push(`${pad}<${tag}${attrs}>`);
    if (text) lines.push(`${pad}  ${xmlEscape(String(text[1]))}`);
    for (const [k, x] of kids) el(k, x, pad + "  ");
    lines.push(`${pad}</${tag}>`);
  };
  if (Array.isArray(value)) {
    lines.push(`<${xmlName(rootName)}>`);
    for (const item of value) el("item", item, "  ");
    lines.push(`</${xmlName(rootName)}>`);
  } else if (value !== null && typeof value === "object" && Object.keys(value).length === 1 && !Array.isArray(Object.values(value)[0])) {
    const [k, v] = Object.entries(value)[0];
    el(k, v, "");
  } else {
    el(rootName, value, "");
  }
  return lines.join("\n") + "\n";
}

export function fromXml(text: string): unknown {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const err = doc.querySelector("parsererror");
  if (err) throw new Error((err.textContent ?? "Invalid XML").split("\n")[0]);
  const convert = (node: Element): unknown => {
    const out: Record<string, unknown> = {};
    for (const a of Array.from(node.attributes)) out[`@${a.name}`] = typed(a.value);
    const elements = Array.from(node.children);
    const text = Array.from(node.childNodes)
      .filter((n) => n.nodeType === 3 || n.nodeType === 4)
      .map((n) => n.textContent ?? "")
      .join("")
      .trim();
    if (!elements.length) {
      if (!node.attributes.length) return text === "" ? null : typed(text);
      if (text) out["#text"] = typed(text);
      return out;
    }
    const multi = new Set<string>();
    for (const child of elements) {
      const v = convert(child);
      const k = child.tagName;
      if (multi.has(k)) (out[k] as unknown[]).push(v);
      else if (k in out) {
        out[k] = [out[k], v];
        multi.add(k);
      } else out[k] = v;
    }
    if (text) out["#text"] = typed(text);
    return out;
  };
  const root = doc.documentElement;
  return { [root.tagName]: convert(root) };
}

/* -------------------------------------------------------------- Markdown */

export function toMarkdownTable(value: unknown): string {
  const rows = (Array.isArray(value) ? value : [value]).map((r): Record<string, unknown> =>
    r !== null && typeof r === "object" && !Array.isArray(r) ? flatten(r) : { value: r },
  );
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v: unknown) =>
    v === undefined ? "" : String(typeof v === "object" ? JSON.stringify(v) : v).replace(/\|/g, "\\|").replace(/\n/g, "<br>");
  const out = [
    `| ${headers.map(cell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${headers.map((h) => cell(r[h])).join(" | ")} |`),
  ];
  return out.join("\n") + "\n";
}

/* ------------------------------------------------------------------ TOML */

const TOML_BARE = /^[A-Za-z0-9_-]+$/;
const tomlKey = (k: string) => (TOML_BARE.test(k) ? k : JSON.stringify(k));

function tomlValue(v: unknown): string {
  if (v === null || v === undefined) throw new Error("TOML has no null — remove or replace null values first");
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v).includes(".") || String(v).includes("e") ? String(v) : `${v}.0`;
  if (typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.map(tomlValue).join(", ")}]`;
  return `{ ${Object.entries(v as Record<string, unknown>).map(([k, x]) => `${tomlKey(k)} = ${tomlValue(x)}`).join(", ")} }`;
}

const isTable = (v: unknown) => v !== null && typeof v === "object" && !Array.isArray(v);
const isTableArray = (v: unknown) => Array.isArray(v) && v.length > 0 && v.every(isTable);

export function toToml(value: unknown): string {
  if (!isTable(value)) throw new Error("TOML documents must be an object at the top level");
  const out: string[] = [];
  const table = (obj: Record<string, unknown>, prefix: string[]): void => {
    const simple = Object.entries(obj).filter(([, v]) => !isTable(v) && !isTableArray(v));
    const nested = Object.entries(obj).filter(([, v]) => isTable(v) || isTableArray(v));
    for (const [k, v] of simple) out.push(`${tomlKey(k)} = ${tomlValue(v)}`);
    for (const [k, v] of nested) {
      const path = [...prefix, k];
      const name = path.map(tomlKey).join(".");
      if (isTableArray(v)) {
        for (const item of v as Record<string, unknown>[]) {
          out.push("", `[[${name}]]`);
          table(item, path);
        }
      } else {
        out.push("", `[${name}]`);
        table(v as Record<string, unknown>, path);
      }
    }
  };
  table(value as Record<string, unknown>, []);
  return out.join("\n").replace(/^\n+/, "") + "\n";
}

/* ---------------------------------------------------------- Query string */

export function toQueryString(value: unknown): string {
  if (!isTable(value)) throw new Error("Only objects can be encoded as a query string");
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(flatten(value))) {
    params.append(k, v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  return params.toString();
}

export function fromQueryString(text: string): Record<string, unknown> {
  let q = text.trim();
  const qi = q.indexOf("?");
  if (qi >= 0) q = q.slice(qi + 1);
  q = q.split("#")[0];
  const out: Record<string, unknown> = {};
  for (const [k, v] of new URLSearchParams(q)) {
    const val = typed(v);
    if (k in out) {
      const cur = out[k];
      out[k] = Array.isArray(cur) ? [...cur, val] : [cur, val];
    } else out[k] = val;
  }
  return out;
}

/* ------------------------------------------------------------------- JWT */

function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function decodeJwt(token: string): { header: unknown; payload: unknown; signature: string } {
  const parts = token.trim().replace(/^Bearer\s+/i, "").split(".");
  if (parts.length < 2) throw new Error("A JWT has three dot-separated parts: header.payload.signature");
  try {
    return {
      header: JSON.parse(b64urlDecode(parts[0])),
      payload: JSON.parse(b64urlDecode(parts[1])),
      signature: parts[2] ?? "",
    };
  } catch {
    throw new Error("Could not decode the token — is it a valid JWT?");
  }
}

/* --------------------------------------------------------------- NDJSON */

export function fromNdjson(text: string): unknown[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      try {
        return JSON.parse(line);
      } catch (e) {
        throw new Error(`Line ${i + 1}: ${(e as Error).message}`);
      }
    });
}

export function toNdjson(value: unknown): string {
  const rows = Array.isArray(value) ? value : [value];
  return rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
}
