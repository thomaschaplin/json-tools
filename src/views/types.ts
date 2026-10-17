import type { Analysis, Mode, ViewId } from "../state";
import type { Path } from "../lib/path";
import type { IconName } from "../ui/icons";

export interface AppContext {
  /** Select the node at `path` in the main editor. */
  reveal(path: Path, focusEditor?: boolean): void;
  /** Open text in a new document tab (or the current one if it is empty). */
  openDocument(text: string, name?: string, mode?: Mode): void;
  /** Replace the active document's text (undoable). */
  replaceDocument(text: string): void;
  /** Notify the shell that a view's sub-option changed (keeps the URL in sync). */
  subChanged(view: ViewId, sub: string | undefined): void;
  /** On narrow screens, switch the visible pane. */
  showPane(pane: "editor" | "tool"): void;
  copy(text: string, what?: string): void;
  download(text: string, filename: string, type?: string): void;
  activeName(): string;
}

export interface View {
  id: ViewId;
  label: string;
  icon: IconName;
  el: HTMLElement;
  /** Called with the latest analysis whenever it changes while visible, and when shown. */
  update(a: Analysis): void;
  show?(): void;
  hide?(): void;
  setSub?(sub: string): void;
  getSub?(): string | undefined;
}
