import { Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  placeholder,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import { oneDark } from "@codemirror/theme-one-dark";
import JSON5 from "json5";
import type { Mode } from "./parsers";
import type { Theme } from "./theme";

export interface EditorHandle {
  getValue(): string;
  setValue(text: string): void;
  focus(): void;
  setTheme(theme: Theme): void;
  setMode(mode: Mode): void;
}

const themeCompartment = new Compartment();
const linterCompartment = new Compartment();

// Light theme: transparent background so the glass container shows through, with
// fonts/colours pulled from the app's CSS variables to stay in one source.
const lightTheme = EditorView.theme(
  {
    "&": { backgroundColor: "transparent", color: "var(--text)" },
    ".cm-content": {
      fontFamily: "var(--mono)",
      caretColor: "var(--accent)",
    },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
      backgroundColor: "var(--accent-soft)",
    },
    ".cm-gutters": {
      backgroundColor: "transparent",
      color: "var(--text-muted)",
      border: "none",
    },
    ".cm-activeLine": { backgroundColor: "var(--accent-soft)" },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--text)" },
  },
  { dark: false },
);

// Dark theme: One Dark for the syntax colours, overlaid with a transparent
// background so the glassmorphism stays visible.
const darkTheme = [
  oneDark,
  EditorView.theme(
    {
      "&": { backgroundColor: "transparent" },
      ".cm-gutters": { backgroundColor: "transparent", border: "none" },
      ".cm-activeLineGutter": { backgroundColor: "transparent" },
    },
    { dark: true },
  ),
];

function themeExtension(theme: Theme) {
  return theme === "dark" ? darkTheme : lightTheme;
}

// JSON5 parse errors carry 1-based lineNumber/columnNumber; convert them to a
// document offset so the diagnostic underlines the right spot. Fall back to the
// whole document if no position is available.
function json5Linter() {
  return linter((view): Diagnostic[] => {
    const text = view.state.doc.toString();
    if (text.trim() === "") return [];
    try {
      JSON5.parse(text);
      return [];
    } catch (error) {
      const err = error as Error & { lineNumber?: number; columnNumber?: number };
      let from = 0;
      let to = view.state.doc.length;
      if (err.lineNumber && err.lineNumber <= view.state.doc.lines) {
        const line = view.state.doc.line(err.lineNumber);
        from = Math.min(line.from + Math.max(0, (err.columnNumber ?? 1) - 1), line.to);
        to = line.to;
      }
      return [{ from, to, severity: "error", message: err.message }];
    }
  });
}

function linterExtension(mode: Mode) {
  return mode === "json5" ? json5Linter() : linter(jsonParseLinter());
}

export function createEditor(
  parent: HTMLElement,
  opts: {
    initialDoc?: string;
    initialMode: Mode;
    initialTheme: Theme;
    onChange: () => void;
  },
): EditorHandle {
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: opts.initialDoc ?? "",
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        json(),
        lintGutter(),
        linterCompartment.of(linterExtension(opts.initialMode)),
        themeCompartment.of(themeExtension(opts.initialTheme)),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.lineWrapping,
        placeholder("Paste, type, or drop a JSON / JSON5 file here…"),
        EditorView.contentAttributes.of({
          autocapitalize: "off",
          autocorrect: "off",
          spellcheck: "false",
          "aria-label": "JSON or JSON5 editor",
        }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) opts.onChange();
        }),
      ],
    }),
  });

  return {
    getValue: () => view.state.doc.toString(),
    setValue: (text) => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
      });
    },
    focus: () => view.focus(),
    setTheme: (theme) => {
      view.dispatch({ effects: themeCompartment.reconfigure(themeExtension(theme)) });
    },
    setMode: (mode) => {
      view.dispatch({ effects: linterCompartment.reconfigure(linterExtension(mode)) });
    },
  };
}
