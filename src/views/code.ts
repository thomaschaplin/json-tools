import type { Analysis } from "../state";
import { store } from "../state";
import { toGo, toJsonSchema, toKotlin, toPython, toRust, toTypeScript, toZod } from "../lib/codegen";
import { button, debounce, h } from "../ui/dom";
import { Editor, type Lang } from "../ui/editor";
import type { AppContext, View } from "./types";

interface Target {
  id: string;
  label: string;
  lang: Lang;
  ext: string;
  gen: (v: unknown, root: string) => string;
}

const TARGETS: Target[] = [
  { id: "typescript", label: "TypeScript", lang: "typescript", ext: "ts", gen: (v, rootName) => toTypeScript(v, { rootName }) },
  { id: "zod", label: "Zod", lang: "typescript", ext: "ts", gen: (v, rootName) => toZod(v, { rootName }) },
  { id: "jsonschema", label: "JSON Schema", lang: "json", ext: "schema.json", gen: (v, title) => JSON.stringify(toJsonSchema(v, { title }), null, 2) + "\n" },
  { id: "go", label: "Go", lang: "go", ext: "go", gen: (v, rootName) => toGo(v, { rootName }) },
  { id: "rust", label: "Rust", lang: "rust", ext: "rs", gen: (v, rootName) => toRust(v, { rootName }) },
  { id: "python", label: "Python", lang: "python", ext: "py", gen: (v, rootName) => toPython(v, { rootName }) },
  { id: "kotlin", label: "Kotlin", lang: "kotlin", ext: "kt", gen: (v, rootName) => toKotlin(v, { rootName }) },
];

export class CodeView implements View {
  id = "code" as const;
  label = "Types";
  icon = "code" as const;
  el: HTMLElement;

  private target: Target;
  private rootInput: HTMLInputElement;
  private tabs: HTMLElement;
  private output: Editor;
  private status: HTMLElement;
  private value: unknown;
  private ok = false;
  private text = "";

  constructor(private ctx: AppContext) {
    const saved = localStorage.getItem("jt.code.target");
    this.target = TARGETS.find((t) => t.id === saved) ?? TARGETS[0];
    this.rootInput = h("input", { class: "input input-sm root-input", value: localStorage.getItem("jt.code.root") || "Root", "aria-label": "Root type name", spellcheck: false });
    this.rootInput.addEventListener(
      "input",
      debounce(() => {
        localStorage.setItem("jt.code.root", this.rootInput.value);
        this.render();
      }, 200),
    );
    this.tabs = h("div", { class: "pill-tabs", role: "tablist", "aria-label": "Target language" });
    const host = h("div", { class: "output-editor" });
    this.output = new Editor(host, { readOnly: true, lang: this.target.lang, label: "Generated code", wrap: false });
    this.status = h("div", { class: "query-status" });
    this.el = h(
      "div",
      { class: "view view-code" },
      h("div", { class: "view-toolbar view-toolbar-wrap" }, this.tabs),
      h(
        "div",
        { class: "result-bar" },
        h("label", { class: "field-inline" }, h("span", { class: "muted small" }, "Root name"), this.rootInput),
        this.status,
        h("span", { class: "spacer" }),
        button({ icon: "copy", label: "Copy", compact: true, title: "Copy code", onClick: () => this.ctx.copy(this.text, this.target.label) }),
        button({ icon: "download", title: "Download", onClick: () => this.download() }),
      ),
      host,
    );
    this.renderTabs();
    store.on("settings", (s) => {
      if (s.wrap !== undefined) this.output.setWrap(s.wrap);
    });
  }

  private renderTabs(): void {
    this.tabs.replaceChildren(
      ...TARGETS.map((t) =>
        h(
          "button",
          {
            type: "button",
            role: "tab",
            class: "pill",
            "aria-selected": String(t === this.target),
            onclick: () => this.setSub(t.id, true),
          },
          t.label,
        ),
      ),
    );
  }

  getSub(): string {
    return this.target.id;
  }

  setSub(sub: string, notify = false): void {
    const t = TARGETS.find((x) => x.id === sub);
    if (!t) return;
    this.target = t;
    localStorage.setItem("jt.code.target", t.id);
    this.output.setLang(t.lang);
    this.renderTabs();
    this.render();
    if (notify) this.ctx.subChanged("code", t.id);
  }

  update(a: Analysis): void {
    this.ok = a.ok;
    this.value = a.value;
    this.render();
  }

  private render(): void {
    if (!this.ok) {
      this.status.textContent = "Waiting for valid JSON";
      this.status.className = "query-status status-idle";
      return;
    }
    try {
      const root = this.rootInput.value.trim() || "Root";
      this.text = this.target.gen(this.value, root);
      this.output.setText(this.text, { resetSelection: true });
      const lines = this.text.split("\n").length - 1;
      this.status.textContent = `${lines} lines`;
      this.status.className = "query-status status-ok";
    } catch (e) {
      this.status.textContent = (e as Error).message;
      this.status.className = "query-status status-error";
    }
  }

  private download(): void {
    const base = (this.rootInput.value.trim() || "types").toLowerCase();
    this.ctx.download(this.text, `${base}.${this.target.ext}`, "text/plain");
  }
}
