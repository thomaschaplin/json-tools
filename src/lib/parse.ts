/**
 * A hand-written JSON parser that produces a lossless, position-aware AST.
 *
 * Why not just JSON.parse?
 *  - precise, friendly error messages with line/column on every browser
 *  - numbers keep their original lexeme, so big integers and exact decimals
 *    survive formatting untouched (JSON.parse would round 12345678901234567890)
 *  - every node knows its source range, which powers "path at cursor" and
 *    "reveal in editor"
 *  - a `loose` mode tolerates the things people actually paste — comments,
 *    trailing commas, single quotes, unquoted keys, Python literals, missing
 *    commas, unclosed brackets — and records each fix, which is how Repair works.
 */

export interface Range {
  start: number;
  end: number;
}

export interface ObjectNode extends Range {
  type: "object";
  props: Prop[];
}
export interface ArrayNode extends Range {
  type: "array";
  items: JsonNode[];
}
export interface StringNode extends Range {
  type: "string";
  value: string;
}
export interface NumberNode extends Range {
  type: "number";
  /** Canonical JSON lexeme (the source text, normalised in loose mode). */
  raw: string;
  value: number;
}
export interface BooleanNode extends Range {
  type: "boolean";
  value: boolean;
}
export interface NullNode extends Range {
  type: "null";
}

export type JsonNode =
  | ObjectNode
  | ArrayNode
  | StringNode
  | NumberNode
  | BooleanNode
  | NullNode;

export interface Prop {
  key: string;
  keyStart: number;
  keyEnd: number;
  value: JsonNode;
}

export interface Issue {
  message: string;
  offset: number;
  line: number;
  column: number;
}

export interface ParseSuccess {
  ok: true;
  ast: JsonNode;
  /** Non-fatal observations (duplicate keys, unsafe integers). */
  warnings: Issue[];
  /** Loose mode only: every repair that was applied. */
  fixes: Issue[];
}

export interface ParseFailure {
  ok: false;
  error: Issue;
}

export type ParseResult = ParseSuccess | ParseFailure;

export interface ParseOptions {
  loose?: boolean;
}

class ParseError extends Error {
  constructor(
    message: string,
    readonly offset: number,
  ) {
    super(message);
  }
}

/** Convert an offset into a 1-based line and column. */
export function lineCol(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  const end = Math.min(offset, text.length);
  for (let i = 0; i < end; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: end - lineStart + 1 };
}

const JSON_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const IDENT_START = /[A-Za-z_$À-￿]/;
const IDENT_PART = /[A-Za-z0-9_$\-À-￿]/;

function describe(ch: string | undefined): string {
  if (ch === undefined) return "end of input";
  if (ch === "\n") return "a line break";
  if (ch === "\t") return "a tab";
  if (ch === " ") return "a space";
  return `'${ch}'`;
}

export function parse(text: string, options: ParseOptions = {}): ParseResult {
  const loose = !!options.loose;
  const warnings: Issue[] = [];
  const fixes: Issue[] = [];
  let pos = 0;
  const len = text.length;

  const issue = (message: string, offset: number): Issue => ({
    message,
    offset,
    ...lineCol(text, offset),
  });
  const fix = (message: string, offset: number) => fixes.push(issue(message, offset));
  const fail = (message: string, offset = pos): never => {
    throw new ParseError(message, offset);
  };

  function skipWs(): void {
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 32 || c === 10 || c === 13 || c === 9) {
        pos++;
        continue;
      }
      // BOM / non-breaking spaces often sneak in via copy & paste.
      if (c === 0xfeff || c === 0xa0 || c === 0x2028 || c === 0x2029) {
        if (!loose) fail("Unexpected invisible character (BOM or non-breaking space)");
        fix("Removed an invisible character", pos);
        pos++;
        continue;
      }
      if (c === 47 /* / */ && (text[pos + 1] === "/" || text[pos + 1] === "*")) {
        if (!loose) fail("Comments are not allowed in JSON");
        const start = pos;
        if (text[pos + 1] === "/") {
          while (pos < len && text[pos] !== "\n") pos++;
        } else {
          const close = text.indexOf("*/", pos + 2);
          pos = close === -1 ? len : close + 2;
        }
        fix("Removed a comment", start);
        continue;
      }
      if (c === 35 /* # */ && loose) {
        fix("Removed a comment", pos);
        while (pos < len && text[pos] !== "\n") pos++;
        continue;
      }
      break;
    }
  }

  function parseValue(depth: number): JsonNode {
    if (depth > 5000) fail("Document is nested too deeply");
    skipWs();
    const ch = text[pos];
    switch (ch) {
      case "{":
        return parseObject(depth);
      case "[":
        return parseArray(depth);
      case '"':
        return parseString('"');
      case "'":
        if (!loose) fail("Strings must use double quotes");
        fix("Converted a single-quoted string", pos);
        return parseString("'");
      case undefined:
        return fail(depth === 0 ? "Document is empty" : "Unexpected end of input — expected a value");
    }
    if (ch === "-" || ch === "+" || ch === "." || (ch >= "0" && ch <= "9")) {
      return parseNumber();
    }
    return parseWord();
  }

  function parseWord(): JsonNode {
    const start = pos;
    if (!IDENT_START.test(text[pos] ?? "")) {
      return fail(`Unexpected ${describe(text[pos])} — expected a value`);
    }
    while (pos < len && IDENT_PART.test(text[pos])) pos++;
    const word = text.slice(start, pos);
    const end = pos;
    switch (word) {
      case "true":
        return { type: "boolean", value: true, start, end };
      case "false":
        return { type: "boolean", value: false, start, end };
      case "null":
        return { type: "null", start, end };
    }
    if (loose) {
      switch (word) {
        case "True":
        case "TRUE":
          fix(`Replaced ${word} with true`, start);
          return { type: "boolean", value: true, start, end };
        case "False":
        case "FALSE":
          fix(`Replaced ${word} with false`, start);
          return { type: "boolean", value: false, start, end };
        case "None":
        case "NULL":
        case "Null":
        case "nil":
        case "undefined":
          fix(`Replaced ${word} with null`, start);
          return { type: "null", start, end };
        case "NaN":
        case "Infinity":
          fix(`Replaced ${word} with null (not representable in JSON)`, start);
          return { type: "null", start, end };
      }
    }
    pos = start;
    return fail(`Unexpected token '${word}' — expected a value`, start);
  }

  function parseNumber(): JsonNode {
    const start = pos;
    if (loose) {
      // Grab anything number-ish, then let Number() judge it.
      while (pos < len && /[0-9a-fA-FxXoObB.+\-eE_]/.test(text[pos])) pos++;
      // Allow -Infinity / +Infinity
      if (/^[+-]$/.test(text.slice(start, pos)) && text.startsWith("Infinity", pos)) {
        pos += 8;
        fix("Replaced Infinity with null (not representable in JSON)", start);
        return { type: "null", start, end: pos };
      }
      const src = text.slice(start, pos);
      if (JSON_NUMBER.test(src)) {
        return numberNode(src, start);
      }
      const cleaned = src.replace(/_/g, "");
      const n = cleaned.startsWith("+") ? Number(cleaned.slice(1)) : Number(cleaned);
      if (src.length === 0 || Number.isNaN(n)) {
        pos = start;
        return fail(`Invalid number '${src || text[pos]}'`, start);
      }
      fix(`Normalised number ${src}`, start);
      return { type: "number", raw: String(n), value: n, start, end: pos };
    }
    let c = text.charCodeAt(pos);
    if (c === 45 /* - */) c = text.charCodeAt(++pos);
    if (c === 48 /* 0 */) {
      c = text.charCodeAt(++pos);
      if (c >= 48 && c <= 57) fail("Numbers cannot have leading zeros");
    } else if (c >= 49 && c <= 57) {
      do c = text.charCodeAt(++pos);
      while (c >= 48 && c <= 57);
    } else {
      fail(
        text[pos] === "+" || text[pos] === "."
          ? `Invalid number — JSON numbers cannot start with '${text[pos]}'`
          : `Unexpected ${describe(text[pos])} — expected a digit`,
      );
    }
    if (c === 46 /* . */) {
      c = text.charCodeAt(++pos);
      if (!(c >= 48 && c <= 57)) fail("Expected a digit after the decimal point");
      do c = text.charCodeAt(++pos);
      while (c >= 48 && c <= 57);
    }
    if (c === 101 || c === 69 /* e E */) {
      c = text.charCodeAt(++pos);
      if (c === 43 || c === 45) c = text.charCodeAt(++pos);
      if (!(c >= 48 && c <= 57)) fail("Expected a digit in the exponent");
      do c = text.charCodeAt(++pos);
      while (c >= 48 && c <= 57);
    }
    return numberNode(text.slice(start, pos), start);
  }

  function numberNode(raw: string, start: number): NumberNode {
    const value = Number(raw);
    if ((value > 9007199254740991 || value < -9007199254740991) && /^-?\d+$/.test(raw)) {
      warnings.push(
        issue(`${raw} exceeds the safe integer range — some tools will round it`, start),
      );
    }
    return { type: "number", raw, value, start, end: pos };
  }

  function parseString(quote: '"' | "'"): StringNode {
    const start = pos;
    pos++; // opening quote
    // Fast path: a run of plain characters up to the closing quote.
    const q = quote.charCodeAt(0);
    let i = pos;
    for (;;) {
      const c = text.charCodeAt(i);
      if (c === q) {
        const value = text.slice(pos, i);
        pos = i + 1;
        return { type: "string", value, start, end: pos };
      }
      if (c === 92 /* \\ */ || c < 32 || i >= len) break;
      i++;
    }
    let out = "";
    let chunk = pos;
    for (;;) {
      if (pos >= len) {
        if (loose) {
          fix("Closed an unterminated string", start);
          out += text.slice(chunk, pos);
          return { type: "string", value: out, start, end: pos };
        }
        fail("Unterminated string", start);
      }
      const c = text[pos];
      if (c === quote) {
        out += text.slice(chunk, pos);
        pos++;
        return { type: "string", value: out, start, end: pos };
      }
      if (c === "\\") {
        out += text.slice(chunk, pos);
        pos++;
        const e = text[pos];
        switch (e) {
          case '"':
          case "\\":
          case "/":
            out += e;
            break;
          case "b":
            out += "\b";
            break;
          case "f":
            out += "\f";
            break;
          case "n":
            out += "\n";
            break;
          case "r":
            out += "\r";
            break;
          case "t":
            out += "\t";
            break;
          case "u": {
            const hex = text.slice(pos + 1, pos + 5);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail("Invalid unicode escape — expected \\u followed by 4 hex digits", pos - 1);
            out += String.fromCharCode(parseInt(hex, 16));
            pos += 4;
            break;
          }
          default:
            if (loose && e !== undefined) {
              if (e === "x" && /^[0-9a-fA-F]{2}$/.test(text.slice(pos + 1, pos + 3))) {
                out += String.fromCharCode(parseInt(text.slice(pos + 1, pos + 3), 16));
                pos += 2;
              } else if (e === "\n") {
                // line continuation
              } else {
                out += e;
              }
              fix(`Normalised escape sequence \\${e === "\n" ? "↵" : e}`, pos - 1);
              break;
            }
            fail(`Invalid escape sequence '\\${e ?? ""}'`, pos - 1);
        }
        pos++;
        chunk = pos;
        continue;
      }
      if (c < " ") {
        if (loose) {
          fix(`Escaped a raw ${c === "\n" ? "line break" : "control character"} inside a string`, pos);
          pos++;
          continue;
        }
        fail(
          c === "\n"
            ? "Unescaped line break inside a string — use \\n"
            : "Unescaped control character inside a string",
        );
      }
      pos++;
    }
  }

  function parseKey(): { key: string; keyStart: number; keyEnd: number } {
    const keyStart = pos;
    const ch = text[pos];
    if (ch === '"') {
      const s = parseString('"');
      return { key: s.value, keyStart, keyEnd: pos };
    }
    if (loose) {
      if (ch === "'") {
        fix("Converted a single-quoted key", pos);
        const s = parseString("'");
        return { key: s.value, keyStart, keyEnd: pos };
      }
      if (ch !== undefined && (IDENT_PART.test(ch))) {
        while (pos < len && IDENT_PART.test(text[pos])) pos++;
        fix("Quoted an unquoted key", keyStart);
        return { key: text.slice(keyStart, pos), keyStart, keyEnd: pos };
      }
    }
    if (ch !== undefined && IDENT_START.test(ch)) {
      fail("Property names must be wrapped in double quotes");
    }
    if (ch === "'") fail("Property names must use double quotes");
    return fail(`Unexpected ${describe(ch)} — expected a property name`);
  }

  function parseObject(depth: number): ObjectNode {
    const start = pos;
    pos++; // {
    const props: Prop[] = [];
    const seen = new Set<string>();
    skipWs();
    if (text[pos] === "}") {
      pos++;
      return { type: "object", props, start, end: pos };
    }
    for (;;) {
      skipWs();
      if (pos >= len) {
        if (loose) {
          fix("Closed an unclosed object", start);
          return { type: "object", props, start, end: pos };
        }
        fail("Unexpected end of input — object is never closed", pos);
      }
      const { key, keyStart, keyEnd } = parseKey();
      skipWs();
      if (text[pos] !== ":") {
        if (loose && (text[pos] === "=" )) {
          fix("Replaced '=' with ':'", pos);
        } else if (loose) {
          fix("Inserted a missing ':'", pos);
          pos--; // compensate for the increment below
        } else {
          fail(`Expected ':' after property name, found ${describe(text[pos])}`);
        }
      }
      pos++;
      const value = parseValue(depth + 1);
      if (seen.has(key)) {
        warnings.push(issue(`Duplicate key "${key}" — only the last value is kept by most parsers`, keyStart));
      }
      seen.add(key);
      props.push({ key, keyStart, keyEnd, value });
      skipWs();
      const c = text[pos];
      if (c === ",") {
        const commaAt = pos;
        pos++;
        skipWs();
        if (text[pos] === "}") {
          if (!loose) fail("Trailing comma is not allowed", commaAt);
          fix("Removed a trailing comma", commaAt);
          pos++;
          return { type: "object", props, start, end: pos };
        }
        continue;
      }
      if (c === "}") {
        pos++;
        return { type: "object", props, start, end: pos };
      }
      if (loose) {
        if (c === undefined) {
          fix("Closed an unclosed object", start);
          return { type: "object", props, start, end: pos };
        }
        if (c === "]") {
          fix("Replaced a mismatched ']' with '}'", pos);
          pos++;
          return { type: "object", props, start, end: pos };
        }
        fix("Inserted a missing comma", pos);
        continue;
      }
      if (c === undefined) fail("Unexpected end of input — object is never closed");
      fail(`Expected ',' or '}' after property value, found ${describe(c)}`);
    }
  }

  function parseArray(depth: number): ArrayNode {
    const start = pos;
    pos++; // [
    const items: JsonNode[] = [];
    skipWs();
    if (text[pos] === "]") {
      pos++;
      return { type: "array", items, start, end: pos };
    }
    for (;;) {
      skipWs();
      if (pos >= len && loose) {
        fix("Closed an unclosed array", start);
        return { type: "array", items, start, end: pos };
      }
      if (text[pos] === "," && loose) {
        fix("Removed an extra comma", pos);
        pos++;
        continue;
      }
      items.push(parseValue(depth + 1));
      skipWs();
      const c = text[pos];
      if (c === ",") {
        const commaAt = pos;
        pos++;
        skipWs();
        if (text[pos] === "]") {
          if (!loose) fail("Trailing comma is not allowed", commaAt);
          fix("Removed a trailing comma", commaAt);
          pos++;
          return { type: "array", items, start, end: pos };
        }
        continue;
      }
      if (c === "]") {
        pos++;
        return { type: "array", items, start, end: pos };
      }
      if (loose) {
        if (c === undefined) {
          fix("Closed an unclosed array", start);
          return { type: "array", items, start, end: pos };
        }
        if (c === "}") {
          fix("Replaced a mismatched '}' with ']'", pos);
          pos++;
          return { type: "array", items, start, end: pos };
        }
        fix("Inserted a missing comma", pos);
        continue;
      }
      if (c === undefined) fail("Unexpected end of input — array is never closed");
      fail(`Expected ',' or ']' after array item, found ${describe(c)}`);
    }
  }

  try {
    let ast: JsonNode;
    skipWs();
    // Loose mode: a stream of values (NDJSON / concatenated objects) becomes an array.
    ast = parseValue(0);
    skipWs();
    if (pos < len) {
      if (loose) {
        const items = [ast];
        fix("Wrapped multiple top-level values in an array", pos);
        while (pos < len) {
          if (text[pos] === ",") {
            pos++;
            skipWs();
            continue;
          }
          items.push(parseValue(1));
          skipWs();
        }
        ast = { type: "array", items, start: 0, end: len };
      } else {
        fail(`Unexpected ${describe(text[pos])} after the end of the document`);
      }
    }
    return { ok: true, ast, warnings, fixes };
  } catch (err) {
    if (err instanceof ParseError) {
      return { ok: false, error: issue(err.message, err.offset) };
    }
    throw err;
  }
}

/** Convert an AST into a plain JavaScript value. */
export function toValue(node: JsonNode): unknown {
  switch (node.type) {
    case "object": {
      const out: Record<string, unknown> = {};
      for (const p of node.props) {
        if (p.key === "__proto__") {
          Object.defineProperty(out, p.key, {
            value: toValue(p.value),
            enumerable: true,
            writable: true,
            configurable: true,
          });
        } else {
          out[p.key] = toValue(p.value);
        }
      }
      return out;
    }
    case "array":
      return node.items.map(toValue);
    case "null":
      return null;
    default:
      return node.value;
  }
}

/** Build an AST from a plain value (used after JSON5 / YAML / query results). */
export function fromValue(value: unknown): JsonNode {
  const r = { start: 0, end: 0 };
  if (value === null || value === undefined) return { type: "null", ...r };
  switch (typeof value) {
    case "string":
      return { type: "string", value, ...r };
    case "number":
      return Number.isFinite(value)
        ? { type: "number", value, raw: String(value), ...r }
        : { type: "null", ...r };
    case "bigint":
      return { type: "number", value: Number(value), raw: value.toString(), ...r };
    case "boolean":
      return { type: "boolean", value, ...r };
    case "object": {
      if (Array.isArray(value)) return { type: "array", items: value.map(fromValue), ...r };
      if (value instanceof Date) return { type: "string", value: value.toISOString(), ...r };
      const props: Prop[] = [];
      for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
        if (v === undefined || typeof v === "function") continue;
        props.push({ key, keyStart: 0, keyEnd: 0, value: fromValue(v) });
      }
      return { type: "object", props, ...r };
    }
    default:
      return { type: "null", ...r };
  }
}
