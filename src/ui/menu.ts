import { h, kbd } from "./dom";
import { icon, type IconName } from "./icons";

export type MenuItem =
  | {
      label: string;
      icon?: IconName;
      shortcut?: string;
      hint?: string;
      checked?: boolean;
      disabled?: boolean;
      run: () => void;
    }
  | { separator: true }
  | { heading: string };

let open: { el: HTMLElement; anchor: HTMLElement; close: () => void } | null = null;

export function closeMenu(): void {
  open?.close();
}

/** Show a dropdown menu anchored to `anchor`. */
export function showMenu(anchor: HTMLElement, items: MenuItem[], align: "start" | "end" = "start"): void {
  if (open && open.anchor === anchor) {
    closeMenu();
    return;
  }
  closeMenu();
  const buttons: HTMLButtonElement[] = [];
  const el = h(
    "div",
    { class: "menu", role: "menu" },
    items.map((item) => {
      if ("separator" in item) return h("div", { class: "menu-sep", role: "separator" });
      if ("heading" in item) return h("div", { class: "menu-heading" }, item.heading);
      const b = h(
        "button",
        {
          type: "button",
          role: item.checked === undefined ? "menuitem" : "menuitemradio",
          "aria-checked": item.checked === undefined ? undefined : String(item.checked),
          class: "menu-item",
          disabled: item.disabled,
          onclick: () => {
            close();
            item.run();
          },
        },
        h("span", { class: "menu-icon" }, item.checked ? icon("check") : item.icon ? icon(item.icon) : null),
        h("span", { class: "menu-label" }, item.label, item.hint ? h("small", null, item.hint) : null),
        item.shortcut ? h("kbd", null, kbd(item.shortcut)) : null,
      );
      buttons.push(b);
      return b;
    }),
  );
  document.body.append(el);
  const r = anchor.getBoundingClientRect();
  const mw = el.offsetWidth;
  const mh = el.offsetHeight;
  let left = align === "end" ? r.right - mw : r.left;
  left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
  let top = r.bottom + 6;
  if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  anchor.setAttribute("aria-expanded", "true");

  const onDown = (e: PointerEvent) => {
    if (!el.contains(e.target as Node) && !anchor.contains(e.target as Node)) close();
  };
  const onKey = (e: KeyboardEvent) => {
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") {
      close();
      anchor.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      buttons[(i + 1) % buttons.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      buttons[(i - 1 + buttons.length) % buttons.length]?.focus();
    }
  };
  const close = () => {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 120);
    anchor.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", onDown, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", close);
    if (open?.el === el) open = null;
  };
  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", close);
  open = { el, anchor, close };
  requestAnimationFrame(() => buttons.find((b) => !b.disabled)?.focus({ preventScroll: true }));
}
