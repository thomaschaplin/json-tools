import type { Analysis } from "../state";
import { store } from "../state";
import { minify, print } from "../lib/format";
import { byteLength, computeStats, formatBytes, formatCount } from "../lib/stats";
import { h } from "../ui/dom";
import type { AppContext, View } from "./types";

async function gzipSize(text: string): Promise<number | null> {
  if (typeof CompressionStream === "undefined") return null;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return (await new Response(stream).arrayBuffer()).byteLength;
}

export class StatsView implements View {
  id = "stats" as const;
  label = "Stats";
  icon = "chart" as const;
  el: HTMLElement;
  private body: HTMLElement;
  private lastText = "";
  private seq = 0;

  constructor(_ctx: AppContext) {
    this.body = h("div", { class: "stats" });
    this.el = h("div", { class: "view view-stats" }, this.body);
  }

  update(a: Analysis): void {
    if (!a.ok || !a.ast) return;
    if (a.text === this.lastText) return;
    this.lastText = a.text;
    const s = computeStats(a.ast, a.text);
    const min = minify(a.ast);
    const minBytes = byteLength(min);
    const pretty = byteLength(print(a.ast, { indent: store.settings.indent }));
    const saved = s.bytes ? Math.max(0, Math.round((1 - minBytes / s.bytes) * 100)) : 0;
    const gzipEl = h("div", { class: "stat-value" }, "…");
    const seq = ++this.seq;
    void gzipSize(min).then((n) => {
      if (seq === this.seq) gzipEl.textContent = n === null ? "n/a" : formatBytes(n);
    });

    const card = (label: string, value: string | Node, sub?: string) =>
      h("div", { class: "stat" }, h("div", { class: "stat-label" }, label), typeof value === "string" ? h("div", { class: "stat-value" }, value) : value, sub ? h("div", { class: "stat-sub" }, sub) : null);

    const types: [string, number, string][] = [
      ["Objects", s.objects, "var(--syn-key)"],
      ["Arrays", s.arrays, "var(--syn-type)"],
      ["Strings", s.strings, "var(--syn-string)"],
      ["Numbers", s.numbers, "var(--syn-number)"],
      ["Booleans", s.booleans, "var(--syn-bool)"],
      ["Nulls", s.nulls, "var(--syn-null)"],
    ];
    const totalValues = types.reduce((n, t) => n + t[1], 0) || 1;
    const maxKey = s.topKeys[0]?.[1] ?? 1;

    const nodes: (Node | null)[] = [
      h("h3", { class: "stats-heading" }, "Size"),
      h(
        "div",
        { class: "stat-grid" },
        card("Current", formatBytes(s.bytes), `${formatCount(s.lines)} lines`),
        card("Minified", formatBytes(minBytes), saved ? `${saved}% smaller than current` : "Already minified"),
        card("Gzipped", gzipEl, "minified + gzip"),
        card("Pretty", formatBytes(pretty), `${store.settings.indent === "\t" ? "tab" : store.settings.indent + "-space"} indent`),
      ),
      h("h3", { class: "stats-heading" }, "Structure"),
      h(
        "div",
        { class: "stat-grid" },
        card("Max depth", formatCount(s.depth)),
        card("Values", formatCount(totalValues)),
        card("Keys", formatCount(s.keys), `${formatCount(s.uniqueKeys)} unique`),
        card("Longest array", formatCount(s.longestArray), "items"),
      ),
      h("h3", { class: "stats-heading" }, "Value types"),
      h(
        "div",
        { class: "type-bar", role: "img", "aria-label": types.map(([l, n]) => `${l}: ${n}`).join(", ") },
        types.filter(([, n]) => n > 0).map(([l, n, c]) => h("span", { style: `flex:${n};background:${c}`, title: `${l}: ${formatCount(n)}` })),
      ),
      h(
        "div",
        { class: "type-legend" },
        types.map(([l, n, c]) => h("span", { class: "legend-item" }, h("i", { style: `background:${c}` }), `${l} `, h("b", null, formatCount(n)), h("span", { class: "muted" }, ` ${Math.round((n / totalValues) * 100)}%`))),
      ),
      s.topKeys.length ? h("h3", { class: "stats-heading" }, "Most frequent keys") : null,
      s.topKeys.length
        ? h(
            "div",
            { class: "key-bars" },
            s.topKeys.map(([k, n]) => h("div", { class: "key-bar" }, h("code", { class: "key-name", title: k }, k), h("div", { class: "key-track" }, h("span", { style: `width:${Math.max(2, (n / maxKey) * 100)}%` })), h("span", { class: "key-count" }, formatCount(n)))),
          )
        : null,
    ];
    this.body.replaceChildren(...nodes.filter((n): n is Node => n !== null));
  }
}
