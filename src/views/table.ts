import type { Analysis } from "../state";
import { toCsv } from "../lib/convert";
import { minify } from "../lib/format";
import { toValue, type JsonNode } from "../lib/parse";
import { nodeAtPath, toJsonPath, type Path } from "../lib/path";
import { button, debounce, h } from "../ui/dom";
import { icon } from "../ui/icons";
import type { AppContext, View } from "./types";

const PAGE = 300;

interface Source {
  path: Path;
  label: string;
  length: number;
}

/** Find arrays worth tabulating (arrays of objects first). */
function findArrays(root: JsonNode, maxDepth = 6): Source[] {
  const out: (Source & { score: number })[] = [];
  const walk = (n: JsonNode, path: Path, depth: number) => {
    if (depth > maxDepth || out.length > 50) return;
    if (n.type === "array") {
      const objs = n.items.filter((x) => x.type === "object").length;
      if (n.items.length) out.push({ path, label: toJsonPath(path), length: n.items.length, score: objs / n.items.length + (objs ? 1 : 0) });
      n.items.slice(0, 3).forEach((x, i) => walk(x, [...path, i], depth + 1));
    } else if (n.type === "object") {
      for (const p of n.props) walk(p.value, [...path, p.key], depth + 1);
    }
  };
  walk(root, [], 0);
  // Prefer arrays of objects, then shallow ones, then longer ones.
  return out.sort((a, b) => b.score - a.score || a.path.length - b.path.length || b.length - a.length);
}

/** Display text for a cell; numbers keep their exact source digits. */
function cellText(n: JsonNode | undefined): string {
  if (!n) return "";
  if (n.type === "string") return n.value;
  return minify(n);
}

function cmp(a: JsonNode | undefined, b: JsonNode | undefined): number {
  if (a === b) return 0;
  if (!a || a.type === "null") return 1;
  if (!b || b.type === "null") return -1;
  if (a.type === "number" && b.type === "number") return a.value - b.value;
  return cellText(a).localeCompare(cellText(b), undefined, { numeric: true, sensitivity: "base" });
}

function field(item: JsonNode, col: string): JsonNode | undefined {
  if (col === "(value)") return item.type === "object" || item.type === "array" ? undefined : item;
  if (item.type !== "object") return undefined;
  let found: JsonNode | undefined;
  for (const p of item.props) if (p.key === col) found = p.value;
  return found;
}

export class TableView implements View {
  id = "table" as const;
  label = "Table";
  icon = "table" as const;
  el: HTMLElement;

  private sourceSelect: HTMLSelectElement;
  private filterInput: HTMLInputElement;
  private info: HTMLElement;
  private grid: HTMLElement;
  private ast: JsonNode | null = null;
  private sources: Source[] = [];
  private sourcePath: Path | null = null;
  private sort: { col: string; dir: 1 | -1 } | null = null;
  private filter = "";
  private limit = PAGE;
  private lastText = "";

  constructor(private ctx: AppContext) {
    this.sourceSelect = h("select", { class: "select select-sm", "aria-label": "Array to display" });
    this.sourceSelect.addEventListener("change", () => {
      this.sourcePath = JSON.parse(this.sourceSelect.value) as Path;
      this.sort = null;
      this.limit = PAGE;
      this.render();
    });
    this.filterInput = h("input", { type: "search", class: "input input-sm", placeholder: "Filter rows…", "aria-label": "Filter rows", spellcheck: false });
    this.filterInput.addEventListener(
      "input",
      debounce(() => {
        this.filter = this.filterInput.value.trim().toLowerCase();
        this.limit = PAGE;
        this.render();
      }, 150),
    );
    this.info = h("span", { class: "muted small" });
    this.grid = h("div", { class: "table-wrap" });
    this.el = h(
      "div",
      { class: "view view-table" },
      h(
        "div",
        { class: "view-toolbar" },
        h("label", { class: "field-inline" }, h("span", { class: "muted small" }, "Array"), this.sourceSelect),
        h("div", { class: "search-field" }, icon("filter"), this.filterInput),
        this.info,
        h("span", { class: "spacer" }),
        button({ icon: "download", label: "CSV", title: "Download as CSV", compact: true, onClick: () => this.exportCsv() }),
      ),
      this.grid,
    );
  }

  update(a: Analysis): void {
    if (!a.ok) return;
    if (a.text === this.lastText) return;
    this.lastText = a.text;
    this.ast = a.ast;
    this.sources = a.ast ? findArrays(a.ast) : [];
    const keep = this.sourcePath && this.sources.some((s) => JSON.stringify(s.path) === JSON.stringify(this.sourcePath));
    if (!keep) {
      this.sourcePath = this.sources[0]?.path ?? null;
      this.sort = null;
    }
    this.sourceSelect.replaceChildren(
      ...(this.sources.length
        ? this.sources.map((s) => h("option", { value: JSON.stringify(s.path), selected: JSON.stringify(s.path) === JSON.stringify(this.sourcePath) }, `${s.label}  (${s.length.toLocaleString()})`))
        : [h("option", { value: "[]" }, "$ (root)")]),
    );
    this.render();
  }

  private target(): JsonNode | null {
    if (!this.ast) return null;
    return this.sourcePath ? nodeAtPath(this.ast, this.sourcePath) : this.ast;
  }

  private rows(): { cols: string[]; rows: { index: number; item: JsonNode }[]; total: number } {
    const target = this.target();
    const items: JsonNode[] = !target ? [] : target.type === "array" ? target.items : [target];
    const colSet = new Set<string>();
    let primitive = false;
    for (const item of items.slice(0, 2000)) {
      if (item.type === "object") item.props.forEach((p) => colSet.add(p.key));
      else primitive = true;
    }
    const cols = [...colSet];
    if (primitive) cols.unshift("(value)");
    let rows = items.map((item, index) => ({ index, item }));
    if (this.filter) rows = rows.filter((r) => minify(r.item).toLowerCase().includes(this.filter));
    if (this.sort) {
      const { col, dir } = this.sort;
      rows = [...rows].sort((a, b) => dir * cmp(field(a.item, col), field(b.item, col)));
    }
    return { cols, rows, total: items.length };
  }

  private render(): void {
    const { cols, rows, total } = this.rows();
    this.info.textContent = this.filter ? `${rows.length.toLocaleString()} of ${total.toLocaleString()} rows` : `${total.toLocaleString()} rows · ${cols.length} columns`;
    const thead = h(
      "thead",
      null,
      h(
        "tr",
        null,
        h("th", { class: "col-index" }, "#"),
        cols.map((c) => {
          const sorted = this.sort?.col === c ? this.sort.dir : 0;
          return h(
            "th",
            { "aria-sort": sorted === 1 ? "ascending" : sorted === -1 ? "descending" : "none" },
            h(
              "button",
              {
                type: "button",
                class: "th-btn",
                onclick: () => {
                  this.sort = this.sort?.col === c ? (this.sort.dir === 1 ? { col: c, dir: -1 } : null) : { col: c, dir: 1 };
                  this.render();
                },
              },
              c,
              sorted ? icon(sorted === 1 ? "chevronUp" : "chevronDown", 12) : null,
            ),
          );
        }),
      ),
    );
    const tbody = h("tbody");
    for (const r of rows.slice(0, this.limit)) {
      const tr = h("tr", null, h("td", { class: "col-index" }, String(r.index)));
      for (const c of cols) {
        const v = field(r.item, c);
        const type = v ? v.type : "undefined";
        const text = cellText(v);
        const count = v?.type === "array" ? `[${v.items.length}]` : v?.type === "object" ? `{${v.props.length}}` : "";
        const td = h(
          "td",
          { class: `cell cell-${type}`, title: text.length > 60 ? text.slice(0, 2000) : undefined },
          count ? h("span", { class: "cell-chip" }, count, " ", text.length > 80 ? text.slice(0, 80) + "…" : text) : text.length > 200 ? text.slice(0, 200) + "…" : text,
        );
        if (this.sourcePath && v) {
          const path: Path = [...this.sourcePath, r.index, ...(c === "(value)" ? [] : [c])];
          td.addEventListener("click", () => this.ctx.reveal(path, false));
        }
        tr.append(td);
      }
      tbody.append(tr);
    }
    const table = h("table", { class: "data-table" }, thead, tbody);
    const children: Node[] = [table];
    if (rows.length > this.limit) {
      children.push(
        h(
          "button",
          {
            type: "button",
            class: "btn btn-subtle table-more",
            onclick: () => {
              this.limit += PAGE * 3;
              this.render();
            },
          },
          `Show more (${(rows.length - this.limit).toLocaleString()} remaining)`,
        ),
      );
    }
    if (!total) children.splice(0, 1, h("div", { class: "empty-note" }, "This array is empty."));
    this.grid.replaceChildren(...children);
  }

  private exportCsv(): void {
    const target = this.target();
    if (!target) return;
    const name = this.ctx.activeName().replace(/\.[^.]+$/, "");
    this.ctx.download(toCsv(toValue(target)), `${name || "data"}.csv`, "text/csv");
  }
}
