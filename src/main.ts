import "./style.css";
import { createEditor, type EditorHandle } from "./editor";
import { currentMode, parsers, type Mode } from "./parsers";
import { EXAMPLE_JSON, EXAMPLE_JSON5 } from "./examples";
import { haptic, requireEl, toast } from "./toast";
import { currentTheme, onThemeChange, setupTheme } from "./theme";

const INDENT = 2;

const mount = requireEl("jsonField");
const dropZone = requireEl("dropZone");
const themeToggle = requireEl("themeToggle");
const actionButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>(".button"),
);

/* ------------------------------------------------------------------ editor */

const editor: EditorHandle = createEditor(mount, {
  initialMode: currentMode(),
  initialTheme: currentTheme(),
  onChange: refreshButtons,
});

function rawJsonData(): string {
  return editor.getValue();
}

/* ----------------------------------------------------------------- helpers */

function activeParser() {
  return parsers[currentMode()];
}

// Parse with the active mode, surfacing errors as toasts. Returns a result
// object so callers can distinguish a parse failure from a parsed value.
function parse():
  | { ok: true; value: unknown; codec: (typeof parsers)[Mode]["codec"] }
  | { ok: false } {
  const parser = activeParser();
  try {
    return { ok: true, value: parser.codec.parse(rawJsonData()), codec: parser.codec };
  } catch (error) {
    toast((error as Error).message, {
      type: "error",
      title: `Invalid ${parser.label}`,
    });
    return { ok: false };
  }
}

// The "Example" button stays enabled on an empty editor — loading a sample is the
// one action that makes sense with no input yet.
const toggleButtons = actionButtons.filter(
  (button) => button.dataset.action !== "example",
);

function refreshButtons(): void {
  const empty = rawJsonData().trim() === "";
  for (const button of toggleButtons) {
    button.disabled = empty;
  }
}

/* ------------------------------------------------------------------ actions */

function prettyPrint(): void {
  const result = parse();
  if (result.ok) editor.setValue(result.codec.stringify(result.value, INDENT));
}

function minify(): void {
  const result = parse();
  if (result.ok) editor.setValue(result.codec.stringify(result.value, undefined));
}

function validate(): void {
  const parser = activeParser();
  const result = parse();
  if (result.ok) {
    toast(`Your input is valid ${parser.label}.`, {
      type: "success",
      title: `Valid ${parser.label}`,
    });
  }
}

async function copy(): Promise<void> {
  const text = rawJsonData();
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied to clipboard.", { type: "success" });
  } catch {
    // Fallback for non-secure contexts / older browsers. CodeMirror has no
    // native select(), so copy via a temporary off-screen textarea.
    const helper = document.createElement("textarea");
    helper.value = text;
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    helper.remove();
    toast(ok ? "Copied to clipboard." : "Could not copy to clipboard.", {
      type: ok ? "success" : "error",
    });
  }
}

function download(): void {
  const defaultName = `json-tools-${Math.round(Date.now() / 1000)}`;
  const input = window.prompt("File name", defaultName);
  if (input === null) return; // cancelled
  const name = (input.trim() || defaultName).replace(/\.json$/i, "");

  const blob = new Blob([rawJsonData()], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  toast(`Downloaded ${name}.json`, { type: "success" });
}

function clear(): void {
  editor.setValue("");
  refreshButtons();
  editor.focus();
}

function loadExample(): void {
  if (
    rawJsonData().trim() !== "" &&
    !window.confirm("Replace the current contents with example data?")
  ) {
    return; // keep the user's input
  }
  editor.setValue(currentMode() === "json5" ? EXAMPLE_JSON5 : EXAMPLE_JSON);
  refreshButtons();
  editor.focus();
  toast("Loaded example data.", { type: "success" });
}

const handlers: Record<string, () => void> = {
  pretty: prettyPrint,
  minify,
  validate,
  copy: () => void copy(),
  download,
  example: loadExample,
  clear,
};

/* ----------------------------------------------------------------- drag/drop */

function loadFile(file: File | undefined): void {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    editor.setValue(String(reader.result ?? ""));
    refreshButtons();
    toast(`Loaded ${file.name}`, { type: "success" });
  };
  reader.onerror = () => toast("Could not read that file.", { type: "error" });
  reader.readAsText(file);
}

function setupDropZone(): void {
  let depth = 0;
  const show = () => dropZone.classList.add("is-dragover");
  const hide = () => dropZone.classList.remove("is-dragover");

  dropZone.addEventListener("dragenter", (e) => {
    e.preventDefault();
    depth += 1;
    show();
  });
  dropZone.addEventListener("dragover", (e) => e.preventDefault());
  dropZone.addEventListener("dragleave", () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) hide();
  });
  // Capture phase + stopPropagation so the file drop is handled here and
  // CodeMirror doesn't try to insert the file path / hijack the drop.
  dropZone.addEventListener(
    "drop",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      depth = 0;
      hide();
      loadFile(e.dataTransfer?.files?.[0]);
    },
    true,
  );
}

/* -------------------------------------------------------------------- wiring */

setupTheme(themeToggle);
onThemeChange((theme) => editor.setTheme(theme));
refreshButtons();
setupDropZone();

for (const button of actionButtons) {
  button.addEventListener("click", () => {
    haptic(button.dataset.action === "clear" ? 12 : 8);
    const action = button.dataset.action;
    if (action && handlers[action]) handlers[action]();
  });
}

// A light tick when switching format mode, matching the sliding-pill motion, and
// keep the editor's linter in sync with the selected mode.
for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="mode"]')) {
  radio.addEventListener("change", () => {
    haptic(6);
    editor.setMode(currentMode());
  });
}
