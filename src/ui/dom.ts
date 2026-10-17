import { icon, type IconName } from "./icons";

type Child = Node | string | number | false | null | undefined | Child[];
type Attrs = Record<string, unknown> & {
  class?: string;
  style?: string | Partial<CSSStyleDeclaration>;
  dataset?: Record<string, string>;
};

/** Tiny hyperscript helper: h("button", { class: "btn", onclick }, "Label") */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === "class") el.className = String(value);
      else if (key === "style") {
        if (typeof value === "string") el.setAttribute("style", value);
        else Object.assign(el.style, value);
      } else if (key === "dataset") Object.assign(el.dataset, value);
      else if (key.startsWith("on") && typeof value === "function") {
        el.addEventListener(key.slice(2), value as EventListener);
      } else if (key in el && typeof value !== "string") {
        (el as unknown as Record<string, unknown>)[key] = value;
      } else {
        el.setAttribute(key, value === true ? "" : String(value));
      }
    }
  }
  append(el, children);
  return el;
}

export function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === "object" ? c : document.createTextNode(String(c)));
  }
}

export function clear(el: Element): void {
  el.replaceChildren();
}

export interface ButtonOptions {
  icon?: IconName;
  label?: string;
  title?: string;
  kbd?: string;
  variant?: "ghost" | "primary" | "subtle" | "danger";
  class?: string;
  onClick?: (e: MouseEvent) => void;
  /** Hide the label on narrow screens. */
  compact?: boolean;
}

export function button(opts: ButtonOptions): HTMLButtonElement {
  const b = h(
    "button",
    {
      type: "button",
      class: [
        "btn",
        `btn-${opts.variant ?? "ghost"}`,
        opts.label ? "" : "btn-icon",
        opts.compact ? "btn-compact" : "",
        opts.class ?? "",
      ]
        .filter(Boolean)
        .join(" "),
      title: opts.title ? (opts.kbd ? `${opts.title} (${opts.kbd})` : opts.title) : undefined,
      "aria-label": opts.label ? undefined : opts.title,
      onclick: opts.onClick,
    },
    opts.icon ? icon(opts.icon) : null,
    opts.label ? h("span", { class: "btn-label" }, opts.label) : null,
  );
  return b;
}

/** Segmented control (radio group). */
export function segmented<T extends string>(
  options: { value: T; label: string; title?: string; icon?: IconName }[],
  value: T,
  onChange: (v: T) => void,
  ariaLabel: string,
): HTMLElement & { set(v: T): void } {
  const root = h("div", { class: "segmented", role: "radiogroup", "aria-label": ariaLabel }) as unknown as HTMLElement & {
    set(v: T): void;
  };
  const buttons = options.map((o) =>
    h(
      "button",
      {
        type: "button",
        role: "radio",
        class: "segment",
        title: o.title,
        "aria-checked": String(o.value === value),
        onclick: () => {
          root.set(o.value);
          onChange(o.value);
        },
      },
      o.icon ? icon(o.icon) : null,
      h("span", null, o.label),
    ),
  );
  root.append(...buttons);
  root.set = (v: T) => {
    buttons.forEach((b, i) => b.setAttribute("aria-checked", String(options[i].value === v)));
  };
  return root;
}

export const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
export const mod = isMac ? "⌘" : "Ctrl";

export function kbd(shortcut: string): string {
  return shortcut
    .replace("Mod", mod)
    .replace("Shift", isMac ? "⇧" : "Shift")
    .replace("Alt", isMac ? "⌥" : "Alt")
    .replace(/\+/g, isMac ? "" : "+");
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h("textarea", { style: "position:fixed;opacity:0;top:0;left:0" });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export function downloadText(text: string, filename: string, type = "application/json"): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = h("a", { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): ((...args: A) => void) & { cancel(): void; flush(): void } {
  let t: ReturnType<typeof setTimeout> | undefined;
  let last: A | undefined;
  const d = ((...args: A) => {
    last = args;
    clearTimeout(t);
    t = setTimeout(() => {
      t = undefined;
      fn(...args);
    }, ms);
  }) as ((...args: A) => void) & { cancel(): void; flush(): void };
  d.cancel = () => clearTimeout(t);
  d.flush = () => {
    if (t !== undefined && last) {
      clearTimeout(t);
      t = undefined;
      fn(...last);
    }
  };
  return d;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function isNarrow(): boolean {
  return window.matchMedia("(max-width: 860px)").matches;
}

/** Scroll `el` into view within `container` only (never the page). */
export function scrollWithin(container: HTMLElement, el: HTMLElement, center = true): void {
  const c = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (r.top >= c.top && r.bottom <= c.bottom) return;
  const offset = r.top - c.top + container.scrollTop;
  container.scrollTop = center ? offset - container.clientHeight / 2 + r.height / 2 : offset;
}
