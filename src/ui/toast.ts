import { h } from "./dom";
import { icon } from "./icons";

type Kind = "info" | "success" | "error" | "warning";

let region: HTMLElement | null = null;

export function toast(message: string, kind: Kind = "info", opts: { action?: { label: string; run: () => void }; duration?: number } = {}): void {
  if (!region) {
    region = h("div", { class: "toasts", role: "status", "aria-live": "polite" });
    document.body.append(region);
  }
  const ico = kind === "success" ? "check" : kind === "error" ? "alert" : kind === "warning" ? "warning" : "info";
  const el = h(
    "div",
    { class: `toast toast-${kind}` },
    icon(ico),
    h("span", { class: "toast-msg" }, message),
    opts.action
      ? h(
          "button",
          {
            class: "toast-action",
            type: "button",
            onclick: () => {
              opts.action!.run();
              dismiss();
            },
          },
          opts.action.label,
        )
      : null,
  );
  const dismiss = () => {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 200);
  };
  region.append(el);
  while (region.children.length > 3) region.firstElementChild?.remove();
  setTimeout(dismiss, opts.duration ?? (kind === "error" ? 5000 : 2400));
}
