import { Compartment, EditorSelection, EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  placeholder as placeholderExt,
  rectangularSelection,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  HighlightStyle,
  StreamLanguage,
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
  foldAll,
  unfoldAll,
} from "@codemirror/language";
import { json } from "@codemirror/lang-json";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { highlightSelectionMatches, search, searchKeymap, openSearchPanel } from "@codemirror/search";
import { lintGutter, setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { tags as t } from "@lezer/highlight";

export type Lang = "json" | "yaml" | "xml" | "go" | "rust" | "python" | "toml" | "kotlin" | "typescript" | "text";

/** Language support; anything but JSON is code-split and loaded on demand. */
export async function loadLanguage(lang: Lang): Promise<Extension> {
  switch (lang) {
    case "json":
      return json();
    case "yaml":
      return StreamLanguage.define((await import("@codemirror/legacy-modes/mode/yaml")).yaml);
    case "xml":
      return StreamLanguage.define((await import("@codemirror/legacy-modes/mode/xml")).xml);
    case "go":
      return StreamLanguage.define((await import("@codemirror/legacy-modes/mode/go")).go);
    case "rust":
      return StreamLanguage.define((await import("@codemirror/legacy-modes/mode/rust")).rust);
    case "python":
      return StreamLanguage.define((await import("@codemirror/legacy-modes/mode/python")).python);
    case "toml":
      return StreamLanguage.define((await import("@codemirror/legacy-modes/mode/toml")).toml);
    case "kotlin":
      return StreamLanguage.define((await import("@codemirror/legacy-modes/mode/clike")).kotlin);
    case "typescript":
      return StreamLanguage.define((await import("@codemirror/legacy-modes/mode/javascript")).typescript);
    default:
      return [];
  }
}

// Colours come from CSS custom properties, so light/dark switch instantly
// without reconfiguring any editor.
const highlight = HighlightStyle.define([
  { tag: t.propertyName, color: "var(--syn-key)" },
  { tag: [t.string, t.special(t.string)], color: "var(--syn-string)" },
  { tag: [t.number, t.integer, t.float], color: "var(--syn-number)" },
  { tag: [t.bool, t.atom], color: "var(--syn-bool)" },
  { tag: t.null, color: "var(--syn-null)", fontStyle: "italic" },
  { tag: [t.keyword, t.modifier, t.controlKeyword, t.definitionKeyword, t.operatorKeyword], color: "var(--syn-keyword)" },
  { tag: [t.typeName, t.className, t.namespace], color: "var(--syn-type)" },
  { tag: [t.definition(t.variableName), t.function(t.variableName)], color: "var(--syn-fn)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--syn-comment)", fontStyle: "italic" },
  { tag: [t.tagName], color: "var(--syn-key)" },
  { tag: [t.attributeName], color: "var(--syn-type)" },
  { tag: [t.meta, t.processingInstruction], color: "var(--syn-comment)" },
  { tag: [t.brace, t.squareBracket, t.bracket, t.punctuation, t.separator], color: "var(--syn-punct)" },
  { tag: t.invalid, color: "var(--danger)" },
]);

const baseTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "var(--editor-font-size)", backgroundColor: "transparent", color: "var(--text)" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.6", overscrollBehavior: "contain" },
  ".cm-content": { caretColor: "var(--accent)", padding: "10px 0 40px" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
  "&.cm-focused": { outline: "none" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--selection) !important",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--text-faint)",
    border: "none",
    paddingLeft: "4px",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 6px 0 8px", minWidth: "32px" },
  ".cm-activeLine": { backgroundColor: "var(--active-line)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--text-muted)" },
  ".cm-foldGutter .cm-gutterElement": { color: "var(--text-faint)", cursor: "pointer", padding: "0 4px" },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--surface-3)",
    border: "1px solid var(--border)",
    color: "var(--text-muted)",
    borderRadius: "4px",
    padding: "0 6px",
    margin: "0 2px",
  },
  ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
    backgroundColor: "var(--accent-soft)",
    outline: "1px solid var(--accent-border)",
    borderRadius: "2px",
  },
  ".cm-nonmatchingBracket": { color: "var(--danger) !important" },
  ".cm-selectionMatch": { backgroundColor: "var(--match)" },
  ".cm-searchMatch": { backgroundColor: "var(--match)", outline: "1px solid var(--warning)" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "var(--warning-soft)" },
  ".cm-placeholder": { color: "var(--text-faint)", fontStyle: "normal" },
  ".cm-tooltip": {
    backgroundColor: "var(--surface-2)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    boxShadow: "var(--shadow-lg)",
    color: "var(--text)",
    overflow: "hidden",
  },
  ".cm-diagnostic": { fontFamily: "var(--font-sans)", fontSize: "13px", padding: "6px 10px", borderLeftWidth: "3px" },
  ".cm-diagnostic-error": { borderLeftColor: "var(--danger)" },
  ".cm-diagnostic-warning": { borderLeftColor: "var(--warning)" },
  ".cm-lintRange-error": {
    backgroundImage: "none",
    textDecoration: "underline wavy var(--danger)",
    textUnderlineOffset: "3px",
    backgroundColor: "var(--danger-soft)",
  },
  ".cm-lintRange-warning": { backgroundImage: "none", textDecoration: "underline dotted var(--warning)", textUnderlineOffset: "3px" },
  ".cm-lint-marker": { width: "0.9em", height: "0.9em" },
  ".cm-gutter-lint": { width: "1em" },
  ".cm-panels": { backgroundColor: "var(--surface-2)", color: "var(--text)", borderColor: "var(--border) !important" },
  ".cm-panels-bottom": { borderTop: "1px solid var(--border)" },
  ".cm-panels-top": { borderBottom: "1px solid var(--border)" },
  ".cm-search": { fontFamily: "var(--font-sans)", fontSize: "13px", padding: "8px 10px", display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" },
  ".cm-search label": { display: "inline-flex", alignItems: "center", gap: "4px", color: "var(--text-muted)" },
  ".cm-textfield": {
    backgroundColor: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    color: "var(--text)",
    padding: "4px 8px",
    fontSize: "13px",
    margin: "0",
  },
  ".cm-textfield:focus": { outline: "2px solid var(--accent-border)", borderColor: "var(--accent)" },
  ".cm-button": {
    backgroundImage: "none",
    backgroundColor: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    color: "var(--text)",
    padding: "4px 10px",
    fontSize: "12.5px",
    margin: "0",
    textTransform: "capitalize",
  },
  ".cm-button:hover": { backgroundColor: "var(--surface-3)" },
  ".cm-search button[name=close]": { color: "var(--text-muted)", fontSize: "18px", right: "8px", top: "4px" },
});

export interface EditorOptions {
  doc?: string;
  lang?: Lang;
  readOnly?: boolean;
  wrap?: boolean;
  placeholder?: string;
  /** Main editor gets gutters, lint, folding, search, etc. */
  full?: boolean;
  onChange?: (text: string) => void;
  onCursor?: (offset: number, line: number, col: number) => void;
  onPaste?: (text: string, view: EditorView) => boolean;
  extraKeys?: { key: string; run: () => boolean; preventDefault?: boolean }[];
  label?: string;
}

export class Editor {
  readonly view: EditorView;
  private wrapC = new Compartment();
  private langC = new Compartment();
  private roC = new Compartment();
  private suppress = false;
  private exts: Extension[];

  constructor(parent: HTMLElement, opts: EditorOptions = {}) {
    const exts: Extension[] = [
      highlightSpecialChars(),
      drawSelection(),
      syntaxHighlighting(highlight),
      bracketMatching(),
      baseTheme,
      this.wrapC.of(opts.wrap ? EditorView.lineWrapping : []),
      this.langC.of((opts.lang ?? "json") === "json" ? json() : []),
      this.roC.of([EditorState.readOnly.of(!!opts.readOnly), EditorView.editable.of(!opts.readOnly)]),
      EditorState.tabSize.of(2),
      EditorView.contentAttributes.of({ "aria-label": opts.label ?? "Code editor", spellcheck: "false", autocorrect: "off", autocapitalize: "off" }),
      EditorView.updateListener.of((u) => {
        if (u.docChanged && !this.suppress) opts.onChange?.(u.state.doc.toString());
        if ((u.selectionSet || u.docChanged) && opts.onCursor) {
          const head = u.state.selection.main.head;
          const line = u.state.doc.lineAt(head);
          opts.onCursor(head, line.number, head - line.from + 1);
        }
      }),
    ];
    if (opts.full) {
      exts.push(
        lineNumbers(),
        foldGutter({
          markerDOM: (open) => {
            const s = document.createElement("span");
            s.className = `fold-marker${open ? " open" : ""}`;
            s.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;
            return s;
          },
        }),
        lintGutter(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        dropCursor(),
        indentOnInput(),
        closeBrackets(),
        rectangularSelection(),
        crosshairCursor(),
        highlightSelectionMatches(),
        search({ top: true }),
        keymap.of([
          ...(opts.extraKeys ?? []),
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          indentWithTab,
        ]),
      );
      if (opts.placeholder) exts.push(placeholderExt(opts.placeholder));
      if (opts.onPaste) {
        exts.push(
          EditorView.domEventHandlers({
            paste: (e, view) => {
              const text = e.clipboardData?.getData("text/plain");
              if (text === undefined) return false;
              if (opts.onPaste!(text, view)) {
                e.preventDefault();
                return true;
              }
              return false;
            },
          }),
        );
      }
    } else {
      exts.push(lineNumbers(), foldGutter({ markerDOM: (open) => {
        const s = document.createElement("span");
        s.className = `fold-marker${open ? " open" : ""}`;
        s.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;
        return s;
      } }), highlightSelectionMatches(), keymap.of([...defaultKeymap, ...searchKeymap, ...foldKeymap]), search({ top: true }));
      if (!opts.readOnly) exts.push(history(), closeBrackets(), keymap.of([...closeBracketsKeymap, ...historyKeymap, indentWithTab]));
      if (opts.placeholder) exts.push(placeholderExt(opts.placeholder));
    }

    this.exts = exts;
    this.view = new EditorView({
      parent,
      state: EditorState.create({ doc: opts.doc ?? "", extensions: exts }),
    });
    if (opts.lang && opts.lang !== "json") this.setLang(opts.lang);
  }

  get text(): string {
    return this.view.state.doc.toString();
  }

  /** Replace the whole document as one undoable change. */
  setText(text: string, opts: { silent?: boolean; resetSelection?: boolean } = {}): void {
    const cur = this.view.state.doc;
    if (cur.toString() === text) return;
    this.suppress = !!opts.silent;
    const head = Math.min(this.view.state.selection.main.head, text.length);
    this.view.dispatch({
      changes: { from: 0, to: cur.length, insert: text },
      selection: opts.resetSelection ? EditorSelection.cursor(0) : EditorSelection.cursor(head),
      scrollIntoView: !!opts.resetSelection,
    });
    this.suppress = false;
  }

  /** Swap documents without merging undo history (used when switching tabs). */
  load(text: string): void {
    // Compartments keep their current configuration via the stored extensions
    // array; re-apply wrap/lang/read-only state from the live view first.
    const wrap = this.wrapC.get(this.view.state);
    const lang = this.langC.get(this.view.state);
    const ro = this.roC.get(this.view.state);
    const exts = this.exts.map((e) => e);
    this.view.setState(EditorState.create({ doc: text, extensions: exts }));
    this.view.dispatch({
      effects: [this.wrapC.reconfigure(wrap ?? []), this.langC.reconfigure(lang ?? []), this.roC.reconfigure(ro ?? [])],
    });
  }

  setWrap(on: boolean): void {
    this.view.dispatch({ effects: this.wrapC.reconfigure(on ? EditorView.lineWrapping : []) });
  }

  private langSeq = 0;
  setLang(lang: Lang): void {
    const seq = ++this.langSeq;
    void loadLanguage(lang).then((ext) => {
      if (seq === this.langSeq) this.view.dispatch({ effects: this.langC.reconfigure(ext) });
    });
  }

  setReadOnly(ro: boolean): void {
    this.view.dispatch({
      effects: this.roC.reconfigure([EditorState.readOnly.of(ro), EditorView.editable.of(!ro)]),
    });
  }

  setDiagnostics(diags: Diagnostic[]): void {
    const len = this.view.state.doc.length;
    this.view.dispatch(
      setDiagnostics(
        this.view.state,
        diags.map((d) => ({ ...d, from: Math.min(d.from, len), to: Math.min(Math.max(d.to, d.from), len) })),
      ),
    );
  }

  select(from: number, to = from, focus = true): void {
    const len = this.view.state.doc.length;
    this.view.dispatch({
      selection: EditorSelection.single(Math.min(from, len), Math.min(to, len)),
      effects: EditorView.scrollIntoView(Math.min(from, len), { y: "center" }),
    });
    if (focus) this.view.focus();
  }

  focus(): void {
    this.view.focus();
  }

  foldAll(): void {
    foldAll(this.view);
  }

  unfoldAll(): void {
    unfoldAll(this.view);
  }

  openSearch(): void {
    openSearchPanel(this.view);
  }

  destroy(): void {
    this.view.destroy();
  }
}
