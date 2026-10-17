import { h, kbd } from "./dom";
import { icon, type IconName } from "./icons";

export interface Command {
  id: string;
  title: string;
  section: string;
  icon?: IconName;
  shortcut?: string;
  keywords?: string;
  run: () => void;
  when?: () => boolean;
}

function score(q: string, text: string): number {
  if (!q) return 1;
  const t = text.toLowerCase();
  const i = t.indexOf(q);
  if (i === 0) return 100;
  if (i > 0) return 80 - Math.min(i, 40) + (/\s/.test(t[i - 1]) ? 15 : 0);
  // subsequence match
  let ti = 0;
  let gaps = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found === -1) return 0;
    gaps += found - ti;
    ti = found + 1;
  }
  return Math.max(1, 40 - gaps);
}

export function openPalette(commands: Command[]): void {
  if (document.querySelector(".palette")) return;
  const input = h("input", {
    class: "palette-input",
    type: "text",
    placeholder: "Type a command…",
    "aria-label": "Search commands",
    autocomplete: "off",
    spellcheck: false,
  });
  const list = h("div", { class: "palette-list", role: "listbox" });
  const dlg = h("dialog", { class: "palette", "aria-label": "Command palette" }, h("div", { class: "palette-search" }, icon("search"), input), list);
  let active = 0;
  let shown: Command[] = [];

  const render = () => {
    const q = input.value.trim().toLowerCase();
    shown = commands
      .filter((c) => !c.when || c.when())
      .map((c) => ({ c, s: score(q, `${c.title} ${c.section} ${c.keywords ?? ""}`) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => (q ? b.s - a.s : 0))
      .map((x) => x.c);
    active = Math.min(active, Math.max(0, shown.length - 1));
    let lastSection = "";
    list.replaceChildren(
      ...shown.flatMap((c, i) => {
        const items: Node[] = [];
        if (!q && c.section !== lastSection) {
          lastSection = c.section;
          items.push(h("div", { class: "palette-section" }, c.section));
        }
        items.push(
          h(
            "div",
            {
              class: "palette-item",
              role: "option",
              "aria-selected": String(i === active),
              onpointermove: () => {
                if (active !== i) {
                  active = i;
                  highlight();
                }
              },
              onclick: () => runAt(i),
            },
            c.icon ? icon(c.icon) : h("span", { class: "icon" }),
            h("span", { class: "palette-title" }, c.title),
            q ? h("span", { class: "palette-sec" }, c.section) : null,
            c.shortcut ? h("kbd", null, kbd(c.shortcut)) : null,
          ),
        );
        return items;
      }),
    );
    if (!shown.length) list.append(h("div", { class: "palette-empty" }, "No matching commands"));
  };
  const highlight = () => {
    list.querySelectorAll(".palette-item").forEach((el, i) => el.setAttribute("aria-selected", String(i === active)));
    list.querySelectorAll(".palette-item")[active]?.scrollIntoView({ block: "nearest" });
  };
  const runAt = (i: number) => {
    const c = shown[i];
    dlg.close();
    if (c) setTimeout(c.run, 0);
  };
  input.addEventListener("input", () => {
    active = 0;
    render();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      active = (active + 1) % Math.max(1, shown.length);
      highlight();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      active = (active - 1 + shown.length) % Math.max(1, shown.length);
      highlight();
    } else if (e.key === "Enter") {
      e.preventDefault();
      runAt(active);
    }
  });
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) dlg.close();
  });
  dlg.addEventListener("close", () => dlg.remove());
  document.body.append(dlg);
  render();
  dlg.showModal();
  input.focus();
}
