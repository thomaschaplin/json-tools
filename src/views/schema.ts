import type { Analysis } from "../state";
import { parse, toValue } from "../lib/parse";
import { toJsonSchema } from "../lib/codegen";
import type { Path } from "../lib/path";
import { button, debounce, h } from "../ui/dom";
import { Editor } from "../ui/editor";
import { icon } from "../ui/icons";
import type { AppContext, View } from "./types";

interface AjvError {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  message?: string;
  params: Record<string, unknown>;
}

type Validator = ((data: unknown) => boolean) & { errors?: AjvError[] | null };

function pointerToPath(ptr: string): Path {
  if (!ptr) return [];
  return ptr
    .split("/")
    .slice(1)
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"))
    .map((s) => (/^\d+$/.test(s) ? Number(s) : s));
}

async function compile(schema: Record<string, unknown>): Promise<Validator> {
  const draft = String(schema.$schema ?? "");
  const formats = (await import("ajv-formats")).default;
  let ajv;
  if (draft.includes("2019-09")) {
    const Ajv2019 = (await import("ajv/dist/2019")).default;
    ajv = new Ajv2019({ allErrors: true, strict: false });
  } else if (/draft-0[4-7]/.test(draft)) {
    const Ajv = (await import("ajv")).default;
    ajv = new Ajv({ allErrors: true, strict: false });
  } else {
    const Ajv2020 = (await import("ajv/dist/2020")).default;
    ajv = new Ajv2020({ allErrors: true, strict: false });
  }
  formats(ajv);
  return ajv.compile(schema) as Validator;
}

export class SchemaView implements View {
  id = "schema" as const;
  label = "Schema";
  icon = "shield" as const;
  el: HTMLElement;

  private schemaEditor: Editor;
  private results: HTMLElement;
  private status: HTMLElement;
  private analysis: Analysis | null = null;
  private seq = 0;

  constructor(private ctx: AppContext) {
    const host = h("div", { class: "output-editor schema-input" });
    this.schemaEditor = new Editor(host, {
      doc: localStorage.getItem("jt.schema") ?? "",
      lang: "json",
      label: "JSON Schema",
      placeholder: 'Paste a JSON Schema here, or click "Generate from data"…',
      onChange: debounce((t: string) => {
        try {
          localStorage.setItem("jt.schema", t);
        } catch {
          /* ignore */
        }
        this.validate();
      }, 300),
    });
    this.status = h("div", { class: "query-status" });
    this.results = h("div", { class: "schema-results" });
    this.el = h(
      "div",
      { class: "view view-schema" },
      h(
        "div",
        { class: "result-bar" },
        h("span", { class: "muted small" }, "Schema · draft 2020-12, 2019-09 & 07"),
        h("span", { class: "spacer" }),
        button({ icon: "sparkles", label: "Generate from data", compact: true, title: "Infer a schema from the current document", onClick: () => this.generate() }),
        button({ icon: "trash", title: "Clear schema", onClick: () => this.schemaEditor.setText("") }),
      ),
      host,
      h("div", { class: "result-bar" }, this.status),
      this.results,
    );
  }

  update(a: Analysis): void {
    this.analysis = a;
    this.validate();
  }

  private generate(): void {
    if (!this.analysis?.ok) return;
    const schema = toJsonSchema(this.analysis.value);
    this.schemaEditor.setText(JSON.stringify(schema, null, 2) + "\n", { resetSelection: true });
  }

  private setStatus(kind: "ok" | "error" | "idle" | "busy", text: string): void {
    this.status.className = `query-status status-${kind}`;
    this.status.replaceChildren(kind === "ok" ? icon("checkCircle", 14) : kind === "error" ? icon("alert", 14) : "", h("span", null, text));
  }

  private async validate(): Promise<void> {
    const seq = ++this.seq;
    const a = this.analysis;
    const schemaText = this.schemaEditor.text;
    if (!schemaText.trim()) {
      this.setStatus("idle", "Add a schema to validate the current document");
      this.results.replaceChildren(
        h(
          "div",
          { class: "empty-note" },
          "No schema yet. ",
          h("button", { type: "button", class: "link-btn", onclick: () => this.generate() }, "Generate one from your data"),
          " and tighten it, or paste an existing schema.",
        ),
      );
      return;
    }
    const sr = parse(schemaText, { loose: true });
    if (!sr.ok) {
      this.setStatus("error", `Schema is not valid JSON — line ${sr.error.line}: ${sr.error.message}`);
      this.results.replaceChildren();
      return;
    }
    if (!a || !a.ok) {
      this.setStatus("idle", "Waiting for a valid document");
      this.results.replaceChildren();
      return;
    }
    let validate: Validator;
    try {
      this.setStatus("busy", "Compiling schema…");
      validate = await compile(toValue(sr.ast) as Record<string, unknown>);
    } catch (e) {
      if (seq !== this.seq) return;
      this.setStatus("error", `Invalid schema: ${(e as Error).message}`);
      this.results.replaceChildren();
      return;
    }
    if (seq !== this.seq) return;
    const valid = validate(a.value);
    if (valid) {
      this.setStatus("ok", "Document is valid against the schema");
      this.results.replaceChildren(h("div", { class: "empty-note ok" }, icon("checkCircle"), " All constraints pass."));
      return;
    }
    const errors = validate.errors ?? [];
    this.setStatus("error", `${errors.length} validation error${errors.length === 1 ? "" : "s"}`);
    this.results.replaceChildren(
      h(
        "div",
        { class: "change-list" },
        errors.slice(0, 500).map((err) => {
          const path = pointerToPath(err.instancePath);
          let msg = err.message ?? err.keyword;
          if (err.keyword === "additionalProperties") msg += `: "${String(err.params.additionalProperty)}"`;
          if (err.keyword === "enum") msg += `: ${JSON.stringify(err.params.allowedValues)}`;
          return h(
            "div",
            { class: "change change-removed" },
            h("span", { class: "change-sym" }, icon("alert", 13)),
            h("button", { type: "button", class: "change-path", title: "Reveal in editor", onclick: () => this.ctx.reveal(path, true) }, err.instancePath || "/"),
            h("div", { class: "change-values" }, h("span", null, msg), h("code", { class: "muted small" }, err.schemaPath)),
          );
        }),
      ),
    );
  }
}
