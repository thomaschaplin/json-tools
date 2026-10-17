import type { Analysis } from "../state";
import { SAMPLES, type Sample } from "../samples";
import { h, button } from "../ui/dom";
import { icon } from "../ui/icons";

export interface OverlayActions {
  paste(): void;
  openFile(): void;
  openUrl(): void;
  sample(s: Sample): void;
  repair(): void;
  gotoError(): void;
  useJson5(): void;
}

/** Empty-state and error-state cards shown over the tool pane. */
export function renderOverlay(a: Analysis, actions: OverlayActions): HTMLElement | null {
  if (a.empty) {
    return h(
      "div",
      { class: "overlay-card welcome" },
      h("div", { class: "welcome-mark" }, icon("braces", 28)),
      h("h2", null, "Start with some JSON"),
      h("p", { class: "muted" }, "Paste into the editor, drop a file anywhere, or try a sample. Everything stays on your device."),
      h(
        "div",
        { class: "welcome-actions" },
        button({ icon: "clipboard", label: "Paste", variant: "primary", onClick: actions.paste }),
        button({ icon: "folder", label: "Open file", variant: "subtle", onClick: actions.openFile }),
        button({ icon: "globe", label: "From URL", variant: "subtle", onClick: actions.openUrl }),
      ),
      h("div", { class: "welcome-label" }, "Samples"),
      h(
        "div",
        { class: "sample-grid" },
        SAMPLES.map((s) =>
          h(
            "button",
            { type: "button", class: "sample-card", onclick: () => actions.sample(s) },
            h("span", { class: "sample-name" }, s.name, s.mode === "json5" ? h("span", { class: "tn-badge" }, "JSON5") : null),
            h("span", { class: "sample-desc" }, s.description),
          ),
        ),
      ),
    );
  }
  if (!a.ok && a.error) {
    const e = a.error;
    const lines = a.text.split("\n");
    const from = Math.max(0, e.line - 3);
    const to = Math.min(lines.length, e.line + 2);
    const frame = h("pre", { class: "code-frame" });
    for (let i = from; i < to; i++) {
      const n = i + 1;
      const text = lines[i].length > 160 ? lines[i].slice(0, 160) + "…" : lines[i];
      frame.append(h("div", { class: n === e.line ? "cf-line cf-err" : "cf-line" }, h("span", { class: "cf-n" }, String(n)), h("span", { class: "cf-t" }, text || " ")));
      if (n === e.line) {
        frame.append(h("div", { class: "cf-line cf-caret" }, h("span", { class: "cf-n" }, ""), h("span", { class: "cf-t" }, " ".repeat(Math.min(e.column - 1, 160)) + "^")));
      }
    }
    const json5ish = /\/\/|\/\*|'|,\s*[}\]]|^\s*[A-Za-z_$][\w$]*\s*:/m.test(a.text);
    return h(
      "div",
      { class: "overlay-card problem" },
      h("div", { class: "problem-head" }, icon("alert", 18), h("div", null, h("h2", null, "This isn't valid JSON yet"), h("p", { class: "muted" }, `Line ${e.line}, column ${e.column}`))),
      h("p", { class: "problem-msg" }, e.message),
      frame,
      h(
        "div",
        { class: "welcome-actions" },
        a.repairable ? button({ icon: "wrench", label: "Repair automatically", variant: "primary", onClick: actions.repair }) : null,
        button({ icon: "crosshair", label: "Go to error", variant: "subtle", onClick: actions.gotoError }),
        json5ish ? button({ icon: "file", label: "Treat as JSON5", variant: "subtle", onClick: actions.useJson5 }) : null,
      ),
      a.repairable ? h("p", { class: "muted small" }, "Repair can fix comments, trailing commas, single quotes, unquoted keys, Python literals, missing commas and unclosed brackets.") : null,
    );
  }
  return null;
}
