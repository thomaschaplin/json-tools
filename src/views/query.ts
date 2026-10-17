import type { Analysis } from "../state";
import { store } from "../state";
import { query, JsonPathError } from "../lib/jsonpath";
import { toJsonPath, type Path } from "../lib/path";
import { fromValue } from "../lib/parse";
import { print } from "../lib/format";
import { button, debounce, h, segmented } from "../ui/dom";
import { Editor } from "../ui/editor";
import { icon } from "../ui/icons";
import type { AppContext, View } from "./types";

type QMode = "jsonpath" | "js";

const EXAMPLES: Record<QMode, { q: string; label: string }[]> = {
  jsonpath: [
    { q: "$..*", label: "Everything" },
    { q: "$.*", label: "Top-level values" },
    { q: "$..[?(@.id)]", label: "Objects with an id" },
    { q: "$..[0]", label: "First items" },
    { q: "$..[-1:]", label: "Last items" },
    { q: "$..[?(@.active == true)]", label: "Filter: active" },
    { q: "$..[?(@.price < 10)]", label: "Filter: price < 10" },
    { q: "$..[?(@.email =~ /example/i)]", label: "Regex" },
  ],
  js: [
    { q: "Object.keys(data)", label: "Keys" },
    { q: "data.data.users.map(u => u.name)", label: "Map" },
    { q: "data.data.users.filter(u => u.active)", label: "Filter" },
    { q: "_.groupBy(data.data.users, 'role')", label: "Group by" },
    { q: "_.countBy(data.data.users, u => u.address.country)", label: "Count by" },
    { q: "_.sum(data.data.users.map(u => u.score))", label: "Sum" },
  ],
};

export class QueryView implements View {
  id = "query" as const;
  label = "Query";
  icon = "search" as const;
  el: HTMLElement;

  private mode: QMode;
  private input: HTMLTextAreaElement;
  private status: HTMLElement;
  private output: Editor;
  private pathsList: HTMLElement;
  private outputHost: HTMLElement;
  private examples: HTMLElement;
  private resultTabs: ReturnType<typeof segmented<"values" | "paths">>;
  private showing: "values" | "paths" = "values";
  private value: unknown;
  private ok = false;
  private resultText = "";
  private worker: Worker | null = null;
  private reqId = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private modeToggle: ReturnType<typeof segmented<QMode>>;

  constructor(private ctx: AppContext) {
    this.mode = (localStorage.getItem("jt.query.mode") as QMode) || "jsonpath";
    this.modeToggle = segmented<QMode>(
      [
        { value: "jsonpath", label: "JSONPath" },
        { value: "js", label: "JavaScript" },
      ],
      this.mode,
      (m) => this.setMode(m),
      "Query language",
    );
    this.input = h("textarea", {
      class: "query-input",
      rows: 1,
      spellcheck: false,
      autocomplete: "off",
      autocapitalize: "off",
      "aria-label": "Query expression",
    });
    this.input.value = this.savedQuery(this.mode);
    const run = debounce(() => this.run(), 220);
    this.input.addEventListener("input", () => {
      this.autosize();
      localStorage.setItem(`jt.query.${this.mode}`, this.input.value);
      run();
    });
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && this.mode === "jsonpath") {
        e.preventDefault();
        run.flush();
        this.run();
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        this.run();
      }
    });
    this.status = h("div", { class: "query-status" });
    this.examples = h("div", { class: "chips" });
    this.outputHost = h("div", { class: "output-editor" });
    this.output = new Editor(this.outputHost, { readOnly: true, lang: "json", label: "Query result", wrap: store.settings.wrap });
    this.pathsList = h("div", { class: "paths-list", hidden: true });
    this.resultTabs = segmented<"values" | "paths">(
      [
        { value: "values", label: "Values" },
        { value: "paths", label: "Paths" },
      ],
      "values",
      (v) => {
        this.showing = v;
        this.outputHost.hidden = v !== "values";
        this.pathsList.hidden = v !== "paths";
      },
      "Result format",
    );

    this.el = h(
      "div",
      { class: "view view-query" },
      h(
        "div",
        { class: "query-box" },
        h("div", { class: "query-head" }, this.modeToggle, h("span", { class: "spacer" }), h("span", { class: "muted small query-help" }, this.helpText())),
        h("div", { class: "query-field" }, h("span", { class: "query-prompt" }, icon("chevronRight", 14)), this.input, button({ icon: "play", title: "Run query", kbd: "Enter", onClick: () => this.run() })),
        this.examples,
      ),
      h(
        "div",
        { class: "result-bar" },
        this.status,
        h("span", { class: "spacer" }),
        this.resultTabs,
        button({ icon: "copy", title: "Copy result", onClick: () => this.ctx.copy(this.resultText, "Result") }),
        button({ icon: "plus", title: "Open result in a new tab", onClick: () => this.resultText && this.ctx.openDocument(this.resultText, "Query result") }),
        button({ icon: "replace", title: "Replace document with result", onClick: () => this.resultText && this.ctx.replaceDocument(this.resultText) }),
      ),
      this.outputHost,
      this.pathsList,
    );
    this.renderExamples();
    store.on("settings", (s) => {
      if (s.wrap !== undefined) this.output.setWrap(s.wrap);
    });
  }

  private helpText(): string {
    return this.mode === "jsonpath" ? "Enter to run" : "`data` is your JSON · `_` has helpers · Ctrl+Enter";
  }

  private savedQuery(mode: QMode): string {
    return localStorage.getItem(`jt.query.${mode}`) ?? (mode === "jsonpath" ? "$..*" : "Object.keys(data)");
  }

  private setMode(m: QMode): void {
    this.mode = m;
    localStorage.setItem("jt.query.mode", m);
    this.input.value = this.savedQuery(m);
    this.el.querySelector(".query-help")!.textContent = this.helpText();
    this.renderExamples();
    this.autosize();
    this.run();
  }

  private renderExamples(): void {
    this.examples.replaceChildren(
      ...EXAMPLES[this.mode].map((ex) =>
        h(
          "button",
          {
            type: "button",
            class: "chip",
            title: ex.q,
            onclick: () => {
              this.input.value = ex.q;
              localStorage.setItem(`jt.query.${this.mode}`, ex.q);
              this.autosize();
              this.run();
            },
          },
          ex.label,
        ),
      ),
    );
  }

  private autosize(): void {
    this.input.style.height = "auto";
    this.input.style.height = `${Math.min(160, this.input.scrollHeight)}px`;
  }

  show(): void {
    requestAnimationFrame(() => this.autosize());
  }

  update(a: Analysis): void {
    this.ok = a.ok;
    this.value = a.value;
    this.run();
  }

  private setStatus(kind: "ok" | "error" | "busy" | "idle", text: string): void {
    this.status.className = `query-status status-${kind}`;
    this.status.replaceChildren(kind === "ok" ? icon("check", 14) : kind === "error" ? icon("alert", 14) : "", h("span", null, text));
  }

  private showResult(text: string, paths: Path[] | null): void {
    this.resultText = text;
    this.output.setText(text, { resetSelection: true });
    this.resultTabs.hidden = !paths;
    if (!paths && this.showing === "paths") {
      this.resultTabs.set("values");
      this.showing = "values";
      this.outputHost.hidden = false;
      this.pathsList.hidden = true;
    }
    if (paths) {
      this.pathsList.replaceChildren(
        ...paths.slice(0, 2000).map((p) =>
          h("button", { type: "button", class: "path-row", onclick: () => this.ctx.reveal(p, true), title: "Reveal in editor" }, icon("crosshair", 13), h("code", null, toJsonPath(p))),
        ),
      );
    }
  }

  run(): void {
    const q = this.input.value.trim();
    if (!this.ok) {
      this.setStatus("idle", "Waiting for valid JSON");
      this.showResult("", null);
      return;
    }
    if (!q) {
      this.setStatus("idle", "Enter an expression");
      this.showResult("", null);
      return;
    }
    if (this.mode === "jsonpath") {
      try {
        const t0 = performance.now();
        const matches = query(this.value, q);
        const ms = performance.now() - t0;
        const values = matches.map((m) => m.value);
        this.setStatus("ok", `${matches.length.toLocaleString()} match${matches.length === 1 ? "" : "es"} · ${ms < 1 ? "<1" : Math.round(ms)} ms`);
        this.showResult(print(fromValue(values), { indent: store.settings.indent }), matches.map((m) => m.path));
      } catch (e) {
        this.setStatus("error", e instanceof JsonPathError ? e.message : String((e as Error).message));
      }
      return;
    }
    this.runJs(q);
  }

  private runJs(code: string): void {
    if (!this.worker) {
      this.worker = new Worker(new URL("../lib/js-worker.ts", import.meta.url), { type: "module" });
    }
    const id = ++this.reqId;
    const t0 = performance.now();
    this.setStatus("busy", "Running…");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (id !== this.reqId) return;
      this.worker?.terminate();
      this.worker = null;
      this.setStatus("error", "Stopped after 3 s — does the expression loop forever?");
    }, 3000);
    this.worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; json?: string; error?: string }>) => {
      if (e.data.id !== this.reqId) return;
      clearTimeout(this.timer);
      const ms = Math.round(performance.now() - t0);
      if (!e.data.ok) {
        this.setStatus("error", e.data.error ?? "Error");
        return;
      }
      if (e.data.json === undefined) {
        this.setStatus("ok", `undefined · ${ms} ms`);
        this.showResult("", null);
        return;
      }
      const v = JSON.parse(e.data.json) as unknown;
      const kind = Array.isArray(v) ? `${v.length.toLocaleString()} item${v.length === 1 ? "" : "s"}` : v === null ? "null" : typeof v;
      this.setStatus("ok", `${kind} · ${ms} ms`);
      this.showResult(print(fromValue(v), { indent: store.settings.indent }), null);
    };
    this.worker.postMessage({ id, code, data: this.value });
  }

  focusInput(): void {
    this.input.focus();
  }
}
