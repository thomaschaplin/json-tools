import type { Analysis } from "../state";
import { store } from "../state";
import type { JsonNode } from "../lib/parse";
import { minify, print } from "../lib/format";
import { pathAtOffset, pathKey, toAccessor, toJq, toJsonPath, toPointer, type Path } from "../lib/path";
import { button, debounce, h, scrollWithin } from "../ui/dom";
import { icon } from "../ui/icons";
import { showMenu } from "../ui/menu";
import type { AppContext, View } from "./types";

const CHUNK = 200;
const URL_RE = /^https?:\/\/[^\s]+$/;
const COLOR_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$|^(?:rgb|hsl)a?\([^)]*\)$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const TIME_KEY = /(^|_)(at|ts|time|timestamp|date|iat|exp|nbf|created|updated|modified|expires?)$|At$|Time$|Date$/i;

interface Match {
  path: Path;
  /** "key" when the key matched, "value" for a primitive value. */
  on: "key" | "value";
}

function count(n: JsonNode): number {
  return n.type === "object" ? n.props.length : n.type === "array" ? n.items.length : 0;
}

function relTime(d: Date): string {
  const diff = (d.getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
    ["second", 1],
  ];
  for (const [u, s] of units) if (abs >= s || u === "second") return rtf.format(Math.round(diff / s), u);
  return "";
}

function dateHint(n: JsonNode, key: string | number | undefined): string | null {
  if (n.type === "string" && ISO_RE.test(n.value)) {
    const d = new Date(n.value);
    if (!Number.isNaN(d.getTime())) return `${d.toLocaleString()} · ${relTime(d)}`;
  }
  if (n.type === "number" && typeof key === "string" && TIME_KEY.test(key) && Number.isInteger(n.value)) {
    const v = n.value;
    const ms = v > 1e11 && v < 1e14 ? v : v > 1e8 && v < 1e11 ? v * 1000 : null;
    if (ms !== null) {
      const d = new Date(ms);
      return `${d.toLocaleString()} · ${relTime(d)}`;
    }
  }
  return null;
}

export class TreeView implements View {
  id = "tree" as const;
  label = "Tree";
  icon = "tree" as const;
  el: HTMLElement;

  private body: HTMLElement;
  private detail: HTMLElement;
  private searchInput: HTMLInputElement;
  private searchInfo: HTMLElement;
  private ast: JsonNode | null = null;
  private expanded = new Set<string>([pathKey([])]);
  private rows = new Map<string, HTMLElement>();
  private selected: Path | null = null;
  private matches: Match[] = [];
  private matchKeys = new Set<string>();
  private matchIndex = -1;
  private query = "";
  private lastText = "";
  private visible = false;

  constructor(private ctx: AppContext) {
    this.searchInput = h("input", {
      type: "search",
      class: "input input-sm",
      placeholder: "Search keys and values…",
      "aria-label": "Search the tree",
      spellcheck: false,
    });
    this.searchInfo = h("span", { class: "search-info" });
    const runSearch = debounce(() => this.search(this.searchInput.value), 160);
    this.searchInput.addEventListener("input", runSearch);
    this.searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        runSearch.flush();
        this.step(e.shiftKey ? -1 : 1);
      } else if (e.key === "Escape") {
        this.searchInput.value = "";
        this.search("");
      }
    });

    const toolbar = h(
      "div",
      { class: "view-toolbar" },
      h("div", { class: "search-field" }, icon("search"), this.searchInput, this.searchInfo),
      button({ icon: "chevronUp", title: "Previous match", onClick: () => this.step(-1) }),
      button({ icon: "chevronDown", title: "Next match", onClick: () => this.step(1) }),
      h("span", { class: "toolbar-sep" }),
      button({ icon: "expand", title: "Expand all", onClick: () => this.expandAll() }),
      button({ icon: "collapse", title: "Collapse all", onClick: () => this.collapseAll() }),
      button({
        icon: "layers",
        title: "Expand to level…",
        onClick: (e) =>
          showMenu(
            e.currentTarget as HTMLElement,
            [1, 2, 3, 4, 5].map((n) => ({ label: `Level ${n}`, run: () => this.expandToDepth(n) })),
            "end",
          ),
      }),
    );
    this.detail = h("div", { class: "tree-detail", hidden: true });
    this.body = h("div", { class: "tree", role: "tree", "aria-label": "JSON tree", tabindex: 0 });
    this.body.addEventListener("keydown", (e) => this.onKey(e));
    this.el = h("div", { class: "view view-tree" }, toolbar, this.detail, this.body);

    store.on("cursor", ({ offset }) => {
      if (!this.visible || !this.ast || document.activeElement?.closest(".view-tree")) return;
      const at = pathAtOffset(this.ast, offset);
      if (at) this.select(at.path, { scroll: true, fromEditor: true });
    });
  }

  show(): void {
    this.visible = true;
  }
  hide(): void {
    this.visible = false;
  }

  update(a: Analysis): void {
    if (!a.ok || !a.ast) {
      this.ast = null;
      this.lastText = "";
      return;
    }
    if (a.text === this.lastText && this.ast) return;
    const firstRender = this.ast === null || this.lastText === "";
    this.lastText = a.text;
    this.ast = a.ast;
    if (firstRender && this.expanded.size <= 1) this.autoExpand();
    if (this.query) this.computeMatches();
    this.render();
  }

  private autoExpand(): void {
    if (!this.ast) return;
    this.expanded = new Set([pathKey([])]);
    // Expand the first couple of levels for small documents, just the root for big ones.
    const budget = 120;
    let shown = 0;
    const walk = (n: JsonNode, path: Path, depth: number) => {
      if (depth > 2 || shown > budget) return;
      const kids = n.type === "object" ? n.props.map((p) => [p.key, p.value] as const) : n.type === "array" ? n.items.map((v, i) => [i, v] as const) : [];
      shown += kids.length;
      if (depth > 0 && shown > budget) return;
      this.expanded.add(pathKey(path));
      for (const [k, v] of kids.slice(0, 20)) if (count(v)) walk(v, [...path, k], depth + 1);
    };
    walk(this.ast, [], 0);
  }

  /* ---------------------------------------------------------- rendering */

  private render(): void {
    const scroll = this.body.scrollTop;
    this.rows.clear();
    if (!this.ast) return;
    const frag = document.createDocumentFragment();
    frag.append(this.node(this.ast, [], undefined, 0, true));
    this.body.replaceChildren(frag);
    this.body.scrollTop = scroll;
    if (this.selected) {
      const row = this.rows.get(pathKey(this.selected));
      if (row) row.classList.add("selected");
      else this.selected = null;
    }
    this.renderDetail();
  }

  private node(n: JsonNode, path: Path, key: string | number | undefined, depth: number, last: boolean): HTMLElement {
    const k = pathKey(path);
    const container = n.type === "object" || n.type === "array";
    const isOpen = container && this.expanded.has(k);
    const row = h("div", {
      class: "tn-row",
      role: "treeitem",
      tabindex: -1,
      "aria-level": String(depth + 1),
      "aria-expanded": container ? String(isOpen) : undefined,
      style: `--depth:${depth}`,
    });
    (row as HTMLElement & { _path?: Path })._path = path;
    this.rows.set(k, row);

    row.append(
      container
        ? h("button", { class: "tn-caret", type: "button", tabindex: -1, "aria-label": isOpen ? "Collapse" : "Expand", onclick: (e: Event) => { e.stopPropagation(); this.toggle(path); } }, icon("chevronRight", 14))
        : h("span", { class: "tn-caret tn-leaf" }),
    );
    if (key !== undefined) {
      const keyEl = typeof key === "number"
        ? h("span", { class: "tn-index" }, String(key))
        : h("span", { class: "tn-key" }, this.highlight(key, this.matchKeys.has(k + "#key")));
      row.append(keyEl, h("span", { class: "tn-colon" }, ":"));
    }
    if (container) {
      const c = count(n);
      const open = n.type === "object" ? "{" : "[";
      const close = n.type === "object" ? "}" : "]";
      row.append(h("span", { class: "tn-brace" }, isOpen ? open : `${open}`));
      if (!isOpen) {
        row.append(h("span", { class: "tn-preview" }, this.preview(n)), h("span", { class: "tn-brace" }, close));
      }
      row.append(h("span", { class: "tn-count" }, `${c} ${n.type === "object" ? (c === 1 ? "key" : "keys") : c === 1 ? "item" : "items"}`));
    } else {
      row.append(this.value(n, key, this.matchKeys.has(k + "#value")));
    }
    if (!last && !(container && isOpen)) row.append(h("span", { class: "tn-comma" }, ","));
    row.append(
      h(
        "span",
        { class: "tn-actions" },
        h("button", { type: "button", class: "tn-act", title: "Copy value", tabindex: -1, onclick: (e: Event) => { e.stopPropagation(); this.copyValue(n); } }, icon("copy", 13)),
        h("button", { type: "button", class: "tn-act", title: "Copy path", tabindex: -1, onclick: (e: Event) => { e.stopPropagation(); this.ctx.copy(toJsonPath(path), "Path"); } }, icon("link", 13)),
      ),
    );
    row.addEventListener("click", () => this.select(path, { reveal: true }));
    row.addEventListener("dblclick", (e) => {
      if (container) {
        e.preventDefault();
        this.toggle(path);
      }
    });

    if (!isOpen) return row;

    const wrap = h("div", { class: "tn" }, row);
    const group = h("div", { class: "tn-children", role: "group", style: `--depth:${depth}` });
    const entries: [string | number, JsonNode][] =
      n.type === "object" ? n.props.map((p) => [p.key, p.value]) : (n as Extract<JsonNode, { type: "array" }>).items.map((v, i) => [i, v]);
    const limitKey = k + "#limit";
    const limit = Math.max(CHUNK, this.limits.get(limitKey) ?? CHUNK);
    entries.slice(0, limit).forEach(([ck, cv], i) => {
      group.append(this.node(cv, [...path, ck], ck, depth + 1, i === entries.length - 1));
    });
    if (entries.length > limit) {
      const more = h(
        "button",
        {
          type: "button",
          class: "tn-more",
          style: `--depth:${depth + 1}`,
          onclick: () => {
            this.limits.set(limitKey, limit + CHUNK * 5);
            this.render();
          },
        },
        `Show ${Math.min(CHUNK * 5, entries.length - limit).toLocaleString()} more of ${(entries.length - limit).toLocaleString()} remaining`,
      );
      group.append(more);
    }
    wrap.append(group);
    wrap.append(
      h(
        "div",
        { class: "tn-row tn-close", style: `--depth:${depth}` },
        h("span", { class: "tn-caret tn-leaf" }),
        h("span", { class: "tn-brace" }, n.type === "object" ? "}" : "]"),
        last ? null : h("span", { class: "tn-comma" }, ","),
      ),
    );
    return wrap;
  }

  private limits = new Map<string, number>();

  private preview(n: JsonNode): string {
    if (n.type === "object") {
      const keys = n.props.slice(0, 4).map((p) => p.key);
      return keys.length ? ` ${keys.join(", ")}${n.props.length > 4 ? ", …" : ""} ` : "";
    }
    if (n.type === "array") {
      if (!n.items.length) return "";
      const prims = n.items.slice(0, 5).every((i) => i.type !== "object" && i.type !== "array");
      if (prims) {
        const s = n.items.slice(0, 5).map((i) => minify(i)).join(", ");
        return ` ${s.length > 60 ? s.slice(0, 60) + "…" : s}${n.items.length > 5 ? ", …" : ""} `;
      }
      return " … ";
    }
    return "";
  }

  private highlight(text: string, isMatch: boolean): Node | string {
    if (!isMatch || !this.query) return text;
    const q = this.query.toLowerCase();
    const i = text.toLowerCase().indexOf(q);
    if (i < 0) return text;
    const span = h("span", null, text.slice(0, i), h("mark", null, text.slice(i, i + q.length)), text.slice(i + q.length));
    return span;
  }

  private value(n: JsonNode, key: string | number | undefined, isMatch: boolean): HTMLElement {
    const el = h("span", { class: `tn-value tn-${n.type}` });
    if (n.type === "string") {
      const v = n.value;
      const shown = v.length > 400 ? v.slice(0, 400) + "…" : v;
      const display = JSON.stringify(shown).slice(1, -1);
      if (COLOR_RE.test(v)) {
        // Assign through CSSOM so the value can only ever be a single colour.
        const sw = h("span", { class: "tn-swatch" });
        sw.style.backgroundColor = v;
        el.append(sw);
      }
      el.append(h("span", { class: "tn-text" }, '"', this.highlight(display, isMatch), '"'));
      if (URL_RE.test(v)) {
        el.append(
          h("a", { class: "tn-link", href: v, target: "_blank", rel: "noopener noreferrer nofollow", title: "Open link", onclick: (e: Event) => e.stopPropagation() }, icon("external", 12)),
        );
      }
      if (v.length > 400) el.title = `${v.length.toLocaleString()} characters`;
    } else {
      el.append(this.highlight(minify(n), isMatch));
      if (n.type === "number" && /^-?\d+$/.test(n.raw) && !Number.isSafeInteger(n.value)) {
        el.append(h("span", { class: "tn-badge tn-badge-warn", title: "Exceeds Number.MAX_SAFE_INTEGER — JavaScript would round this value" }, "big int"));
      }
    }
    const hint = dateHint(n, key);
    if (hint) {
      el.title = hint;
      el.append(h("span", { class: "tn-hint" }, icon("info", 11)));
    }
    return el;
  }

  /* ------------------------------------------------------------ actions */

  private copyValue(n: JsonNode): void {
    const text = n.type === "string" ? n.value : print(n, { indent: store.settings.indent });
    this.ctx.copy(text, "Value");
  }

  private toggle(path: Path): void {
    const k = pathKey(path);
    if (this.expanded.has(k)) this.expanded.delete(k);
    else this.expanded.add(k);
    this.render();
    this.rows.get(k)?.focus({ preventScroll: true });
  }

  private expandPathTo(path: Path): boolean {
    let changed = false;
    for (let i = 0; i < path.length; i++) {
      const k = pathKey(path.slice(0, i));
      if (!this.expanded.has(k)) {
        this.expanded.add(k);
        changed = true;
      }
    }
    // Make sure paged arrays show the target index.
    for (let i = 0; i < path.length; i++) {
      const seg = path[i];
      if (typeof seg === "number" && seg >= CHUNK) {
        const lk = pathKey(path.slice(0, i)) + "#limit";
        if ((this.limits.get(lk) ?? CHUNK) <= seg) {
          this.limits.set(lk, seg + CHUNK);
          changed = true;
        }
      }
    }
    return changed;
  }

  select(path: Path, opts: { reveal?: boolean; scroll?: boolean; fromEditor?: boolean } = {}): void {
    if (!this.ast) return;
    if (this.expandPathTo(path)) this.render();
    this.rows.forEach((r) => r.classList.remove("selected"));
    this.selected = path;
    const row = this.rows.get(pathKey(path));
    if (row) {
      row.classList.add("selected");
      if (opts.scroll || !opts.fromEditor) scrollWithin(this.body, row);
      if (!opts.fromEditor) row.focus({ preventScroll: true });
    }
    this.renderDetail();
    if (opts.reveal) this.ctx.reveal(path, false);
  }

  private renderDetail(): void {
    const path = this.selected;
    if (!path) {
      this.detail.hidden = true;
      return;
    }
    this.detail.hidden = false;
    const formats: [string, string][] = [
      ["JSONPath", toJsonPath(path)],
      ["JavaScript", toAccessor(path)],
      ["jq", toJq(path)],
      ["Pointer", toPointer(path) || "/"],
    ];
    const crumbs = h("div", { class: "crumbs" });
    const segs: Path = [];
    crumbs.append(h("button", { type: "button", class: "crumb", onclick: () => this.select([], { reveal: true }) }, "$"));
    for (const seg of path) {
      segs.push(seg);
      const target = [...segs];
      crumbs.append(h("span", { class: "crumb-sep" }, icon("chevronRight", 12)), h("button", { type: "button", class: "crumb", onclick: () => this.select(target, { reveal: true }) }, typeof seg === "number" ? `[${seg}]` : seg));
    }
    this.detail.replaceChildren(
      crumbs,
      h(
        "div",
        { class: "path-formats" },
        formats.map(([label, value]) =>
          h(
            "button",
            { type: "button", class: "path-chip", title: `Copy ${label}: ${value}`, onclick: () => this.ctx.copy(value, label) },
            h("span", { class: "path-chip-label" }, label),
            h("code", null, value),
          ),
        ),
        button({ icon: "crosshair", title: "Reveal in editor", onClick: () => this.ctx.reveal(path, true) }),
      ),
    );
  }

  private expandAll(): void {
    if (!this.ast) return;
    let budget = 20000;
    const walk = (n: JsonNode, path: Path) => {
      if (budget-- <= 0) return;
      if (n.type === "object") {
        this.expanded.add(pathKey(path));
        n.props.forEach((p) => walk(p.value, [...path, p.key]));
      } else if (n.type === "array") {
        this.expanded.add(pathKey(path));
        n.items.slice(0, CHUNK).forEach((v, i) => walk(v, [...path, i]));
      }
    };
    walk(this.ast, []);
    this.render();
  }

  private expandToDepth(depth: number): void {
    if (!this.ast) return;
    this.expanded = new Set();
    const walk = (n: JsonNode, path: Path, d: number) => {
      if (d >= depth) return;
      if (n.type === "object") {
        this.expanded.add(pathKey(path));
        n.props.forEach((p) => walk(p.value, [...path, p.key], d + 1));
      } else if (n.type === "array") {
        this.expanded.add(pathKey(path));
        n.items.slice(0, CHUNK).forEach((v, i) => walk(v, [...path, i], d + 1));
      }
    };
    walk(this.ast, [], 0);
    this.render();
  }

  private collapseAll(): void {
    this.expanded = new Set([pathKey([])]);
    this.limits.clear();
    this.render();
  }

  /* ------------------------------------------------------------- search */

  private search(q: string): void {
    this.query = q.trim();
    this.computeMatches();
    this.matchIndex = -1;
    if (this.matches.length) {
      // Expand everything that leads to a match (bounded).
      for (const m of this.matches.slice(0, 400)) this.expandPathTo(m.on === "key" ? m.path : m.path);
    }
    this.render();
    if (this.matches.length) this.step(1);
  }

  private computeMatches(): void {
    this.matches = [];
    this.matchKeys = new Set();
    if (!this.query || !this.ast) {
      this.searchInfo.textContent = "";
      return;
    }
    const q = this.query.toLowerCase();
    const max = 5000;
    const walk = (n: JsonNode, path: Path): void => {
      if (this.matches.length >= max) return;
      if (n.type === "object") {
        for (const p of n.props) {
          const cp = [...path, p.key];
          if (p.key.toLowerCase().includes(q)) {
            this.matches.push({ path: cp, on: "key" });
            this.matchKeys.add(pathKey(cp) + "#key");
          }
          walk(p.value, cp);
        }
      } else if (n.type === "array") {
        n.items.forEach((v, i) => walk(v, [...path, i]));
      } else {
        const text = n.type === "string" ? JSON.stringify(n.value).slice(1, -1) : minify(n);
        if (text.toLowerCase().includes(q)) {
          this.matches.push({ path, on: "value" });
          this.matchKeys.add(pathKey(path) + "#value");
        }
      }
    };
    walk(this.ast, []);
    this.searchInfo.textContent = this.matches.length ? `${this.matches.length >= max ? "5000+" : this.matches.length}` : "0";
  }

  private step(dir: 1 | -1): void {
    if (!this.matches.length) return;
    this.matchIndex = (this.matchIndex + dir + this.matches.length) % this.matches.length;
    const m = this.matches[this.matchIndex];
    this.searchInfo.textContent = `${this.matchIndex + 1}/${this.matches.length}`;
    if (this.expandPathTo(m.path)) this.render();
    this.rows.forEach((r) => r.classList.remove("current-match"));
    const row = this.rows.get(pathKey(m.path));
    row?.classList.add("current-match");
    if (row) scrollWithin(this.body, row);
  }

  /* ----------------------------------------------------------- keyboard */

  private onKey(e: KeyboardEvent): void {
    const rows = Array.from(this.body.querySelectorAll<HTMLElement>(".tn-row:not(.tn-close)"));
    if (!rows.length) return;
    const cur = (document.activeElement as HTMLElement)?.closest(".tn-row") as HTMLElement | null;
    let i = cur ? rows.indexOf(cur) : -1;
    const pathOf = (el: HTMLElement) => (el as HTMLElement & { _path?: Path })._path ?? [];
    const focus = (el: HTMLElement | undefined) => {
      if (!el) return;
      el.focus({ preventScroll: true });
      scrollWithin(this.body, el, false);
      const p = pathOf(el);
      this.rows.forEach((r) => r.classList.remove("selected"));
      el.classList.add("selected");
      this.selected = p;
      this.renderDetail();
    };
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focus(rows[Math.min(rows.length - 1, i + 1)]);
        break;
      case "ArrowUp":
        e.preventDefault();
        focus(rows[Math.max(0, i - 1)]);
        break;
      case "ArrowRight":
        if (cur && cur.getAttribute("aria-expanded") === "false") {
          e.preventDefault();
          this.toggle(pathOf(cur));
        } else if (cur) {
          e.preventDefault();
          focus(rows[i + 1]);
        }
        break;
      case "ArrowLeft":
        if (cur && cur.getAttribute("aria-expanded") === "true") {
          e.preventDefault();
          this.toggle(pathOf(cur));
        } else if (cur) {
          e.preventDefault();
          const p = pathOf(cur);
          if (p.length) this.select(p.slice(0, -1));
        }
        break;
      case "Enter":
        if (cur) {
          e.preventDefault();
          this.ctx.reveal(pathOf(cur), true);
        }
        break;
      case "Home":
        e.preventDefault();
        focus(rows[0]);
        break;
      case "End":
        e.preventDefault();
        focus(rows[rows.length - 1]);
        break;
      default:
        if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          this.searchInput.focus();
        }
        if (i < 0 && e.key.length === 1) return;
    }
  }

  focusSearch(): void {
    this.searchInput.focus();
    this.searchInput.select();
  }
}
