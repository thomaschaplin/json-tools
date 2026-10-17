/// <reference lib="webworker" />
// Runs user-written JavaScript transforms off the main thread. The worker has
// no DOM or storage access, and the app terminates it if it runs too long.

interface Req {
  id: number;
  code: string;
  data: unknown;
}

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, code, data } = e.data;
  try {
    // Treat the input as an expression first; fall back to a function body
    // (statements with an explicit `return`).
    type Fn = (d: unknown, $: unknown, _: unknown) => unknown;
    let fn: Fn;
    try {
      fn = new Function("data", "$", "_", `"use strict";\nreturn (${code}\n);`) as Fn;
    } catch {
      fn = new Function("data", "$", "_", `"use strict";\n${code}`) as Fn;
    }
    let result = fn(data, data, helpers);
    if (result instanceof Set) result = [...result];
    if (result instanceof Map) result = Object.fromEntries(result);
    const json = result === undefined ? undefined : JSON.stringify(result, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    self.postMessage({ id, ok: true, json });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
  }
};

// A few lodash-style helpers available as `_` in expressions.
const helpers = {
  groupBy<T>(arr: T[], key: string | ((x: T) => unknown)) {
    const out: Record<string, T[]> = {};
    for (const x of arr) {
      const k = String(typeof key === "function" ? key(x) : (x as Record<string, unknown>)[key]);
      (out[k] ??= []).push(x);
    }
    return out;
  },
  countBy<T>(arr: T[], key: string | ((x: T) => unknown)) {
    const out: Record<string, number> = {};
    for (const x of arr) {
      const k = String(typeof key === "function" ? key(x) : (x as Record<string, unknown>)[key]);
      out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  },
  sortBy<T>(arr: T[], key: string | ((x: T) => unknown)) {
    const get = (x: T) => (typeof key === "function" ? key(x) : (x as Record<string, unknown>)[key]) as never;
    return [...arr].sort((a, b) => (get(a) < get(b) ? -1 : get(a) > get(b) ? 1 : 0));
  },
  uniq<T>(arr: T[]) {
    return [...new Set(arr)];
  },
  pick(obj: Record<string, unknown>, ...keys: string[]) {
    return Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));
  },
  omit(obj: Record<string, unknown>, ...keys: string[]) {
    return Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));
  },
  sum(arr: number[]) {
    return arr.reduce((a, b) => a + b, 0);
  },
  flatten(arr: unknown[]) {
    return arr.flat(Infinity);
  },
};
