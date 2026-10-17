import type { Analysis } from "../state";
import { store } from "../state";
import { diffLines, diffValues, type Change } from "../lib/diff";
import { parse, toValue, fromValue } from "../lib/parse";
import { print, sortKeys } from "../lib/format";
import { toJsonPath } from "../lib/path";
import { SAMPLES, diffSample } from "../samples";
import { button, debounce, h, segmented } from "../ui/dom";
import { Editor } from "../ui/editor";
import { icon } from "../ui/icons";
import type { AppContext, View } from "./types";

function short(v: unknown): string {
  const s = JSON.stringify(v);
  if (s === undefined) return "undefined";
  return s.length > 120 ? s.slice(0, 120) + "…" : s;
}

export class DiffView implements View {
  id = "diff" as const;
  label = "Diff";
  icon = "diff" as const;
  el: HTMLElement;

  private other: Editor;
  private source: HTMLSelectElement;
  private results: HTMLElement;
  private summary: HTMLElement;
  private keyInput: HTMLInputElement;
  private mode: "changes" | "text" = "changes";
  private sortToggle: HTMLInputElement;
  private left: Analysis | null = null;

  constructor(private ctx: AppContext) {
    this.source = h("select", { class: "select select-sm", "aria-label": "Compare with" });
    this.source.addEventListener("change", () => {
      const id = this.source.value;
      const doc = store.docs.find((d) => d.id === id);
      if (doc) this.other.setText(doc.text, { resetSelection: true });
      this.compare();
    });
    const host = h("div", { class: "output-editor diff-input" });
    const saved = localStorage.getItem("jt.diff.other") ?? "";
    this.other = new Editor(host, {
      doc: saved,
      lang: "json",
      label: "JSON to compare against",
      placeholder: "Paste the JSON to compare against…",
      onChange: debounce((t: string) => {
        try {
          localStorage.setItem("jt.diff.other", t.length < 1e6 ? t : "");
        } catch {
          /* ignore quota */
        }
        this.source.value = "";
        this.compare();
      }, 250),
    });
    this.keyInput = h("input", { class: "input input-sm key-input", placeholder: "e.g. id", "aria-label": "Match array items by key", spellcheck: false, value: localStorage.getItem("jt.diff.key") ?? "" });
    this.keyInput.addEventListener(
      "input",
      debounce(() => {
        localStorage.setItem("jt.diff.key", this.keyInput.value);
        this.compare();
      }, 250),
    );
    this.sortToggle = h("input", { type: "checkbox", checked: true });
    this.sortToggle.addEventListener("change", () => this.compare());
    this.summary = h("div", { class: "diff-summary" });
    this.results = h("div", { class: "diff-results" });

    this.el = h(
      "div",
      { class: "view view-diff" },
      h(
        "div",
        { class: "result-bar" },
        h("span", { class: "muted small" }, "Compare current document with"),
        this.source,
        h("span", { class: "spacer" }),
        button({ icon: "sparkles", label: "Example", compact: true, title: "Load an example comparison", onClick: () => this.example() }),
        button({ icon: "arrowUpDown", title: "Swap sides", onClick: () => this.swap() }),
      ),
      host,
      h(
        "div",
        { class: "view-toolbar view-toolbar-wrap" },
        segmented<"changes" | "text">(
          [
            { value: "changes", label: "Changes" },
            { value: "text", label: "Text diff" },
          ],
          "changes",
          (m) => {
            this.mode = m;
            this.compare();
          },
          "Diff mode",
        ),
        h("label", { class: "field-inline", title: "Match array items by this key instead of by position" }, h("span", { class: "muted small" }, "Match arrays by"), this.keyInput),
        h("label", { class: "check" }, this.sortToggle, h("span", null, "Ignore key order")),
        this.summary,
      ),
      this.results,
    );
    store.on("docs", () => this.renderSources());
    this.renderSources();
  }

  private renderSources(): void {
    const cur = this.source.value;
    this.source.replaceChildren(
      h("option", { value: "" }, "Pasted JSON"),
      ...store.docs.filter((d) => d.id !== store.activeId).map((d) => h("option", { value: d.id, selected: d.id === cur }, `Tab: ${d.name}`)),
    );
  }

  update(a: Analysis): void {
    this.left = a;
    this.renderSources();
    this.compare();
  }

  private example(): void {
    const sample = SAMPLES[0];
    if (store.active.text !== sample.text) this.ctx.openDocument(sample.text, "Diff example");
    this.other.setText(diffSample(), { resetSelection: true });
  }

  private swap(): void {
    const mine = store.active.text;
    const theirs = this.other.text;
    this.ctx.replaceDocument(theirs);
    this.other.setText(mine, { resetSelection: true });
  }

  private compare(): void {
    const a = this.left;
    const otherText = this.other.text;
    if (!a || !a.ok) {
      this.summary.replaceChildren();
      this.results.replaceChildren(h("div", { class: "empty-note" }, "The current document needs to be valid JSON to compare."));
      return;
    }
    if (!otherText.trim()) {
      this.summary.replaceChildren();
      this.results.replaceChildren(
        h("div", { class: "empty-note" }, "Paste a second JSON document above, pick another tab, or ", h("button", { type: "button", class: "link-btn", onclick: () => this.example() }, "load an example"), "."),
      );
      return;
    }
    const r = parse(otherText, { loose: store.active.mode === "json5" });
    if (!r.ok) {
      this.summary.replaceChildren();
      this.results.replaceChildren(h("div", { class: "empty-note error" }, icon("alert"), ` Comparison JSON is invalid — line ${r.error.line}, col ${r.error.column}: ${r.error.message}`));
      return;
    }
    const b = toValue(r.ast);
    if (this.mode === "changes") this.renderChanges(diffValues(a.value, b, { arrayKey: this.keyInput.value.trim() || undefined }));
    else this.renderText(a.value, b);
  }

  private renderChanges(changes: Change[]): void {
    const n = { added: 0, removed: 0, changed: 0 };
    for (const c of changes) n[c.kind === "type" ? "changed" : c.kind]++;
    this.summary.replaceChildren(
      h("span", { class: "diff-pill add" }, `+${n.added}`),
      h("span", { class: "diff-pill del" }, `−${n.removed}`),
      h("span", { class: "diff-pill mod" }, `~${n.changed}`),
    );
    if (!changes.length) {
      this.results.replaceChildren(h("div", { class: "empty-note ok" }, icon("checkCircle"), " The documents are semantically identical."));
      return;
    }
    const list = h("div", { class: "change-list" });
    for (const c of changes.slice(0, 3000)) {
      const sym = c.kind === "added" ? "+" : c.kind === "removed" ? "−" : "~";
      list.append(
        h(
          "div",
          { class: `change change-${c.kind}` },
          h("span", { class: "change-sym" }, sym),
          h(
            "button",
            { type: "button", class: "change-path", title: "Reveal in editor", onclick: () => c.kind !== "added" && this.ctx.reveal(c.path, true) },
            toJsonPath(c.path),
          ),
          h(
            "div",
            { class: "change-values" },
            c.kind !== "added" ? h("code", { class: "v-before" }, short(c.before)) : null,
            c.kind === "changed" || c.kind === "type" ? icon("arrowRight", 12) : null,
            c.kind !== "removed" ? h("code", { class: "v-after" }, short(c.after)) : null,
            c.kind === "type" ? h("span", { class: "tn-badge" }, "type changed") : null,
          ),
        ),
      );
    }
    if (changes.length > 3000) list.append(h("div", { class: "empty-note" }, `…and ${changes.length - 3000} more`));
    this.results.replaceChildren(list);
  }

  private renderText(a: unknown, b: unknown): void {
    const norm = (v: unknown) => {
      const ast = fromValue(v);
      return print(this.sortToggle.checked ? sortKeys(ast) : ast, { indent: 2 });
    };
    const ops = diffLines(norm(a), norm(b));
    let add = 0;
    let del = 0;
    for (const o of ops) {
      if (o.op === "insert") add++;
      else if (o.op === "delete") del++;
    }
    this.summary.replaceChildren(h("span", { class: "diff-pill add" }, `+${add}`), h("span", { class: "diff-pill del" }, `−${del}`));
    // Collapse long unchanged runs.
    const rows: Node[] = [];
    const CONTEXT = 3;
    let i = 0;
    while (i < ops.length) {
      if (ops[i].op === "equal") {
        let j = i;
        while (j < ops.length && ops[j].op === "equal") j++;
        const run = j - i;
        const startKeep = i === 0 ? 0 : CONTEXT;
        const endKeep = j === ops.length ? 0 : CONTEXT;
        if (run > startKeep + endKeep + 2) {
          for (let k = i; k < i + startKeep; k++) rows.push(this.line(ops[k]));
          const hidden = ops.slice(i + startKeep, j - endKeep);
          const fold = h("button", { type: "button", class: "diff-fold" }, `⋯ ${hidden.length} unchanged lines`);
          fold.addEventListener("click", () => fold.replaceWith(...hidden.map((o) => this.line(o))));
          rows.push(fold);
          for (let k = j - endKeep; k < j; k++) rows.push(this.line(ops[k]));
        } else {
          for (let k = i; k < j; k++) rows.push(this.line(ops[k]));
        }
        i = j;
      } else {
        rows.push(this.line(ops[i]));
        i++;
      }
    }
    this.results.replaceChildren(add + del === 0 ? h("div", { class: "empty-note ok" }, icon("checkCircle"), " No differences.") : h("div", { class: "text-diff" }, rows));
  }

  private line(o: { op: string; text: string; a?: number; b?: number }): HTMLElement {
    return h(
      "div",
      { class: `dl dl-${o.op}` },
      h("span", { class: "dl-n" }, o.a ? String(o.a) : ""),
      h("span", { class: "dl-n" }, o.b ? String(o.b) : ""),
      h("span", { class: "dl-sym" }, o.op === "insert" ? "+" : o.op === "delete" ? "−" : " "),
      h("span", { class: "dl-text" }, o.text || " "),
    );
  }
}
