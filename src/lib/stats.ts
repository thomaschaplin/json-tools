import type { JsonNode } from "./parse";

export interface Stats {
  bytes: number;
  lines: number;
  depth: number;
  objects: number;
  arrays: number;
  strings: number;
  numbers: number;
  booleans: number;
  nulls: number;
  keys: number;
  uniqueKeys: number;
  longestArray: number;
  /** Most frequent keys, descending. */
  topKeys: [string, number][];
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function computeStats(root: JsonNode, text: string): Stats {
  const s: Stats = {
    bytes: byteLength(text),
    lines: text ? text.split("\n").length : 0,
    depth: 0,
    objects: 0,
    arrays: 0,
    strings: 0,
    numbers: 0,
    booleans: 0,
    nulls: 0,
    keys: 0,
    uniqueKeys: 0,
    longestArray: 0,
    topKeys: [],
  };
  const keyCounts = new Map<string, number>();
  const stack: [JsonNode, number][] = [[root, 1]];
  while (stack.length) {
    const [n, d] = stack.pop()!;
    if (d > s.depth) s.depth = d;
    switch (n.type) {
      case "object":
        s.objects++;
        s.keys += n.props.length;
        for (const p of n.props) {
          keyCounts.set(p.key, (keyCounts.get(p.key) ?? 0) + 1);
          stack.push([p.value, d + 1]);
        }
        break;
      case "array":
        s.arrays++;
        if (n.items.length > s.longestArray) s.longestArray = n.items.length;
        for (const i of n.items) stack.push([i, d + 1]);
        break;
      case "string":
        s.strings++;
        break;
      case "number":
        s.numbers++;
        break;
      case "boolean":
        s.booleans++;
        break;
      case "null":
        s.nulls++;
    }
  }
  s.uniqueKeys = keyCounts.size;
  s.topKeys = [...keyCounts].sort((a, b) => b[1] - a[1]).slice(0, 12);
  return s;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}
