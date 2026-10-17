import type { JsonNode } from "./parse";

export type Segment = string | number;
export type Path = Segment[];

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** `$.users[0].name` / `$["odd key"]` */
export function toJsonPath(path: Path): string {
  let out = "$";
  for (const seg of path) {
    if (typeof seg === "number") out += `[${seg}]`;
    else if (IDENT.test(seg)) out += `.${seg}`;
    else out += `[${JSON.stringify(seg)}]`;
  }
  return out;
}

/** `data.users[0].name` — paste-able into JavaScript. */
export function toAccessor(path: Path, root = "data"): string {
  let out = root;
  for (const seg of path) {
    if (typeof seg === "number") out += `[${seg}]`;
    else if (IDENT.test(seg)) out += `.${seg}`;
    else out += `[${JSON.stringify(seg)}]`;
  }
  return out;
}

/** RFC 6901 JSON Pointer: `/users/0/name` */
export function toPointer(path: Path): string {
  return path.map((s) => "/" + String(s).replace(/~/g, "~0").replace(/\//g, "~1")).join("");
}

/** jq-style: `.users[0].name` */
export function toJq(path: Path): string {
  if (path.length === 0) return ".";
  let out = "";
  for (const seg of path) {
    if (typeof seg === "number") out += `[${seg}]`;
    else if (IDENT.test(seg)) out += `.${seg}`;
    else out += `[${JSON.stringify(seg)}]`;
  }
  return out;
}

export function pathKey(path: Path): string {
  return JSON.stringify(path);
}

/** Find the deepest node whose range contains `offset`, returning its path. */
export function pathAtOffset(root: JsonNode, offset: number): { path: Path; node: JsonNode; onKey: boolean } | null {
  if (offset < root.start || offset > root.end) return null;
  let node = root;
  const path: Path = [];
  let onKey = false;
  for (;;) {
    if (node.type === "object") {
      const hit = node.props.find(
        (p) => (offset >= p.keyStart && offset <= p.keyEnd) || (offset >= p.value.start && offset <= p.value.end),
      );
      if (!hit) break;
      path.push(hit.key);
      if (offset >= hit.keyStart && offset <= hit.keyEnd) {
        node = hit.value;
        onKey = true;
        break;
      }
      node = hit.value;
      continue;
    }
    if (node.type === "array") {
      const index = node.items.findIndex((item) => offset >= item.start && offset <= item.end);
      if (index === -1) break;
      path.push(index);
      node = node.items[index];
      continue;
    }
    break;
  }
  return { path, node, onKey };
}

/** Follow a path down the AST. */
export function nodeAtPath(root: JsonNode, path: Path): JsonNode | null {
  let node: JsonNode | undefined = root;
  for (const seg of path) {
    if (!node) return null;
    if (node.type === "object") {
      // last occurrence wins, matching JSON.parse semantics for duplicate keys
      let found: JsonNode | undefined;
      for (const p of node.props) if (p.key === String(seg)) found = p.value;
      node = found;
    } else if (node.type === "array" && typeof seg === "number") {
      node = node.items[seg];
    } else {
      return null;
    }
  }
  return node ?? null;
}

/** Key range for the last segment, if the parent is an object. */
export function keyRangeAtPath(root: JsonNode, path: Path): { start: number; end: number } | null {
  if (path.length === 0) return null;
  const parent = nodeAtPath(root, path.slice(0, -1));
  if (!parent || parent.type !== "object") return null;
  const last = String(path[path.length - 1]);
  for (let i = parent.props.length - 1; i >= 0; i--) {
    const p = parent.props[i];
    if (p.key === last) return { start: p.keyStart, end: p.keyEnd };
  }
  return null;
}

export function getAtPath(value: unknown, path: Path): unknown {
  let cur = value;
  for (const seg of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg as string];
  }
  return cur;
}
