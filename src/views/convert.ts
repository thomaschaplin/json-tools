import type { Analysis } from "../state";
import { store } from "../state";
import {
  decodeJwt,
  fromCsv,
  fromNdjson,
  fromQueryString,
  fromXml,
  fromYaml,
  toCsv,
  toMarkdownTable,
  toNdjson,
  toQueryString,
  toToml,
  toXml,
  toYaml,
} from "../lib/convert";
import { print } from "../lib/format";
import { fromValue } from "../lib/parse";
import { IMPORT_SAMPLES } from "../samples";
import { button, debounce, h, segmented } from "../ui/dom";
import { Editor, type Lang } from "../ui/editor";
import type { AppContext, View } from "./types";

interface Exporter {
  id: string;
  label: string;
  lang: Lang;
  ext: string;
  mime: string;
  run: (v: unknown, opts: { root: string }) => string;
}

interface Importer {
  id: string;
  label: string;
  lang: Lang;
  sample: string;
  run: (text: string) => unknown;
  /** Extra info line shown under the input. */
  info?: (value: unknown) => string | null;
}

const EXPORTERS: Exporter[] = [
  { id: "yaml", label: "YAML", lang: "yaml", ext: "yaml", mime: "application/yaml", run: (v) => toYaml(v) },
  { id: "csv", label: "CSV", lang: "text", ext: "csv", mime: "text/csv", run: (v) => toCsv(v) },
  { id: "tsv", label: "TSV", lang: "text", ext: "tsv", mime: "text/tab-separated-values", run: (v) => toCsv(v, { delimiter: "\t" }) },
  { id: "xml", label: "XML", lang: "xml", ext: "xml", mime: "application/xml", run: (v, o) => toXml(v, o.root) },
  { id: "toml", label: "TOML", lang: "toml", ext: "toml", mime: "application/toml", run: (v) => toToml(v) },
  { id: "markdown", label: "Markdown", lang: "text", ext: "md", mime: "text/markdown", run: (v) => toMarkdownTable(v) },
  { id: "ndjson", label: "NDJSON", lang: "json", ext: "ndjson", mime: "application/x-ndjson", run: (v) => toNdjson(v) },
  { id: "query", label: "Query string", lang: "text", ext: "txt", mime: "text/plain", run: (v) => toQueryString(v) + "\n" },
  { id: "string", label: "JSON string", lang: "json", ext: "txt", mime: "text/plain", run: (v) => JSON.stringify(JSON.stringify(v)) + "\n" },
];

function when(seconds: unknown): string | null {
  if (typeof seconds !== "number") return null;
  return new Date(seconds * 1000).toLocaleString();
}

const IMPORTERS: Importer[] = [
  { id: "from-yaml", label: "YAML", lang: "yaml", sample: IMPORT_SAMPLES.yaml, run: fromYaml },
  { id: "from-csv", label: "CSV / TSV", lang: "text", sample: IMPORT_SAMPLES.csv, run: (t) => fromCsv(t) },
  { id: "from-xml", label: "XML", lang: "xml", sample: IMPORT_SAMPLES.xml, run: fromXml },
  { id: "from-ndjson", label: "NDJSON", lang: "json", sample: IMPORT_SAMPLES.ndjson, run: fromNdjson },
  {
    id: "from-jwt",
    label: "JWT",
    lang: "text",
    sample: IMPORT_SAMPLES.jwt,
    run: decodeJwt,
    info: (v) => {
      const p = (v as { payload?: Record<string, unknown> }).payload ?? {};
      const parts: string[] = [];
      const iat = when(p.iat);
      const exp = when(p.exp);
      const nbf = when(p.nbf);
      if (iat) parts.push(`Issued ${iat}`);
      if (nbf) parts.push(`Valid from ${nbf}`);
      if (exp) parts.push(`${(p.exp as number) * 1000 < Date.now() ? "Expired" : "Expires"} ${exp}`);
      parts.push("Signature not verified");
      return parts.join(" · ");
    },
  },
  { id: "from-query", label: "URL / query string", lang: "text", sample: IMPORT_SAMPLES.query, run: fromQueryString },
];

export class ConvertView implements View {
  id = "convert" as const;
  label = "Convert";
  icon = "convert" as const;
  el: HTMLElement;

  private direction: "export" | "import" = "export";
  private exporter = EXPORTERS[0];
  private importer = IMPORTERS[0];
  private tabs: HTMLElement;
  private dirToggle: ReturnType<typeof segmented<"export" | "import">>;
  private exportPane: HTMLElement;
  private importPane: HTMLElement;
  private out: Editor;
  private outStatus: HTMLElement;
  private rootInput: HTMLInputElement;
  private rootField: HTMLElement;
  private input: Editor;
  private preview: Editor;
  private inStatus: HTMLElement;
  private value: unknown;
  private ok = false;
  private outText = "";
  private imported: unknown = undefined;

  constructor(private ctx: AppContext) {
    this.dirToggle = segmented<"export" | "import">(
      [
        { value: "export", label: "JSON → …" },
        { value: "import", label: "… → JSON" },
      ],
      "export",
      (d) => this.setSub(d === "export" ? this.exporter.id : this.importer.id, true),
      "Direction",
    );
    this.tabs = h("div", { class: "pill-tabs", role: "tablist", "aria-label": "Format" });

    // Export pane
    const outHost = h("div", { class: "output-editor" });
    this.out = new Editor(outHost, { readOnly: true, lang: "yaml", label: "Converted output" });
    this.outStatus = h("div", { class: "query-status" });
    this.rootInput = h("input", { class: "input input-sm root-input", value: "root", "aria-label": "XML root element", spellcheck: false });
    this.rootInput.addEventListener("input", debounce(() => this.renderExport(), 200));
    this.rootField = h("label", { class: "field-inline" }, h("span", { class: "muted small" }, "Root element"), this.rootInput);
    this.exportPane = h(
      "div",
      { class: "convert-pane" },
      h(
        "div",
        { class: "result-bar" },
        this.rootField,
        this.outStatus,
        h("span", { class: "spacer" }),
        button({ icon: "copy", label: "Copy", compact: true, title: "Copy output", onClick: () => this.ctx.copy(this.outText, this.exporter.label) }),
        button({ icon: "download", title: "Download", onClick: () => this.downloadExport() }),
      ),
      outHost,
    );

    // Import pane
    const inHost = h("div", { class: "output-editor import-input" });
    this.input = new Editor(inHost, {
      lang: "yaml",
      label: "Input to convert",
      placeholder: "Paste the text to convert…",
      onChange: debounce(() => this.renderImport(), 200),
    });
    const prevHost = h("div", { class: "output-editor import-preview" });
    this.preview = new Editor(prevHost, { readOnly: true, lang: "json", label: "JSON preview" });
    this.inStatus = h("div", { class: "query-status" });
    this.importPane = h(
      "div",
      { class: "convert-pane", hidden: true },
      h(
        "div",
        { class: "result-bar" },
        h("span", { class: "muted small" }, "Input"),
        h("span", { class: "spacer" }),
        button({ icon: "sparkles", label: "Sample", compact: true, title: "Load a sample", onClick: () => this.input.setText(this.importer.sample, { resetSelection: true }) }),
        button({ icon: "trash", title: "Clear input", onClick: () => this.input.setText("") }),
      ),
      inHost,
      h(
        "div",
        { class: "result-bar" },
        this.inStatus,
        h("span", { class: "spacer" }),
        button({ icon: "plus", label: "Open as JSON", variant: "primary", compact: true, title: "Open the result in a new tab", onClick: () => this.commitImport("new") }),
        button({ icon: "replace", title: "Replace the current document", onClick: () => this.commitImport("replace") }),
      ),
      prevHost,
    );

    this.el = h("div", { class: "view view-convert" }, h("div", { class: "view-toolbar view-toolbar-wrap" }, this.dirToggle, this.tabs), this.exportPane, this.importPane);

    const saved = localStorage.getItem("jt.convert.sub");
    if (saved) this.setSub(saved);
    else this.renderTabs();
    store.on("settings", (s) => {
      if (s.wrap !== undefined) {
        this.out.setWrap(s.wrap);
        this.input.setWrap(s.wrap);
        this.preview.setWrap(s.wrap);
      }
      if (s.indent !== undefined) this.renderImport();
    });
  }

  getSub(): string {
    return this.direction === "export" ? this.exporter.id : this.importer.id;
  }

  setSub(sub: string, notify = false): void {
    const imp = IMPORTERS.find((i) => i.id === sub);
    const exp = EXPORTERS.find((e) => e.id === sub);
    if (!imp && !exp) return;
    localStorage.setItem("jt.convert.sub", sub);
    if (imp) {
      this.direction = "import";
      const changed = this.importer !== imp;
      this.importer = imp;
      this.input.setLang(imp.lang);
      if (changed || !this.input.text.trim()) this.input.setText(imp.sample, { resetSelection: true });
      this.renderImport();
    } else if (exp) {
      this.direction = "export";
      this.exporter = exp;
      this.out.setLang(exp.lang);
      this.renderExport();
    }
    this.dirToggle.set(this.direction);
    this.exportPane.hidden = this.direction !== "export";
    this.importPane.hidden = this.direction !== "import";
    this.renderTabs();
    if (notify) this.ctx.subChanged("convert", sub);
  }

  private renderTabs(): void {
    const list = this.direction === "export" ? EXPORTERS : IMPORTERS;
    const current = this.direction === "export" ? this.exporter : this.importer;
    this.tabs.replaceChildren(
      ...list.map((t) =>
        h("button", { type: "button", role: "tab", class: "pill", "aria-selected": String(t === current), onclick: () => this.setSub(t.id, true) }, t.label),
      ),
    );
    this.rootField.hidden = this.exporter.id !== "xml";
  }

  update(a: Analysis): void {
    this.ok = a.ok;
    this.value = a.value;
    if (this.direction === "export") this.renderExport();
  }

  show(): void {
    if (this.direction === "import" && !this.input.text.trim()) this.input.setText(this.importer.sample);
  }

  private renderExport(): void {
    if (!this.ok) {
      this.outStatus.className = "query-status status-idle";
      this.outStatus.textContent = "Waiting for valid JSON";
      return;
    }
    try {
      this.outText = this.exporter.run(this.value, { root: this.rootInput.value.trim() || "root" });
      this.out.setText(this.outText, { resetSelection: true });
      this.outStatus.className = "query-status status-ok";
      this.outStatus.textContent = `${this.outText.split("\n").length - 1} lines`;
    } catch (e) {
      this.outText = "";
      this.out.setText("");
      this.outStatus.className = "query-status status-error";
      this.outStatus.textContent = (e as Error).message;
    }
  }

  private renderImport(): void {
    const text = this.input.text;
    if (!text.trim()) {
      this.imported = undefined;
      this.preview.setText("");
      this.inStatus.className = "query-status status-idle";
      this.inStatus.textContent = `Paste ${this.importer.label} above`;
      return;
    }
    try {
      this.imported = this.importer.run(text);
      this.preview.setText(print(fromValue(this.imported), { indent: store.settings.indent }), { resetSelection: true });
      const info = this.importer.info?.(this.imported);
      const count = Array.isArray(this.imported) ? `${this.imported.length} items` : "Converted";
      this.inStatus.className = "query-status status-ok";
      this.inStatus.textContent = info ?? count;
    } catch (e) {
      this.imported = undefined;
      this.inStatus.className = "query-status status-error";
      this.inStatus.textContent = (e as Error).message;
    }
  }

  private commitImport(how: "new" | "replace"): void {
    if (this.imported === undefined) return;
    const text = print(fromValue(this.imported), { indent: store.settings.indent });
    if (how === "new") this.ctx.openDocument(text, `From ${this.importer.label.split(" ")[0]}`);
    else this.ctx.replaceDocument(text);
  }

  private downloadExport(): void {
    if (!this.outText) return;
    const base = this.ctx.activeName().replace(/\.[^.]+$/, "") || "data";
    this.ctx.download(this.outText, `${base}.${this.exporter.ext}`, this.exporter.mime);
  }
}
