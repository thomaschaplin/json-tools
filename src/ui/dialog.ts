import { h, button } from "./dom";

export interface DialogHandle {
  el: HTMLDialogElement;
  close(): void;
}

/** Open a modal dialog. Content is built by the caller. */
export function openDialog(opts: {
  title: string;
  body: Node | Node[];
  footer?: Node[];
  wide?: boolean;
  onClose?: () => void;
}): DialogHandle {
  const el = h(
    "dialog",
    { class: `dialog${opts.wide ? " dialog-wide" : ""}`, "aria-label": opts.title },
    h(
      "div",
      { class: "dialog-head" },
      h("h2", null, opts.title),
      button({ icon: "x", title: "Close", onClick: () => close() }),
    ),
    h("div", { class: "dialog-body" }, opts.body),
    opts.footer ? h("div", { class: "dialog-foot" }, opts.footer) : null,
  );
  const close = () => {
    if (!el.open) return;
    el.close();
  };
  el.addEventListener("close", () => {
    el.remove();
    opts.onClose?.();
  });
  el.addEventListener("click", (e) => {
    if (e.target === el) close();
  });
  document.body.append(el);
  el.showModal();
  return { el, close };
}
