/**
 * A compact JSONPath implementation (Goessner / RFC 9535 flavoured).
 *
 *   $.store.book[*].author        child, wildcard
 *   $..author                     recursive descent
 *   $.book[0,2]  $.book[-1]       index lists, negative indices
 *   $.book[1:3]  $.book[::2]      slices
 *   $.book[?(@.price < 10)]       filters with == != < <= > >= && || ! ( )
 *   $.book[?(@.isbn)]             existence
 *   $.book[?(@.title =~ /lord/i)] regex match
 *   $.book[?(length(@.tags) > 1)] length()
 *
 * Paths may omit the leading `$` (`.users[0]` and `users[0]` both work).
 */

import type { Path } from "./path";

export interface Match {
  path: Path;
  value: unknown;
}

type Selector =
  | { kind: "name"; names: string[] }
  | { kind: "index"; indices: number[] }
  | { kind: "wildcard" }
  | { kind: "slice"; start?: number; end?: number; step?: number }
  | { kind: "filter"; expr: Expr };

interface Step {
  descendant: boolean;
  selector: Selector;
}

type Expr =
  | { t: "lit"; v: unknown }
  | { t: "path"; root: "@" | "$"; steps: Step[] }
  | { t: "not"; e: Expr }
  | { t: "bin"; op: string; l: Expr; r: Expr }
  | { t: "regex"; re: RegExp }
  | { t: "fn"; name: string; args: Expr[] };

export class JsonPathError extends Error {
  constructor(
    message: string,
    readonly offset: number,
  ) {
    super(message);
  }
}

class Parser {
  pos = 0;
  constructor(public src: string) {}

  err(msg: string): never {
    throw new JsonPathError(`${msg} (at position ${this.pos + 1})`, this.pos);
  }
  ws(): void {
    while (/\s/.test(this.src[this.pos] ?? "")) this.pos++;
  }
  peek(s: string): boolean {
    return this.src.startsWith(s, this.pos);
  }
  eat(s: string): boolean {
    if (this.peek(s)) {
      this.pos += s.length;
      return true;
    }
    return false;
  }
  expect(s: string): void {
    if (!this.eat(s)) this.err(`Expected '${s}'`);
  }

  ident(): string {
    const m = /^[A-Za-z_$À-￿][\w$\-À-￿]*/.exec(this.src.slice(this.pos));
    if (!m) this.err("Expected a property name");
    this.pos += m[0].length;
    return m[0];
  }

  string(): string {
    const q = this.src[this.pos];
    let i = this.pos + 1;
    let out = "";
    while (i < this.src.length && this.src[i] !== q) {
      if (this.src[i] === "\\") {
        const n = this.src[i + 1];
        out += n === "n" ? "\n" : n === "t" ? "\t" : n;
        i += 2;
      } else out += this.src[i++];
    }
    if (this.src[i] !== q) this.err("Unterminated string");
    this.pos = i + 1;
    return out;
  }

  int(): number | undefined {
    const m = /^-?\d+/.exec(this.src.slice(this.pos));
    if (!m) return undefined;
    this.pos += m[0].length;
    return Number(m[0]);
  }

  /** Parse a full path; `root` is consumed by the caller for filter sub-paths. */
  steps(inFilter: boolean): Step[] {
    const steps: Step[] = [];
    for (;;) {
      if (!inFilter) this.ws();
      if (this.eat("..")) {
        if (this.peek("[")) {
          this.pos++;
          steps.push({ descendant: true, selector: this.bracket() });
        } else if (this.eat("*")) {
          steps.push({ descendant: true, selector: { kind: "wildcard" } });
        } else {
          steps.push({ descendant: true, selector: { kind: "name", names: [this.ident()] } });
        }
        continue;
      }
      if (this.eat(".")) {
        if (this.eat("*")) steps.push({ descendant: false, selector: { kind: "wildcard" } });
        else steps.push({ descendant: false, selector: { kind: "name", names: [this.ident()] } });
        continue;
      }
      if (this.eat("[")) {
        steps.push({ descendant: false, selector: this.bracket() });
        continue;
      }
      return steps;
    }
  }

  bracket(): Selector {
    this.ws();
    if (this.eat("*")) {
      this.ws();
      this.expect("]");
      return { kind: "wildcard" };
    }
    if (this.eat("?")) {
      this.ws();
      const paren = this.eat("(");
      const expr = this.orExpr();
      this.ws();
      if (paren) this.expect(")");
      this.ws();
      this.expect("]");
      return { kind: "filter", expr };
    }
    if (this.peek("'") || this.peek('"')) {
      const names = [this.string()];
      this.ws();
      while (this.eat(",")) {
        this.ws();
        if (!(this.peek("'") || this.peek('"'))) this.err("Expected a quoted name");
        names.push(this.string());
        this.ws();
      }
      this.expect("]");
      return { kind: "name", names };
    }
    // index, index list or slice
    const first = this.int();
    this.ws();
    if (this.peek(":")) {
      this.pos++;
      this.ws();
      const end = this.int();
      this.ws();
      let step: number | undefined;
      if (this.eat(":")) {
        this.ws();
        step = this.int();
        this.ws();
      }
      this.expect("]");
      return { kind: "slice", start: first, end, step };
    }
    if (first === undefined) {
      // bare identifier inside brackets, e.g. [name] — be forgiving
      const name = this.ident();
      this.ws();
      this.expect("]");
      return { kind: "name", names: [name] };
    }
    const indices = [first];
    while (this.eat(",")) {
      this.ws();
      const n = this.int();
      if (n === undefined) this.err("Expected an index");
      indices.push(n);
      this.ws();
    }
    this.expect("]");
    return { kind: "index", indices };
  }

  // ---- filter expressions ------------------------------------------------
  orExpr(): Expr {
    let l = this.andExpr();
    for (;;) {
      this.ws();
      if (this.eat("||")) l = { t: "bin", op: "||", l, r: this.andExpr() };
      else return l;
    }
  }
  andExpr(): Expr {
    let l = this.cmpExpr();
    for (;;) {
      this.ws();
      if (this.eat("&&")) l = { t: "bin", op: "&&", l, r: this.cmpExpr() };
      else return l;
    }
  }
  cmpExpr(): Expr {
    const l = this.unary();
    this.ws();
    if (/^in[\s[]/.test(this.src.slice(this.pos))) {
      this.pos += 2;
      return { t: "bin", op: "in", l, r: this.unary() };
    }
    for (const op of ["===", "!==", "==", "!=", "<=", ">=", "=~", "<", ">"]) {
      if (this.eat(op)) {
        this.ws();
        if (op === "=~") {
          return { t: "bin", op, l, r: this.regex() };
        }
        return { t: "bin", op: op.replace("===", "==").replace("!==", "!="), l, r: this.unary() };
      }
    }
    return l;
  }
  unary(): Expr {
    this.ws();
    if (this.eat("!")) return { t: "not", e: this.unary() };
    if (this.eat("(")) {
      const e = this.orExpr();
      this.ws();
      this.expect(")");
      return e;
    }
    return this.primary();
  }
  regex(): Expr {
    if (!this.eat("/")) {
      if (this.peek("'") || this.peek('"')) return { t: "regex", re: new RegExp(this.string()) };
      this.err("Expected a /regex/");
    }
    let body = "";
    while (this.pos < this.src.length && this.src[this.pos] !== "/") {
      if (this.src[this.pos] === "\\") body += this.src[this.pos++];
      body += this.src[this.pos++];
    }
    this.expect("/");
    const flags = /^[gimsuy]*/.exec(this.src.slice(this.pos))![0];
    this.pos += flags.length;
    try {
      return { t: "regex", re: new RegExp(body, flags.replace("g", "")) };
    } catch {
      return this.err("Invalid regular expression");
    }
  }
  primary(): Expr {
    this.ws();
    const c = this.src[this.pos];
    if (c === "@" || c === "$") {
      this.pos++;
      return { t: "path", root: c, steps: this.steps(true) };
    }
    if (c === "'" || c === '"') return { t: "lit", v: this.string() };
    if (c === "[") {
      // array literal for `in`
      this.pos++;
      const items: unknown[] = [];
      this.ws();
      while (!this.eat("]")) {
        const e = this.primary();
        if (e.t !== "lit") this.err("Array literals may only contain literals");
        items.push(e.v);
        this.ws();
        this.eat(",");
        this.ws();
      }
      return { t: "lit", v: items };
    }
    const num = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(this.src.slice(this.pos));
    if (num) {
      this.pos += num[0].length;
      return { t: "lit", v: Number(num[0]) };
    }
    for (const [w, v] of [
      ["true", true],
      ["false", false],
      ["null", null],
    ] as const) {
      if (this.eat(w)) return { t: "lit", v };
    }
    const fn = /^([a-z_]\w*)\s*\(/i.exec(this.src.slice(this.pos));
    if (fn) {
      this.pos += fn[0].length;
      const args: Expr[] = [];
      this.ws();
      while (!this.eat(")")) {
        args.push(this.orExpr());
        this.ws();
        this.eat(",");
        this.ws();
      }
      return { t: "fn", name: fn[1].toLowerCase(), args };
    }
    return this.err("Expected a value in filter expression");
  }
}

export function compile(src: string): Step[] {
  const p = new Parser(src.trim());
  p.ws();
  if (!p.eat("$")) {
    // Accept `users[0]` and `.users` as shorthand
    if (/^[A-Za-z_]/.test(p.src[p.pos] ?? "")) {
      p.src = "." + p.src.slice(p.pos);
      p.pos = 0;
    }
  }
  const steps = p.steps(false);
  p.ws();
  if (p.pos < p.src.length) p.err(`Unexpected '${p.src[p.pos]}'`);
  return steps;
}

function children(value: unknown, path: Path, out: Match[]): void {
  if (Array.isArray(value)) value.forEach((v, i) => out.push({ path: [...path, i], value: v }));
  else if (value !== null && typeof value === "object")
    for (const [k, v] of Object.entries(value)) out.push({ path: [...path, k], value: v });
}

function descendants(m: Match, out: Match[]): void {
  out.push(m);
  const kids: Match[] = [];
  children(m.value, m.path, kids);
  for (const k of kids) descendants(k, out);
}

function applySelector(sel: Selector, m: Match, root: unknown, out: Match[]): void {
  const { value, path } = m;
  switch (sel.kind) {
    case "wildcard":
      children(value, path, out);
      return;
    case "name":
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        for (const n of sel.names)
          if (Object.prototype.hasOwnProperty.call(value, n))
            out.push({ path: [...path, n], value: (value as Record<string, unknown>)[n] });
      } else if (Array.isArray(value) && sel.names.length === 1 && sel.names[0] === "length") {
        out.push({ path: [...path, "length"], value: value.length });
      }
      return;
    case "index":
      if (Array.isArray(value)) {
        for (const i of sel.indices) {
          const idx = i < 0 ? value.length + i : i;
          if (idx >= 0 && idx < value.length) out.push({ path: [...path, idx], value: value[idx] });
        }
      }
      return;
    case "slice": {
      if (!Array.isArray(value)) return;
      const n = value.length;
      const step = sel.step ?? 1;
      if (step === 0) return;
      const norm = (i: number) => (i < 0 ? Math.max(n + i, 0) : Math.min(i, n));
      if (step > 0) {
        const start = norm(sel.start ?? 0);
        const end = norm(sel.end ?? n);
        for (let i = start; i < end; i += step) out.push({ path: [...path, i], value: value[i] });
      } else {
        const start = sel.start === undefined ? n - 1 : Math.min(norm(sel.start), n - 1);
        const end = sel.end === undefined ? -1 : norm(sel.end);
        for (let i = start; i > end; i += step) out.push({ path: [...path, i], value: value[i] });
      }
      return;
    }
    case "filter": {
      const kids: Match[] = [];
      children(value, path, kids);
      for (const k of kids) if (truthy(evaluate(sel.expr, k.value, root))) out.push(k);
    }
  }
}

function run(steps: Step[], start: Match[], root: unknown): Match[] {
  let current = start;
  for (const step of steps) {
    const next: Match[] = [];
    for (const m of current) {
      if (step.descendant) {
        const all: Match[] = [];
        descendants(m, all);
        for (const d of all) applySelector(step.selector, d, root, next);
      } else {
        applySelector(step.selector, m, root, next);
      }
    }
    current = next;
  }
  return current;
}

const NOTHING = Symbol("nothing");

function evaluate(e: Expr, current: unknown, root: unknown): unknown {
  switch (e.t) {
    case "lit":
      return e.v;
    case "regex":
      return e.re;
    case "path": {
      const res = run(e.steps, [{ path: [], value: e.root === "@" ? current : root }], root);
      return res.length ? res[0].value : NOTHING;
    }
    case "not":
      return !truthy(evaluate(e.e, current, root));
    case "fn": {
      const args = e.args.map((a) => evaluate(a, current, root));
      const a = args[0];
      switch (e.name) {
        case "length":
          if (typeof a === "string" || Array.isArray(a)) return a.length;
          if (a && typeof a === "object") return Object.keys(a).length;
          return NOTHING;
        case "count":
          return Array.isArray(a) ? a.length : a === NOTHING ? 0 : 1;
        case "match":
        case "search":
          if (typeof a !== "string" || typeof args[1] !== "string") return false;
          return new RegExp(e.name === "match" ? `^(?:${args[1]})$` : args[1]).test(a);
        case "lower":
          return typeof a === "string" ? a.toLowerCase() : a;
        case "upper":
          return typeof a === "string" ? a.toUpperCase() : a;
        case "contains":
          if (typeof a === "string") return typeof args[1] === "string" && a.includes(args[1]);
          if (Array.isArray(a)) return a.some((x) => equal(x, args[1]));
          return false;
        case "type":
          return a === null ? "null" : Array.isArray(a) ? "array" : typeof a;
      }
      throw new JsonPathError(`Unknown function ${e.name}()`, 0);
    }
    case "bin": {
      if (e.op === "&&") return truthy(evaluate(e.l, current, root)) && truthy(evaluate(e.r, current, root));
      if (e.op === "||") return truthy(evaluate(e.l, current, root)) || truthy(evaluate(e.r, current, root));
      const l = evaluate(e.l, current, root);
      const r = evaluate(e.r, current, root);
      if (e.op === "=~") return typeof l === "string" && r instanceof RegExp && r.test(l);
      if (e.op === "in") return Array.isArray(r) && r.some((x) => equal(x, l));
      if (l === NOTHING || r === NOTHING) return e.op === "!=" ? l !== r : false;
      switch (e.op) {
        case "==":
          return equal(l, r);
        case "!=":
          return !equal(l, r);
      }
      if (typeof l !== typeof r || (typeof l !== "number" && typeof l !== "string")) return false;
      const a = l as number | string;
      const b = r as number | string;
      switch (e.op) {
        case "<":
          return a < b;
        case "<=":
          return a <= b;
        case ">":
          return a > b;
        case ">=":
          return a >= b;
      }
      return false;
    }
  }
}

function truthy(v: unknown): boolean {
  if (v === NOTHING) return false;
  return v !== false && v !== null && v !== undefined;
}

export function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => equal(x, bb[i]));
  }
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  return (
    ka.length === kb.length &&
    ka.every((k) =>
      Object.prototype.hasOwnProperty.call(b, k) &&
      equal((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    )
  );
}

export function query(data: unknown, expression: string): Match[] {
  const steps = compile(expression);
  return run(steps, [{ path: [], value: data }], data);
}
