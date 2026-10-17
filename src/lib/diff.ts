import { equal } from "./jsonpath";
import type { Path } from "./path";

export type ChangeKind = "added" | "removed" | "changed" | "type";

export interface Change {
  kind: ChangeKind;
  path: Path;
  before?: unknown;
  after?: unknown;
}

export interface DiffOptions {
  /**
   * Match array items by identity rather than position. When set to a key
   * (e.g. "id"), objects sharing that key are compared with each other.
   */
  arrayKey?: string;
}

function kindOf(v: unknown): string {
  return v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
}

/** Structural diff between two JSON values. */
export function diffValues(a: unknown, b: unknown, options: DiffOptions = {}): Change[] {
  const out: Change[] = [];

  const walk = (x: unknown, y: unknown, path: Path): void => {
    if (equal(x, y)) return;
    const kx = kindOf(x);
    const ky = kindOf(y);
    if (kx !== ky) {
      out.push({ kind: "type", path, before: x, after: y });
      return;
    }
    if (kx === "array") {
      const xa = x as unknown[];
      const ya = y as unknown[];
      const key = options.arrayKey;
      const keyed =
        key &&
        [...xa, ...ya].every(
          (i) => i !== null && typeof i === "object" && !Array.isArray(i) && key in (i as object),
        );
      if (keyed) {
        const id = (i: unknown) => JSON.stringify((i as Record<string, unknown>)[key]);
        const ym = new Map(ya.map((v, i) => [id(v), i]));
        const xm = new Map(xa.map((v, i) => [id(v), i]));
        xa.forEach((v, i) => {
          const j = ym.get(id(v));
          if (j === undefined) out.push({ kind: "removed", path: [...path, i], before: v });
          else walk(v, ya[j], [...path, j]);
        });
        ya.forEach((v, j) => {
          if (!xm.has(id(v))) out.push({ kind: "added", path: [...path, j], after: v });
        });
        return;
      }
      const n = Math.max(xa.length, ya.length);
      for (let i = 0; i < n; i++) {
        if (i >= xa.length) out.push({ kind: "added", path: [...path, i], after: ya[i] });
        else if (i >= ya.length) out.push({ kind: "removed", path: [...path, i], before: xa[i] });
        else walk(xa[i], ya[i], [...path, i]);
      }
      return;
    }
    if (kx === "object") {
      const xo = x as Record<string, unknown>;
      const yo = y as Record<string, unknown>;
      for (const k of Object.keys(xo)) {
        if (!Object.prototype.hasOwnProperty.call(yo, k)) out.push({ kind: "removed", path: [...path, k], before: xo[k] });
        else walk(xo[k], yo[k], [...path, k]);
      }
      for (const k of Object.keys(yo)) {
        if (!Object.prototype.hasOwnProperty.call(xo, k)) out.push({ kind: "added", path: [...path, k], after: yo[k] });
      }
      return;
    }
    out.push({ kind: "changed", path, before: x, after: y });
  };

  walk(a, b, []);
  return out;
}

export type LineOp = { op: "equal" | "insert" | "delete"; text: string; a?: number; b?: number };

/** Myers O(ND) line diff, with common prefix/suffix trimmed first. */
export function diffLines(aText: string, bText: string): LineOp[] {
  const A = aText.split("\n");
  const B = bText.split("\n");
  let pre = 0;
  while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
  let suf = 0;
  while (
    suf < A.length - pre &&
    suf < B.length - pre &&
    A[A.length - 1 - suf] === B[B.length - 1 - suf]
  )
    suf++;
  const head: LineOp[] = A.slice(0, pre).map((text, i) => ({ op: "equal", text, a: i + 1, b: i + 1 }));
  const tail: LineOp[] = A.slice(A.length - suf).map((text, i) => ({
    op: "equal",
    text,
    a: A.length - suf + i + 1,
    b: B.length - suf + i + 1,
  }));
  const a = A.slice(pre, A.length - suf);
  const b = B.slice(pre, B.length - suf);
  const shift = (o: LineOp): LineOp => ({
    ...o,
    a: o.a === undefined ? undefined : o.a + pre,
    b: o.b === undefined ? undefined : o.b + pre,
  });
  return [...head, ...myers(a, b).map(shift), ...tail];
}

function myers(a: string[], b: string[]): LineOp[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const crude = (): LineOp[] => [
    ...a.map((text, i): LineOp => ({ op: "delete", text, a: i + 1 })),
    ...b.map((text, i): LineOp => ({ op: "insert", text, b: i + 1 })),
  ];
  if (max === 0) return [];
  const width = 2 * max + 2;
  const v = new Int32Array(width);
  const trace: Int32Array[] = [];
  let found = false;
  for (let d = 0; d <= max && !found; d++) {
    // Guard memory on huge, very different inputs.
    if ((d + 1) * width > 3e7) return crude();
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[max + k - 1] < v[max + k + 1])) x = v[max + k + 1];
      else x = v[max + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[max + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
  }
  const ops: LineOp[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const vv = trace[d];
    const k = x - y;
    const prevK = k === -d || (k !== d && vv[max + k - 1] < vv[max + k + 1]) ? k + 1 : k - 1;
    const prevX = vv[max + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push({ op: "equal", text: a[x - 1], a: x, b: y });
      x--;
      y--;
    }
    if (d > 0) {
      if (x === prevX) ops.push({ op: "insert", text: b[y - 1], b: y });
      else ops.push({ op: "delete", text: a[x - 1], a: x });
    }
    x = prevX;
    y = prevY;
  }
  return ops.reverse();
}
