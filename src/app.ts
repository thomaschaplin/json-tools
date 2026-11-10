import JSON5 from "json5";
import { store, type Mode, type ThemePref, type ViewId } from "./state";
import { parse, toValue, type JsonNode } from "./lib/parse";
import { compact as compactAst, flatten, minify, print, sortKeys, unescapeString, unflatten, type Indent } from "./lib/format";
import { keyRangeAtPath, nodeAtPath, pathAtOffset, toJsonPath, type Path } from "./lib/path";
import { formatBytes } from "./lib/stats";
import { decodeShare, encodeShare } from "./lib/share";
import { fromValue } from "./lib/parse";
import { pageBySlug, pageFor, pagePath, PAGES, type Page } from "./seo/pages";
import { SAMPLES, type Sample } from "./samples";
import { button, copyText, debounce, downloadText, h, isNarrow, kbd, segmented } from "./ui/dom";
import { Editor } from "./ui/editor";
import { icon } from "./ui/icons";
import { showMenu, type MenuItem } from "./ui/menu";
import { openDialog } from "./ui/dialog";
import { openPalette, type Command } from "./ui/palette";
import { toast } from "./ui/toast";
import type { AppContext, View } from "./views/types";
import { TreeView } from "./views/tree";
import { renderOverlay } from "./views/overlay";

const VIEW_ORDER: ViewId[] = ["tree", "table", "query", "code", "convert", "diff", "schema", "stats"];
const VIEW_META: Record<ViewId, { label: string; icon: Parameters<typeof icon>[0] }> = {
  tree: { label: "Tree", icon: "tree" },
  table: { label: "Table", icon: "table" },
  query: { label: "Query", icon: "search" },
  code: { label: "Types", icon: "code" },
  convert: { label: "Convert", icon: "convert" },
  diff: { label: "Diff", icon: "diff" },
  schema: { label: "Schema", icon: "shield" },
  stats: { label: "Stats", icon: "chart" },
};

/* ------------------------------------------------------------------ theme */

const media = window.matchMedia("(prefers-color-scheme: dark)");

function applyTheme(pref: ThemePref): void {
  const dark = pref === "dark" || (pref === "system" && media.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.themePref = pref;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", dark ? "#0b0d12" : "#f6f7f9"));
}

/* --------------------------------------------------------------------- app */

export function startApp(root: HTMLElement): void {
  applyTheme(store.settings.theme);
  media.addEventListener("change", () => applyTheme(store.settings.theme));
  document.documentElement.style.setProperty("--editor-font-size", `${store.settings.fontSize}px`);

  const initialPage = pageBySlug(location.pathname) ?? PAGES[0];

  /* ------------------------------------------------------------- editor */

  const editorHost = h("div", { class: "editor-host" });
  const editor = new Editor(editorHost, {
    full: true,
    doc: store.active.text,
    wrap: store.settings.wrap,
    label: "JSON editor",
    placeholder: initialPage.placeholder ?? "Paste or type JSON here — or drop a file anywhere…",
    onChange: (text) => store.setText(text, "editor"),
    onCursor: (offset, line, col) => store.setCursor(offset, line, col),
    onPaste: handlePaste,
    extraKeys: [
      { key: "Mod-Shift-f", run: () => (format(), true) },
      { key: "Shift-Alt-f", run: () => (format(), true) },
      { key: "Mod-Shift-m", run: () => (doMinify(), true) },
    ],
  });

  function handlePaste(text: string): boolean {
    const state = editor.view.state;
    const sel = state.selection.main;
    const replacingAll = state.doc.length === 0 || (sel.from === 0 && sel.to === state.doc.length);
    if (!replacingAll || !store.settings.formatOnPaste || store.active.mode !== "json") return false;
    const r = parse(text);
    if (r.ok) {
      editor.setText(print(r.ast, printOpts()), { resetSelection: true });
      return true;
    }
    if (text.length < 5e6 && parse(text, { loose: true }).ok) {
      setTimeout(() => toast("Pasted text isn't valid JSON, but it can be repaired.", "warning", { action: { label: "Repair", run: repair }, duration: 6000 }), 50);
    }
    return false;
  }

  /* ------------------------------------------------------------ context */

  const ctx: AppContext = {
    reveal: revealPath,
    openDocument: (text, name, mode) => openText(text, name, mode),
    replaceDocument: (text) => {
      editor.setText(text, { resetSelection: true });
      store.setText(text, "external");
      showPane("editor");
    },
    subChanged: (view, sub) => syncUrl(view, sub),
    showPane,
    copy: (text, what) => {
      if (!text) return;
      void copyText(text).then((ok) => toast(ok ? `${what ?? "Text"} copied` : "Copy failed", ok ? "success" : "error"));
    },
    download: (text, name, type) => downloadText(text, name, type),
    activeName: () => store.active.name,
  };

  function revealPath(path: Path, focus = true): void {
    const a = store.current();
    if (!a.ast) return;
    const node = nodeAtPath(a.ast, path);
    if (!node) return;
    const key = keyRangeAtPath(a.ast, path);
    if (isNarrow() && focus) showPane("editor");
    editor.select(key ? key.start : node.start, node.end, focus);
  }

  /* -------------------------------------------------------------- views */

  const views = new Map<ViewId, View>();
  const viewHost = h("div", { class: "tool-body" });
  const overlayHost = h("div", { class: "overlay", hidden: true });
  const viewTabs = h("div", { class: "view-tabs", role: "tablist", "aria-label": "Tools" });

  type ViewCtor = new (ctx: AppContext) => View;
  // The tree is the default view and ships in the main bundle; the rest are code-split.
  const loaders: Record<ViewId, () => Promise<ViewCtor>> = {
    tree: async () => TreeView,
    table: () => import("./views/table").then((m) => m.TableView),
    query: () => import("./views/query").then((m) => m.QueryView),
    code: () => import("./views/code").then((m) => m.CodeView),
    convert: () => import("./views/convert").then((m) => m.ConvertView),
    diff: () => import("./views/diff").then((m) => m.DiffView),
    schema: () => import("./views/schema").then((m) => m.SchemaView),
    stats: () => import("./views/stats").then((m) => m.StatsView),
  };
  const pending = new Map<ViewId, Promise<View>>();

  function getView(id: ViewId): Promise<View> {
    let p = pending.get(id);
    if (!p) {
      p = loaders[id]().then((Ctor) => {
        const v = new Ctor(ctx);
        v.el.hidden = true;
        v.el.setAttribute("role", "tabpanel");
        v.el.setAttribute("aria-labelledby", `tab-${id}`);
        v.el.id = `panel-${id}`;
        viewHost.append(v.el);
        views.set(id, v);
        return v;
      });
      p.catch(() => {
        pending.delete(id);
        toast("Couldn't load that tool — check your connection and try again", "error");
      });
      pending.set(id, p);
    }
    return p;
  }

  let currentView: ViewId = store.settings.view;
  let shownView: ViewId | null = null;
  let viewSeq = 0;

  async function setView(id: ViewId, opts: { sub?: string; syncUrl?: boolean } = {}): Promise<void> {
    const seq = ++viewSeq;
    currentView = id;
    store.setView(id);
    renderViewTabs();
    const v = await getView(id);
    if (seq !== viewSeq) return;
    if (shownView && shownView !== id) {
      const prev = views.get(shownView);
      if (prev) {
        prev.el.hidden = true;
        prev.hide?.();
      }
    }
    shownView = id;
    if (opts.sub) v.setSub?.(opts.sub);
    v.el.hidden = false;
    v.show?.();
    v.update(store.current());
    renderOverlayState();
    if (opts.syncUrl !== false) syncUrl(id, v.getSub?.());
  }

  function renderViewTabs(): void {
    viewTabs.replaceChildren(
      ...VIEW_ORDER.map((id, i) =>
        h(
          "button",
          {
            type: "button",
            role: "tab",
            class: "view-tab",
            id: `tab-${id}`,
            "aria-controls": `panel-${id}`,
            "aria-selected": String(id === currentView),
            title: `${VIEW_META[id].label} (${kbd(`Alt+${i + 1}`)})`,
            onclick: () => void setView(id),
          },
          icon(VIEW_META[id].icon),
          h("span", null, VIEW_META[id].label),
        ),
      ),
    );
    const sel = viewTabs.querySelector<HTMLElement>('[aria-selected="true"]');
    if (sel) viewTabs.scrollLeft = Math.max(0, sel.offsetLeft - viewTabs.clientWidth / 2 + sel.offsetWidth / 2);
  }

  function renderOverlayState(): void {
    const a = store.analysis;
    const v = views.get(currentView);
    const independent = currentView === "convert" && v?.getSub?.()?.startsWith("from-");
    const card = independent ? null : renderOverlay(a, {
      paste: pasteFromClipboard,
      openFile,
      openUrl: openUrlDialog,
      sample: loadSample,
      repair,
      gotoError,
      useJson5: () => {
        store.setMode("json5");
        modeToggle.set("json5");
      },
    });
    overlayHost.hidden = !card;
    overlayHost.replaceChildren(...(card ? [card] : []));
    viewHost.classList.toggle("dimmed", !!card);
  }

  /* ------------------------------------------------------------- URL sync */

  let currentPage: Page = initialPage;
  function syncUrl(view: ViewId, sub: string | undefined): void {
    const page = pageFor(view, sub);
    // Stay on landing pages that already describe the current view (e.g. /json-formatter).
    if (currentPage.view === view && (currentPage.sub ?? undefined) === (page.sub ?? undefined) && !page.sub) return;
    if (currentPage === page) return;
    currentPage = page;
    const path = pagePath(page);
    if (location.pathname !== path) history.replaceState(null, "", path + location.search);
    document.title = page.title;
  }

  /* ------------------------------------------------------- transforms */

  function printOpts(): { indent: Indent; inlineWidth: number } {
    return { indent: store.settings.indent, inlineWidth: store.settings.inlineWidth };
  }

  function emit(ast: JsonNode, minified = false): string {
    if (store.active.mode === "json5") {
      const v = toValue(ast);
      const ind = minified ? undefined : store.settings.indent;
      return JSON5.stringify(v, null, ind as number | string | undefined) + (minified ? "" : "\n");
    }
    return minified ? minify(ast) : print(ast, printOpts()) + "\n";
  }

  function withAst(fn: (ast: JsonNode) => string | null, label: string): void {
    const a = store.current();
    if (a.empty) {
      toast("The editor is empty", "info");
      return;
    }
    if (!a.ok || !a.ast) {
      toast(`Can't ${label.toLowerCase()} — the document has errors`, "error", a.repairable ? { action: { label: "Repair", run: repair } } : {});
      return;
    }
    try {
      const out = fn(a.ast);
      if (out === null) return;
      if (out === a.text) {
        toast(`Already ${label === "Format" ? "formatted" : label === "Minify" ? "minified" : "done"}`, "info");
        return;
      }
      editor.setText(out);
      store.setText(out, "external");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  const format = () => withAst((ast) => emit(ast), "Format");
  const doMinify = () => withAst((ast) => emit(ast, true), "Minify");
  const doSort = (descending = false, arrays = false) => withAst((ast) => emit(sortKeys(ast, { descending, arrays })), "Sort");
  const doCompact = () => withAst((ast) => emit(compactAst(ast)), "Clean");
  const doFlatten = () => withAst((ast) => emit(fromValue(flatten(toValue(ast)))), "Flatten");
  const doUnflatten = () =>
    withAst((ast) => {
      const v = toValue(ast);
      if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Unflatten needs an object with dotted keys");
      return emit(fromValue(unflatten(v as Record<string, unknown>)));
    }, "Unflatten");
  const doStringify = () =>
    withAst((ast) => JSON.stringify(minify(ast)) + "\n", "Stringify");

  function doUnescape(): void {
    const text = editor.text.trim();
    if (!text) return;
    try {
      let inner = unescapeString(text);
      const r = parse(inner);
      if (r.ok) inner = print(r.ast, printOpts()) + "\n";
      editor.setText(inner);
      store.setText(inner, "external");
      toast("Unescaped string", "success");
    } catch {
      toast("The editor doesn't contain an escaped JSON string", "error");
    }
  }

  function repair(): void {
    const text = editor.text;
    const r = parse(text, { loose: true });
    if (!r.ok) {
      toast(`Couldn't repair: line ${r.error.line} — ${r.error.message}`, "error");
      return;
    }
    const out = print(r.ast, printOpts()) + "\n";
    if (store.active.mode === "json5") store.setMode("json");
    modeToggle.set("json");
    editor.setText(out);
    store.setText(out, "external");
    const n = r.fixes.length;
    if (n) {
      const summary = [...new Set(r.fixes.map((f) => f.message.replace(/ \S+$/, (m) => (/\d/.test(m) ? "" : m))))].slice(0, 4).join(" · ");
      toast(`Repaired ${n} issue${n === 1 ? "" : "s"}: ${summary}`, "success", { duration: 5000 });
    } else toast("Formatted — nothing needed repairing", "success");
  }

  function gotoError(): void {
    const e = store.current().error;
    if (!e) return;
    showPane("editor");
    editor.select(e.offset, Math.min(e.offset + 1, editor.text.length));
  }

  /* ------------------------------------------------------------- loading */

  function openText(text: string, name?: string, mode: Mode = "json"): void {
    store.open(text, name, mode);
    // store.open emits events that load the editor; make sure the editor reflects it.
    if (editor.text !== store.active.text) editor.load(store.active.text);
    showPane("editor");
  }

  function loadSample(s: Sample): void {
    openText(s.text, s.name, s.mode);
    modeToggle.set(s.mode);
  }

  async function readFile(file: File): Promise<void> {
    if (file.size > 50 * 1024 * 1024) {
      toast("That file is over 50 MB — too large to open comfortably in the browser", "error");
      return;
    }
    let text = await file.text();
    const lower = file.name.toLowerCase();
    let mode: Mode = lower.endsWith(".json5") || lower.endsWith(".jsonc") ? "json5" : "json";
    if (lower.endsWith(".ndjson") || lower.endsWith(".jsonl")) {
      const r = parse(text, { loose: true });
      if (r.ok) text = print(r.ast, printOpts()) + "\n";
      mode = "json";
    }
    openText(text, file.name, mode);
    modeToggle.set(mode);
    toast(`Opened ${file.name} · ${formatBytes(file.size)}`, "success");
  }

  function openFile(): void {
    const input = h("input", { type: "file", accept: ".json,.json5,.jsonc,.ndjson,.jsonl,.geojson,.map,.txt,application/json", multiple: true });
    input.addEventListener("change", () => {
      for (const f of Array.from(input.files ?? [])) void readFile(f);
    });
    input.click();
  }

  async function pasteFromClipboard(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        toast("Your clipboard is empty", "info");
        return;
      }
      const r = parse(text);
      openText(r.ok && store.settings.formatOnPaste ? print(r.ast, printOpts()) + "\n" : text, "Pasted");
    } catch {
      editor.focus();
      toast(`Press ${kbd("Mod+V")} to paste into the editor`, "info");
    }
  }

  async function fetchUrl(url: string): Promise<void> {
    try {
      const u = new URL(url);
      toast(`Fetching ${u.host}…`, "info");
      const res = await fetch(u.toString(), { headers: { Accept: "application/json, text/plain, */*" } });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      let text = await res.text();
      const r = parse(text);
      if (r.ok) text = print(r.ast, printOpts()) + "\n";
      const name = u.pathname.split("/").filter(Boolean).pop() || u.host;
      openText(text, name);
      toast(`Loaded ${formatBytes(text.length)} from ${u.host}`, "success");
    } catch (e) {
      const msg = e instanceof TypeError ? "The request was blocked — the server must allow cross-origin (CORS) requests" : (e as Error).message;
      toast(`Couldn't load URL: ${msg}`, "error", { duration: 7000 });
    }
  }

  function openUrlDialog(): void {
    const input = h("input", { class: "input", type: "url", placeholder: "https://api.example.com/data.json", "aria-label": "URL", spellcheck: false });
    const go = () => {
      const v = input.value.trim();
      if (!v) return;
      d.close();
      void fetchUrl(v);
    };
    input.addEventListener("keydown", (e) => e.key === "Enter" && go());
    const d = openDialog({
      title: "Load JSON from a URL",
      body: [
        input,
        h("p", { class: "muted small" }, "The request is made directly from your browser, so the server must allow cross-origin requests (CORS). Public APIs such as GitHub's usually do."),
        h(
          "div",
          { class: "chips" },
          ["https://api.github.com/repos/thomaschaplin/json-tools", "https://jsonplaceholder.typicode.com/users"].map((u) =>
            h("button", { type: "button", class: "chip", onclick: () => { input.value = u; input.focus(); } }, new URL(u).host),
          ),
        ),
      ],
      footer: [button({ label: "Cancel", variant: "subtle", onClick: () => d.close() }), button({ label: "Load", icon: "download", variant: "primary", onClick: go })],
    });
    input.focus();
  }

  /* --------------------------------------------------------------- share */

  async function share(): Promise<void> {
    const text = editor.text;
    if (!text.trim()) {
      toast("Nothing to share yet", "info");
      return;
    }
    const a = store.current();
    const payload = a.ok && a.ast && store.active.mode === "json" ? minify(a.ast) : text;
    const encoded = await encodeShare(payload);
    const url = `${location.origin}${pagePath(currentPage)}#json=${encoded}`;
    const long = url.length > 16000;
    const field = h("input", { class: "input mono", readonly: true, value: url, "aria-label": "Share link", onfocus: (e: Event) => (e.target as HTMLInputElement).select() });
    const d = openDialog({
      title: "Share this document",
      body: [
        h("p", { class: "muted" }, "The JSON is compressed into the link itself. The part after # never leaves the browser, so nothing is uploaded — only people with the link can see it."),
        field,
        h("p", { class: `small ${long ? "warn-text" : "muted"}` }, `${url.length.toLocaleString()} characters${long ? " — some apps truncate links this long; consider sharing the file instead." : ""}`),
      ],
      footer: [
        "share" in navigator ? button({ icon: "share", label: "Share…", variant: "subtle", onClick: () => void navigator.share({ title: `${store.active.name} — JSON Tools`, url }).catch(() => {}) }) : null,
        button({ icon: "copy", label: "Copy link", variant: "primary", onClick: () => { ctx.copy(url, "Link"); d.close(); } }),
      ].filter(Boolean) as Node[],
    });
    field.select();
  }

  /* --------------------------------------------------------------- layout */

  const modeToggle = segmented<Mode>(
    [
      { value: "json", label: "JSON", title: "Strict JSON (RFC 8259)" },
      { value: "json5", label: "JSON5", title: "Relaxed: comments, trailing commas, single quotes, unquoted keys" },
    ],
    store.active.mode,
    (m) => store.setMode(m),
    "Syntax",
  );
  modeToggle.classList.add("segmented-sm");

  const formatBtn = button({ icon: "wand", label: "Format", variant: "primary", title: "Format", kbd: kbd("Mod+Shift+F"), onClick: format });
  const formatMenuBtn = button({
    icon: "chevronDown",
    title: "Format options",
    variant: "primary",
    class: "split-caret",
    onClick: (e) => showMenu(e.currentTarget as HTMLElement, formatMenu()),
  });

  function formatMenu(): MenuItem[] {
    const s = store.settings;
    const ind = (v: Indent, label: string): MenuItem => ({ label, checked: s.indent === v, run: () => { store.set("indent", v); format(); } });
    return [
      { heading: "Indentation" },
      ind(2, "2 spaces"),
      ind(4, "4 spaces"),
      ind("\t", "Tabs"),
      { separator: true },
      { label: "Keep short arrays & objects on one line", checked: s.inlineWidth > 0, run: () => { store.set("inlineWidth", s.inlineWidth ? 0 : 80); format(); } },
      { label: "Format on paste", checked: s.formatOnPaste, run: () => store.set("formatOnPaste", !s.formatOnPaste) },
    ];
  }

  function moreMenu(): MenuItem[] {
    return [
      { heading: "Transform" },
      { label: "Sort keys A → Z", icon: "sort", run: () => doSort() },
      { label: "Sort keys Z → A", icon: "sort", run: () => doSort(true) },
      { label: "Sort keys and primitive arrays", icon: "sort", run: () => doSort(false, true) },
      { label: "Remove nulls & empty values", icon: "filter", run: doCompact },
      { label: "Flatten to dotted keys", icon: "layers", run: doFlatten },
      { label: "Unflatten dotted keys", icon: "layers", run: doUnflatten },
      { separator: true },
      { heading: "Strings" },
      { label: "Escape as JSON string", icon: "hash", hint: "Stringify the document", run: doStringify },
      { label: "Unescape JSON string", icon: "hash", hint: "Parse a stringified document", run: doUnescape },
      { separator: true },
      { heading: "Editor" },
      { label: "Find & replace", icon: "search", shortcut: "Mod+F", run: () => editor.openSearch() },
      { label: "Fold all", icon: "collapse", run: () => editor.foldAll() },
      { label: "Unfold all", icon: "expand", run: () => editor.unfoldAll() },
      { label: "Word wrap", checked: store.settings.wrap, run: () => store.set("wrap", !store.settings.wrap) },
      { label: "Larger text", icon: "plus", run: () => setFontSize(store.settings.fontSize + 1) },
      { label: "Smaller text", icon: "minify", run: () => setFontSize(store.settings.fontSize - 1) },
    ];
  }

  function setFontSize(n: number): void {
    const v = Math.max(11, Math.min(20, n));
    store.set("fontSize", v);
    document.documentElement.style.setProperty("--editor-font-size", `${v}px`);
  }

  const editorToolbar = h(
    "div",
    { class: "pane-toolbar", role: "toolbar", "aria-label": "Editor actions" },
    h("div", { class: "split-btn" }, formatBtn, formatMenuBtn),
    button({ icon: "minify", label: "Minify", title: "Minify", kbd: kbd("Mod+Shift+M"), compact: true, onClick: doMinify }),
    button({ icon: "sort", label: "Sort", title: "Sort keys A → Z", compact: true, onClick: () => doSort() }),
    button({ icon: "wrench", label: "Repair", title: "Repair broken JSON", compact: true, onClick: repair }),
    button({ icon: "more", title: "More transforms", onClick: (e) => showMenu(e.currentTarget as HTMLElement, moreMenu()) }),
    h("span", { class: "spacer" }),
    modeToggle,
    h("span", { class: "toolbar-sep" }),
    button({ icon: "copy", title: "Copy all", onClick: () => ctx.copy(editor.text, "JSON") }),
    button({ icon: "download", title: "Download", kbd: kbd("Mod+S"), onClick: download }),
    button({ icon: "trash", title: "Clear", onClick: clearDoc }),
  );

  function download(): void {
    const text = editor.text;
    if (!text.trim()) {
      toast("Nothing to download", "info");
      return;
    }
    let name = store.active.name;
    if (!/\.\w+$/.test(name)) name += store.active.mode === "json5" ? ".json5" : ".json";
    downloadText(text, name);
  }

  function clearDoc(): void {
    const prev = editor.text;
    if (!prev) return;
    editor.setText("");
    store.setText("", "external");
    toast("Cleared", "info", {
      action: {
        label: "Undo",
        run: () => {
          editor.setText(prev);
          store.setText(prev, "external");
        },
      },
    });
  }

  // Document tabs ---------------------------------------------------------
  const docTabs = h("div", { class: "doc-tabs", role: "tablist", "aria-label": "Documents" });
  const newTabBtn = button({ icon: "plus", title: "New document", kbd: kbd("Alt+N"), class: "doc-new", onClick: () => newDoc() });

  function newDoc(): void {
    const d = store.blank();
    store.docs.push(d);
    store.activate(d.id);
    editor.focus();
  }

  let dragId: string | null = null;
  function renderDocTabs(): void {
    docTabs.replaceChildren(
      ...store.docs.map((d) => {
        const active = d.id === store.activeId;
        const label = h("span", { class: "doc-name" }, d.name);
        const tab = h(
          "div",
          {
            class: `doc-tab${active ? " active" : ""}`,
            role: "tab",
            "aria-selected": String(active),
            tabindex: active ? 0 : -1,
            draggable: "true",
            title: `${d.name}${d.mode === "json5" ? " (JSON5)" : ""} — double-click to rename`,
            onclick: () => store.activate(d.id),
            onauxclick: (e: MouseEvent) => {
              if (e.button === 1) store.close(d.id);
            },
            ondblclick: () => rename(d.id, label),
            ondragstart: (e: DragEvent) => {
              dragId = d.id;
              e.dataTransfer?.setData("text/x-doc", d.id);
            },
            ondragover: (e: DragEvent) => {
              if (dragId) e.preventDefault();
            },
            ondrop: (e: DragEvent) => {
              if (dragId) {
                e.preventDefault();
                e.stopPropagation();
                store.reorder(dragId, d.id);
                dragId = null;
              }
            },
            onkeydown: (e: KeyboardEvent) => {
              if (e.key === "F2") rename(d.id, label);
              if (e.key === "Delete") store.close(d.id);
            },
          },
          icon("file", 13),
          label,
          d.mode === "json5" ? h("span", { class: "doc-badge" }, "5") : null,
          store.docs.length > 1 || d.text
            ? h(
                "button",
                {
                  type: "button",
                  class: "doc-close",
                  "aria-label": `Close ${d.name}`,
                  tabindex: -1,
                  onclick: (e: Event) => {
                    e.stopPropagation();
                    closeDoc(d.id);
                  },
                },
                icon("x", 12),
              )
            : null,
        );
        return tab;
      }),
    );
    const act = docTabs.querySelector<HTMLElement>(".active");
    if (act && (act.offsetLeft < docTabs.scrollLeft || act.offsetLeft + act.offsetWidth > docTabs.scrollLeft + docTabs.clientWidth)) {
      docTabs.scrollLeft = act.offsetLeft - 8;
    }
  }

  function closeDoc(id: string): void {
    const d = store.docs.find((x) => x.id === id);
    if (!d) return;
    const snapshot = { ...d };
    const index = store.docs.indexOf(d);
    store.close(id);
    if (snapshot.text.trim()) {
      toast(`Closed ${snapshot.name}`, "info", {
        action: {
          label: "Undo",
          run: () => {
            store.docs.splice(Math.min(index, store.docs.length), 0, snapshot);
            store.activate(snapshot.id);
          },
        },
      });
    }
  }

  function rename(id: string, label: HTMLElement): void {
    const d = store.docs.find((x) => x.id === id);
    if (!d) return;
    const input = h("input", { class: "doc-rename", value: d.name, "aria-label": "Document name", spellcheck: false });
    const done = (commit: boolean) => {
      if (commit) store.rename(id, input.value);
      else renderDocTabs();
    };
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") done(true);
      if (e.key === "Escape") done(false);
    });
    input.addEventListener("blur", () => done(true));
    input.addEventListener("click", (e) => e.stopPropagation());
    label.replaceWith(input);
    input.select();
  }

  // Header ------------------------------------------------------------------
  const themeBtn = button({ icon: "sun", title: "Theme", onClick: (e) => showMenu(e.currentTarget as HTMLElement, themeMenu(), "end") });
  function updateThemeIcon(): void {
    const pref = store.settings.theme;
    themeBtn.replaceChildren(icon(pref === "system" ? "monitor" : pref === "dark" ? "moon" : "sun"));
    themeBtn.title = `Theme: ${pref}`;
  }
  function themeMenu(): MenuItem[] {
    const t = store.settings.theme;
    return [
      { label: "System", icon: "monitor", checked: t === "system", run: () => store.set("theme", "system") },
      { label: "Light", icon: "sun", checked: t === "light", run: () => store.set("theme", "light") },
      { label: "Dark", icon: "moon", checked: t === "dark", run: () => store.set("theme", "dark") },
    ];
  }

  function openMenu(): MenuItem[] {
    return [
      { label: "Open file…", icon: "folder", shortcut: "Mod+O", run: openFile },
      { label: "Load from URL…", icon: "globe", run: openUrlDialog },
      { label: "Paste from clipboard", icon: "clipboard", run: () => void pasteFromClipboard() },
      { label: "New document", icon: "plus", shortcut: "Alt+N", run: newDoc },
      { separator: true },
      { heading: "Samples" },
      ...SAMPLES.map((s): MenuItem => ({ label: s.name, icon: "sparkles", hint: s.description, run: () => loadSample(s) })),
    ];
  }

  const header = h(
    "header",
    { class: "topbar" },
    h(
      "a",
      { class: "brand", href: "/", "aria-label": "JSON Tools home", onclick: (e: MouseEvent) => { if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); void setView("tree"); } } },
      h("span", { class: "brand-mark" }, icon("braces", 18)),
      h("span", { class: "brand-name" }, "JSON Tools"),
    ),
    h("div", { class: "doc-strip" }, docTabs, newTabBtn),
    h(
      "div",
      { class: "top-actions" },
      button({ icon: "folder", label: "Open", title: "Open", compact: true, onClick: (e) => showMenu(e.currentTarget as HTMLElement, openMenu(), "end") }),
      button({ icon: "share", label: "Share", title: "Share a link", compact: true, onClick: () => void share() }),
      button({ icon: "command", title: "Command palette", kbd: kbd("Mod+K"), class: "palette-btn", onClick: () => palette() }),
      themeBtn,
      h("a", { class: "btn btn-ghost btn-icon hide-narrow", href: "https://github.com/thomaschaplin/json-tools", target: "_blank", rel: "noopener", title: "Source on GitHub", "aria-label": "Source on GitHub" }, icon("github")),
    ),
  );

  // Status bar --------------------------------------------------------------
  const statusValid = h("button", { type: "button", class: "status-item status-valid" });
  const statusWarn = h("button", { type: "button", class: "status-item status-warn", hidden: true });
  const statusPath = h("button", { type: "button", class: "status-item status-path", title: "Copy path" });
  const statusPos = h("span", { class: "status-item status-pos" });
  const statusSize = h("span", { class: "status-item status-size" });
  const statusSave = h("span", { class: "status-item status-save" });
  const statusbar = h("footer", { class: "statusbar" }, statusValid, statusWarn, statusPath, h("span", { class: "spacer" }), statusPos, statusSize, statusSave);

  statusValid.addEventListener("click", () => {
    const a = store.analysis;
    if (a.error) gotoError();
  });
  let warnIdx = 0;
  statusWarn.addEventListener("click", () => {
    const w = store.analysis.warnings;
    if (!w.length) return;
    const item = w[warnIdx++ % w.length];
    showPane("editor");
    editor.select(item.offset, item.offset);
    toast(item.message, "warning");
  });
  statusPath.addEventListener("click", () => {
    const p = statusPath.dataset.path;
    if (p) ctx.copy(p, "Path");
  });

  function renderStatus(): void {
    const a = store.analysis;
    const mode = store.active.mode === "json5" ? "JSON5" : "JSON";
    statusValid.className = "status-item status-valid";
    if (a.empty) {
      statusValid.replaceChildren(icon("info", 13), h("span", null, "Empty"));
      statusValid.classList.add("is-empty");
      statusValid.title = "";
    } else if (a.ok) {
      statusValid.replaceChildren(icon("checkCircle", 13), h("span", null, `Valid ${mode}`));
      statusValid.classList.add("is-ok");
      statusValid.title = "";
    } else if (a.error) {
      statusValid.replaceChildren(icon("alert", 13), h("span", { class: "status-err-text" }, `Ln ${a.error.line}, Col ${a.error.column}: ${a.error.message}`));
      statusValid.classList.add("is-error");
      statusValid.title = "Go to error";
    }
    statusWarn.hidden = !a.warnings.length;
    if (a.warnings.length) {
      statusWarn.replaceChildren(icon("warning", 13), h("span", null, `${a.warnings.length} warning${a.warnings.length === 1 ? "" : "s"}`));
      statusWarn.title = a.warnings.slice(0, 5).map((w) => `Ln ${w.line}: ${w.message}`).join("\n");
    }
    statusSize.textContent = formatBytes(new Blob([a.text]).size);
    statusSave.replaceChildren(store.saveFailed ? icon("warning", 12) : icon("lock", 12), h("span", null, store.saveFailed ? "Too large to autosave" : "Local only"));
    statusSave.title = store.saveFailed ? "This document is too large for browser storage and won't survive a reload" : "Saved in this browser only — nothing is uploaded";
    renderCursor();
  }

  function renderCursor(): void {
    const { line, col, offset } = store.cursor;
    statusPos.textContent = `Ln ${line}, Col ${col}`;
    const a = store.analysis;
    if (a.ok && a.ast && a.text === editor.text) {
      const at = pathAtOffset(a.ast, offset);
      if (at) {
        const p = toJsonPath(at.path);
        statusPath.hidden = false;
        statusPath.dataset.path = p;
        statusPath.replaceChildren(icon("crosshair", 12), h("code", null, p.length > 80 ? "…" + p.slice(-80) : p));
        return;
      }
    }
    statusPath.hidden = true;
  }

  // Panes ---------------------------------------------------------------------
  const dropOverlay = h("div", { class: "drop-overlay", hidden: true }, h("div", { class: "drop-card" }, icon("upload", 28), h("strong", null, "Drop to open"), h("span", { class: "muted" }, "JSON, JSON5, NDJSON or any text file")));
  const editorPane = h("section", { class: "pane pane-editor", "aria-label": "Editor" }, editorToolbar, editorHost);
  const splitter = h("div", { class: "splitter", role: "separator", "aria-orientation": "vertical", "aria-label": "Resize panes", tabindex: 0 });
  const toolPane = h("section", { class: "pane pane-tool", "aria-label": "Tools" }, h("div", { class: "tool-head" }, viewTabs), h("div", { class: "tool-stage" }, viewHost, overlayHost));
  const workspace = h("main", { class: "workspace", id: "workspace" }, editorPane, splitter, toolPane);

  const mobileSwitch = segmented<"editor" | "tool">(
    [
      { value: "editor", label: "Editor", icon: "edit" },
      { value: "tool", label: "Tools", icon: "layers" },
    ],
    "editor",
    (p) => showPane(p),
    "Pane",
  );
  const mobileBar = h("nav", { class: "mobile-bar", "aria-label": "Switch pane" }, mobileSwitch);

  function showPane(p: "editor" | "tool"): void {
    workspace.dataset.pane = p;
    mobileSwitch.set(p);
    if (p === "tool") {
      const v = views.get(currentView);
      v?.update(store.current());
    }
  }

  function applySplit(): void {
    workspace.style.setProperty("--split", `${Math.round(store.settings.split * 1000) / 10}%`);
  }
  applySplit();
  splitter.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    splitter.setPointerCapture(e.pointerId);
    workspace.classList.add("resizing");
    const rect = workspace.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const f = Math.min(0.8, Math.max(0.2, (ev.clientX - rect.left) / rect.width));
      store.settings.split = f;
      applySplit();
    };
    const up = () => {
      workspace.classList.remove("resizing");
      store.set("split", store.settings.split);
      splitter.removeEventListener("pointermove", move);
      splitter.removeEventListener("pointerup", up);
    };
    splitter.addEventListener("pointermove", move);
    splitter.addEventListener("pointerup", up);
  });
  splitter.addEventListener("dblclick", () => {
    store.set("split", 0.5);
    applySplit();
  });
  splitter.addEventListener("keydown", (e) => {
    const step = e.key === "ArrowLeft" ? -0.05 : e.key === "ArrowRight" ? 0.05 : 0;
    if (step) {
      store.set("split", Math.min(0.8, Math.max(0.2, store.settings.split + step)));
      applySplit();
    }
  });

  root.replaceChildren(header, workspace, statusbar, mobileBar, dropOverlay);
  workspace.dataset.pane = "editor";

  /* ---------------------------------------------------------- drag & drop */

  let dragDepth = 0;
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
  window.addEventListener("dragenter", (e) => {
    if (!hasFiles(e)) return;
    dragDepth++;
    dropOverlay.hidden = false;
  });
  window.addEventListener("dragleave", (e) => {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dropOverlay.hidden = true;
  });
  window.addEventListener("dragover", (e) => {
    if (hasFiles(e)) e.preventDefault();
  });
  window.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    dropOverlay.hidden = true;
    for (const f of Array.from(e.dataTransfer?.files ?? [])) void readFile(f);
  });

  /* ------------------------------------------------------------- commands */

  const commands: Command[] = [
    { id: "format", title: "Format document", section: "Edit", icon: "wand", shortcut: "Mod+Shift+F", keywords: "beautify pretty print indent", run: format },
    { id: "minify", title: "Minify document", section: "Edit", icon: "minify", shortcut: "Mod+Shift+M", keywords: "compress compact uglify", run: doMinify },
    { id: "repair", title: "Repair broken JSON", section: "Edit", icon: "wrench", keywords: "fix trailing comma quotes", run: repair },
    { id: "sort", title: "Sort keys A → Z", section: "Edit", icon: "sort", keywords: "order alphabetical", run: () => doSort() },
    { id: "sort-desc", title: "Sort keys Z → A", section: "Edit", icon: "sort", run: () => doSort(true) },
    { id: "compact", title: "Remove nulls & empty values", section: "Edit", icon: "filter", keywords: "clean prune", run: doCompact },
    { id: "flatten", title: "Flatten to dotted keys", section: "Edit", icon: "layers", run: doFlatten },
    { id: "unflatten", title: "Unflatten dotted keys", section: "Edit", icon: "layers", run: doUnflatten },
    { id: "stringify", title: "Escape as JSON string", section: "Edit", icon: "hash", keywords: "stringify quote", run: doStringify },
    { id: "unescape", title: "Unescape JSON string", section: "Edit", icon: "hash", keywords: "parse unstringify", run: doUnescape },
    { id: "find", title: "Find & replace", section: "Edit", icon: "search", shortcut: "Mod+F", run: () => { showPane("editor"); editor.openSearch(); } },
    { id: "fold", title: "Fold all", section: "Edit", icon: "collapse", run: () => editor.foldAll() },
    { id: "unfold", title: "Unfold all", section: "Edit", icon: "expand", run: () => editor.unfoldAll() },
    { id: "goto-error", title: "Go to error", section: "Edit", icon: "alert", run: gotoError, when: () => !!store.analysis.error },
    { id: "mode-json", title: "Switch to strict JSON", section: "Edit", icon: "braces", run: () => { store.setMode("json"); modeToggle.set("json"); }, when: () => store.active.mode !== "json" },
    { id: "mode-json5", title: "Switch to JSON5 (relaxed)", section: "Edit", icon: "braces", run: () => { store.setMode("json5"); modeToggle.set("json5"); }, when: () => store.active.mode !== "json5" },
    ...VIEW_ORDER.map((id, i): Command => ({ id: `view-${id}`, title: `Show ${VIEW_META[id].label}`, section: "Tools", icon: VIEW_META[id].icon, shortcut: `Alt+${i + 1}`, run: () => { setView(id); showPane("tool"); } })),
    { id: "to-yaml", title: "Convert to YAML", section: "Tools", icon: "convert", run: () => { setView("convert", { sub: "yaml" }); showPane("tool"); } },
    { id: "to-csv", title: "Convert to CSV", section: "Tools", icon: "convert", run: () => { setView("convert", { sub: "csv" }); showPane("tool"); } },
    { id: "to-ts", title: "Generate TypeScript types", section: "Tools", icon: "code", run: () => { setView("code", { sub: "typescript" }); showPane("tool"); } },
    { id: "from-yaml", title: "Import YAML", section: "Tools", icon: "convert", run: () => { setView("convert", { sub: "from-yaml" }); showPane("tool"); } },
    { id: "jwt", title: "Decode a JWT", section: "Tools", icon: "lock", run: () => { setView("convert", { sub: "from-jwt" }); showPane("tool"); } },
    { id: "open", title: "Open file…", section: "File", icon: "folder", shortcut: "Mod+O", run: openFile },
    { id: "url", title: "Load from URL…", section: "File", icon: "globe", keywords: "fetch http api", run: openUrlDialog },
    { id: "paste", title: "Paste from clipboard", section: "File", icon: "clipboard", run: () => void pasteFromClipboard() },
    { id: "new", title: "New document", section: "File", icon: "plus", shortcut: "Alt+N", run: newDoc },
    { id: "download", title: "Download document", section: "File", icon: "download", shortcut: "Mod+S", run: download },
    { id: "copy", title: "Copy document", section: "File", icon: "copy", run: () => ctx.copy(editor.text, "JSON") },
    { id: "share", title: "Share link…", section: "File", icon: "share", run: () => void share() },
    { id: "rename", title: "Rename document", section: "File", icon: "pencil", run: () => { const el = docTabs.querySelector(".active .doc-name") as HTMLElement | null; if (el) rename(store.activeId, el); } },
    { id: "close", title: "Close document", section: "File", icon: "x", run: () => closeDoc(store.activeId) },
    { id: "clear", title: "Clear document", section: "File", icon: "trash", run: clearDoc },
    ...SAMPLES.map((s): Command => ({ id: `sample-${s.id}`, title: `Sample: ${s.name}`, section: "File", icon: "sparkles", run: () => loadSample(s) })),
    { id: "theme-system", title: "Theme: System", section: "View", icon: "monitor", run: () => store.set("theme", "system") },
    { id: "theme-light", title: "Theme: Light", section: "View", icon: "sun", run: () => store.set("theme", "light") },
    { id: "theme-dark", title: "Theme: Dark", section: "View", icon: "moon", run: () => store.set("theme", "dark") },
    { id: "wrap", title: "Toggle word wrap", section: "View", icon: "wrap", shortcut: "Alt+Z", run: () => store.set("wrap", !store.settings.wrap) },
    { id: "font-up", title: "Increase editor font size", section: "View", icon: "plus", run: () => setFontSize(store.settings.fontSize + 1) },
    { id: "font-down", title: "Decrease editor font size", section: "View", icon: "minify", run: () => setFontSize(store.settings.fontSize - 1) },
    { id: "indent-2", title: "Indent with 2 spaces", section: "View", run: () => store.set("indent", 2) },
    { id: "indent-4", title: "Indent with 4 spaces", section: "View", run: () => store.set("indent", 4) },
    { id: "indent-tab", title: "Indent with tabs", section: "View", run: () => store.set("indent", "\t") },
    { id: "shortcuts", title: "Keyboard shortcuts", section: "Help", icon: "keyboard", shortcut: "?", run: showShortcuts },
    { id: "about", title: "About JSON Tools", section: "Help", icon: "info", run: () => document.getElementById("about")?.scrollIntoView({ behavior: "smooth" }) },
  ];

  function palette(): void {
    openPalette(commands);
  }

  function showShortcuts(): void {
    const rows: [string, string][] = [
      ["Mod+K", "Command palette"],
      ["Mod+Shift+F", "Format"],
      ["Mod+Shift+M", "Minify"],
      ["Mod+S", "Download"],
      ["Mod+O", "Open file"],
      ["Alt+N", "New document"],
      ["Alt+1 … Alt+8", "Switch tool"],
      ["Alt+Z", "Toggle word wrap"],
      ["Mod+F", "Find & replace in editor"],
      ["Mod+Alt+[ / ]", "Fold / unfold block"],
      ["Mod+Z / Mod+Shift+Z", "Undo / redo"],
      ["/", "Search the tree (when focused)"],
      ["↑ ↓ ← →", "Navigate the tree"],
      ["?", "This help"],
    ];
    openDialog({
      title: "Keyboard shortcuts",
      body: h("div", { class: "shortcuts" }, rows.map(([k, label]) => h("div", { class: "shortcut-row" }, h("span", null, label), h("kbd", null, kbd(k))))),
    });
  }

  document.addEventListener(
    "keydown",
    (e) => {
      const modKey = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      const inField = (e.target as HTMLElement)?.matches?.("input, textarea, select, [contenteditable]") && !(e.target as HTMLElement).closest(".cm-editor");
      if (modKey && !e.altKey && (k === "k" || (e.shiftKey && k === "p"))) {
        e.preventDefault();
        palette();
      } else if (modKey && !e.shiftKey && !e.altKey && k === "s") {
        e.preventDefault();
        download();
      } else if (modKey && !e.shiftKey && !e.altKey && k === "o") {
        e.preventDefault();
        openFile();
      } else if (modKey && e.shiftKey && k === "f" && !(e.target as HTMLElement).closest(".cm-editor")) {
        e.preventDefault();
        format();
      } else if (modKey && e.shiftKey && k === "m" && !(e.target as HTMLElement).closest(".cm-editor")) {
        e.preventDefault();
        doMinify();
      } else if (e.altKey && !modKey && /^Digit[1-8]$/.test(e.code)) {
        e.preventDefault();
        void setView(VIEW_ORDER[Number(e.code.slice(5)) - 1]);
        showPane("tool");
      } else if (e.altKey && !modKey && e.code === "KeyN") {
        e.preventDefault();
        newDoc();
      } else if (e.altKey && !modKey && e.code === "KeyZ") {
        e.preventDefault();
        store.set("wrap", !store.settings.wrap);
      } else if (e.key === "?" && !inField && !(e.target as HTMLElement).closest(".cm-editor")) {
        e.preventDefault();
        showShortcuts();
      }
    },
    true,
  );

  /* -------------------------------------------------------------- events */

  store.on("analysis", (a) => {
    renderStatus();
    renderOverlayState();
    const v = views.get(currentView);
    if (v && (!isNarrow() || workspace.dataset.pane === "tool")) v.update(a);
    const diags = [];
    if (a.error) {
      diags.push({ from: a.error.offset, to: a.error.offset + 1, severity: "error" as const, message: a.error.message });
    }
    for (const w of a.warnings.slice(0, 200)) diags.push({ from: w.offset, to: w.offset + 1, severity: "warning" as const, message: w.message });
    editor.setDiagnostics(diags);
  });
  store.on("active", () => {
    editor.load(store.active.text);
    modeToggle.set(store.active.mode);
    renderStatus();
  });
  store.on("text", ({ source }) => {
    if (source === "external" && editor.text !== store.active.text) editor.setText(store.active.text);
  });
  store.on("docs", () => {
    renderDocTabs();
    renderStatus();
  });
  store.on("cursor", debounce(renderCursor, 60));
  store.on("settings", (s) => {
    if (s.theme !== undefined) {
      applyTheme(s.theme);
      updateThemeIcon();
    }
    if (s.wrap !== undefined) editor.setWrap(s.wrap);
  });

  // Keep the visible view fresh when returning from the editor on mobile.
  window.addEventListener("resize", debounce(() => {
    if (!isNarrow()) views.get(currentView)?.update(store.current());
  }, 200));

  /* --------------------------------------------------------------- init */

  renderDocTabs();
  updateThemeIcon();
  renderStatus();
  const initialView = initialPage.slug ? initialPage.view : store.settings.view;
  currentPage = initialPage;
  void setView(initialView, { sub: initialPage.sub, syncUrl: false });
  showPane("editor");

  // Shared link (#json=…) or ?url= / ?json= parameters.
  void (async () => {
    const hash = new URLSearchParams(location.hash.slice(1));
    const params = new URLSearchParams(location.search);
    const shared = hash.get("json");
    if (shared) {
      try {
        let text = await decodeShare(shared);
        const r = parse(text);
        if (r.ok) text = print(r.ast, printOpts()) + "\n";
        openText(text, "Shared");
        toast("Opened shared document", "success");
      } catch {
        toast("That share link is damaged or incomplete", "error");
      }
      history.replaceState(null, "", location.pathname + location.search);
    } else if (params.get("url")) {
      void fetchUrl(params.get("url")!);
    } else if (params.get("json")) {
      openText(params.get("json")!, "From link");
    }
    if (params.has("url") || params.has("json")) {
      history.replaceState(null, "", location.pathname);
    }
  })();

  // Installed PWA: "Open with JSON Tools" from the OS file manager.
  const lq = (window as unknown as { launchQueue?: { setConsumer(cb: (p: { files: FileSystemFileHandle[] }) => void): void } }).launchQueue;
  lq?.setConsumer(async ({ files }) => {
    for (const handle of files ?? []) void readFile(await handle.getFile());
  });

  // Prefill the empty editor with a sample on tool landing pages so the tool demos itself.
  if (initialPage.slug && store.analysis.empty && !location.hash && !location.search && initialPage.view !== "convert") {
    const sample = initialPage.slug === "json-repair" ? SAMPLES.find((s) => s.id === "broken")! : initialPage.view === "query" ? SAMPLES.find((s) => s.id === "store")! : SAMPLES[0];
    store.active.text = sample.text;
    store.active.name = sample.name;
    store.active.mode = sample.mode;
    editor.load(sample.text);
    store.reanalyze(true);
    renderDocTabs();
  }
}
