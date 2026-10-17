import { parse, toValue, type Issue, type JsonNode } from "./lib/parse";
import type { Indent } from "./lib/format";

export type ViewId = "tree" | "table" | "query" | "code" | "convert" | "diff" | "schema" | "stats";
export type Mode = "json" | "json5";
export type ThemePref = "system" | "light" | "dark";

export interface Doc {
  id: string;
  name: string;
  text: string;
  mode: Mode;
  updated: number;
}

export interface Settings {
  indent: Indent;
  inlineWidth: number;
  theme: ThemePref;
  wrap: boolean;
  view: ViewId;
  split: number;
  formatOnPaste: boolean;
  fontSize: number;
}

export interface Analysis {
  docId: string;
  text: string;
  empty: boolean;
  ok: boolean;
  ast: JsonNode | null;
  value: unknown;
  error: Issue | null;
  warnings: Issue[];
  /** Loose-mode repairs (JSON5 mode, or "could be repaired" hints in JSON mode). */
  fixes: Issue[];
  repairable: boolean;
}

type Events = {
  docs: void;
  active: void;
  text: { source: "editor" | "external" };
  analysis: Analysis;
  settings: Partial<Settings>;
  cursor: { offset: number; line: number; col: number };
  view: ViewId;
};

type Handler<T> = (payload: T) => void;

const STORAGE_DOCS = "jt.docs.v2";
const STORAGE_ACTIVE = "jt.active.v2";
const STORAGE_SETTINGS = "jt.settings.v2";

const DEFAULT_SETTINGS: Settings = {
  indent: 2,
  inlineWidth: 0,
  theme: "system",
  wrap: false,
  view: "tree",
  split: 0.5,
  formatOnPaste: true,
  fontSize: 13.5,
};

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

class Store {
  docs: Doc[];
  activeId: string;
  settings: Settings;
  analysis: Analysis;
  cursor = { offset: 0, line: 1, col: 1 };
  /** True when the last save attempt failed (document too large for storage). */
  saveFailed = false;
  private handlers = new Map<keyof Events, Set<Handler<unknown>>>();
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private analyzeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.settings = { ...DEFAULT_SETTINGS, ...load<Partial<Settings>>(STORAGE_SETTINGS, {}) };
    this.docs = load<Doc[]>(STORAGE_DOCS, []).filter((d) => d && typeof d.text === "string");
    if (!this.docs.length) this.docs = [this.blank("Untitled")];
    const active = load<string>(STORAGE_ACTIVE, "");
    this.activeId = this.docs.some((d) => d.id === active) ? active : this.docs[0].id;
    this.analysis = analyze(this.active);
  }

  on<K extends keyof Events>(event: K, fn: Handler<Events[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(fn as Handler<unknown>);
    return () => set!.delete(fn as Handler<unknown>);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.handlers.get(event)?.forEach((fn) => fn(payload));
  }

  get active(): Doc {
    return this.docs.find((d) => d.id === this.activeId) ?? this.docs[0];
  }

  blank(name?: string, text = "", mode: Mode = "json"): Doc {
    return { id: uid(), name: name ?? this.nextName(), text, mode, updated: Date.now() };
  }

  nextName(base = "Untitled"): string {
    const names = new Set(this.docs?.map((d) => d.name) ?? []);
    if (!names.has(base)) return base;
    let i = 2;
    while (names.has(`${base} ${i}`)) i++;
    return `${base} ${i}`;
  }

  /** Create and activate a new document. Reuses the current tab if it is empty. */
  open(text: string, name?: string, mode: Mode = "json"): Doc {
    const cur = this.active;
    if (cur.text.trim() === "" && this.docs.length >= 1) {
      cur.text = text;
      cur.mode = mode;
      if (name) cur.name = this.nextName(name);
      cur.updated = Date.now();
      this.emit("docs", undefined);
      this.emit("text", { source: "external" });
      this.reanalyze(true);
      this.persist();
      return cur;
    }
    const doc = this.blank(name ? this.nextName(name) : undefined, text, mode);
    this.docs.push(doc);
    this.activate(doc.id);
    return doc;
  }

  activate(id: string): void {
    if (!this.docs.some((d) => d.id === id)) return;
    this.flushAnalysis();
    this.activeId = id;
    this.emit("docs", undefined);
    this.emit("active", undefined);
    this.reanalyze(true);
    this.persist();
  }

  close(id: string): void {
    const i = this.docs.findIndex((d) => d.id === id);
    if (i === -1) return;
    this.docs.splice(i, 1);
    if (!this.docs.length) this.docs.push(this.blank("Untitled"));
    if (this.activeId === id) {
      this.activeId = this.docs[Math.min(i, this.docs.length - 1)].id;
      this.emit("active", undefined);
      this.reanalyze(true);
    }
    this.emit("docs", undefined);
    this.persist();
  }

  rename(id: string, name: string): void {
    const d = this.docs.find((x) => x.id === id);
    if (!d || !name.trim()) return;
    d.name = name.trim().slice(0, 60);
    this.emit("docs", undefined);
    this.persist();
  }

  reorder(fromId: string, toId: string): void {
    const from = this.docs.findIndex((d) => d.id === fromId);
    const to = this.docs.findIndex((d) => d.id === toId);
    if (from < 0 || to < 0 || from === to) return;
    const [d] = this.docs.splice(from, 1);
    this.docs.splice(to, 0, d);
    this.emit("docs", undefined);
    this.persist();
  }

  /** Update the active document's text. */
  setText(text: string, source: "editor" | "external" = "editor"): void {
    const d = this.active;
    if (d.text === text) return;
    d.text = text;
    d.updated = Date.now();
    this.emit("text", { source });
    this.reanalyze(source === "external");
    this.persist();
  }

  setMode(mode: Mode): void {
    this.active.mode = mode;
    this.emit("docs", undefined);
    this.reanalyze(true);
    this.persist();
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    if (this.settings[key] === value) return;
    this.settings[key] = value;
    save(STORAGE_SETTINGS, this.settings);
    this.emit("settings", { [key]: value } as Partial<Settings>);
  }

  setView(view: ViewId): void {
    this.set("view", view);
    this.emit("view", view);
  }

  setCursor(offset: number, line: number, col: number): void {
    this.cursor = { offset, line, col };
    this.emit("cursor", this.cursor);
  }

  reanalyze(immediate = false): void {
    clearTimeout(this.analyzeTimer);
    const run = () => {
      this.analysis = analyze(this.active);
      this.emit("analysis", this.analysis);
    };
    if (immediate) run();
    else {
      const size = this.active.text.length;
      this.analyzeTimer = setTimeout(run, size > 2e6 ? 600 : size > 2e5 ? 250 : 120);
    }
  }

  flushAnalysis(): void {
    if (this.analysis.text !== this.active.text || this.analysis.docId !== this.active.id) {
      clearTimeout(this.analyzeTimer);
      this.analysis = analyze(this.active);
      this.emit("analysis", this.analysis);
    }
  }

  /** The latest analysis, recomputed synchronously if it is stale. */
  current(): Analysis {
    this.flushAnalysis();
    return this.analysis;
  }

  persist(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      const ok = save(STORAGE_DOCS, this.docs) && save(STORAGE_ACTIVE, this.activeId);
      if (!ok) {
        // Fall back to persisting everything except oversized documents.
        const slim = this.docs.map((d) => (d.text.length > 1e6 ? { ...d, text: "" } : d));
        save(STORAGE_DOCS, slim);
      }
      if (ok !== !this.saveFailed) {
        this.saveFailed = !ok;
        this.emit("docs", undefined);
      }
    }, 400);
  }
}

export function analyze(doc: Doc): Analysis {
  const text = doc.text;
  const base = { docId: doc.id, text, warnings: [] as Issue[], fixes: [] as Issue[] };
  if (text.trim() === "") {
    return { ...base, empty: true, ok: false, ast: null, value: undefined, error: null, repairable: false };
  }
  const loose = doc.mode === "json5";
  const r = parse(text, { loose });
  if (r.ok) {
    return {
      ...base,
      empty: false,
      ok: true,
      ast: r.ast,
      value: toValue(r.ast),
      error: null,
      warnings: r.warnings,
      fixes: r.fixes,
      repairable: false,
    };
  }
  const repairable = !loose && text.length < 5e6 && parse(text, { loose: true }).ok;
  return { ...base, empty: false, ok: false, ast: null, value: undefined, error: r.error, repairable };
}

export const store = new Store();
