const INDENT = 2;
const THEME_KEY = "json-tools-theme";
const JSON5_URL = "https://cdn.jsdelivr.net/npm/json5@2/+esm";

// Sample data so a first-time visitor can try the tool without hunting for JSON.
// The JSON5 variant uses the same data but leans on JSON5-only syntax (a comment,
// unquoted keys, single quotes, a trailing comma) to show off what the mode allows.
const EXAMPLE_JSON = `{
    "name": "JSON Tools",
    "version": "1.0.0",
    "private": false,
    "tags": ["json", "json5", "formatter"],
    "author": {
        "name": "Thomas Chaplin",
        "url": "https://json.thomaschaplin.me"
    },
    "features": {
        "prettyPrint": true,
        "minify": true,
        "validate": true,
        "offline": true
    },
    "stars": 42,
    "license": null
}`;

const EXAMPLE_JSON5 = `{
    // JSON5 allows comments, unquoted keys, single quotes and trailing commas.
    name: 'JSON Tools',
    version: '1.0.0',
    private: false,
    tags: ['json', 'json5', 'formatter'],
    author: {
        name: 'Thomas Chaplin',
        url: 'https://json.thomaschaplin.me',
    },
    features: {
        prettyPrint: true,
        minify: true,
        validate: true,
        offline: true,
    },
    stars: 42,
    license: null,
}`;

// JSON5 is loaded lazily from a CDN the first time it is needed, so the app
// (and all JSON-only features) work instantly with no network dependency.
let json5Promise;
function loadJSON5() {
    if (!json5Promise) {
        json5Promise = import(/* @vite-ignore */ JSON5_URL).then((m) => m.default || m);
    }
    return json5Promise;
}

// Each format mode exposes a matching parse/stringify pair. JSON is synchronous;
// JSON5 resolves its library on demand.
const parsers = {
    json: {
        label: "JSON",
        load: () => Promise.resolve({
            parse: (text) => JSON.parse(text),
            stringify: (value, indent) => JSON.stringify(value, undefined, indent),
        }),
    },
    json5: {
        label: "JSON5",
        load: () => loadJSON5().then((JSON5) => ({
            parse: (text) => JSON5.parse(text),
            stringify: (value, indent) => JSON5.stringify(value, undefined, indent),
        })),
    },
};

const field = document.getElementById("jsonField");
const dropZone = document.getElementById("dropZone");
const toasts = document.getElementById("toasts");
const themeToggle = document.getElementById("themeToggle");
const actionButtons = Array.from(document.querySelectorAll(".button"));

/* ------------------------------------------------------------------ helpers */

function currentMode() {
    const checked = document.querySelector('input[name="mode"]:checked');
    return parsers[checked && parsers[checked.value] ? checked.value : "json"];
}

function rawJsonData() {
    return field.value;
}

// A subtle vibration on interaction. Progressive enhancement — supported on
// Android/Chrome and silently ignored where the Vibration API is unavailable
// (notably iOS Safari), so calling it is always safe.
function haptic(ms = 8) {
    navigator.vibrate?.(ms);
}

// Let an element be flicked away with a vertical swipe, iOS banner style. The
// finger is tracked upward 1:1 (the dismiss direction) and damped downward, with
// opacity fading as it travels. Past a small threshold the swipe commits and
// `dismiss` is called; otherwise it springs back to rest.
function makeSwipeable(el, dismiss) {
    let startY = 0;
    let dy = 0;
    let dragging = false;

    el.addEventListener("pointerdown", (e) => {
        dragging = true;
        startY = e.clientY;
        dy = 0;
        el.setPointerCapture(e.pointerId);
        el.style.transition = "none";
    });

    el.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        dy = e.clientY - startY;
        if (dy > 0) dy *= 0.3; // resist dragging the wrong way
        el.style.transform = `translateY(${dy}px)`;
        el.style.opacity = String(Math.max(0, 1 + Math.min(0, dy) / 120));
    });

    const end = () => {
        if (!dragging) return;
        dragging = false;
        el.style.transition = "";
        if (dy < -40) {
            haptic(6);
            dismiss();
        } else {
            // Spring back to its resting position.
            el.style.transform = "";
            el.style.opacity = "";
        }
    };

    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
}

function toast(message, { type = "info", title } = {}) {
    const el = document.createElement("div");
    el.className = `toast toast--${type}`;
    if (title) {
        const heading = document.createElement("p");
        heading.className = "toast__title";
        heading.textContent = title;
        el.appendChild(heading);
    }
    const body = document.createElement("p");
    body.className = "toast__body";
    body.textContent = message;
    el.appendChild(body);
    toasts.appendChild(el);

    let removed = false;
    const remove = () => {
        if (removed) return; // guard against the auto-timer and a swipe both firing
        removed = true;
        clearTimeout(timer);
        el.classList.add("is-leaving");
        el.addEventListener("animationend", () => el.remove(), { once: true });
    };
    const timer = setTimeout(remove, type === "error" ? 6000 : 3000);
    makeSwipeable(el, remove);
}

// Parse with the active mode, surfacing errors as toasts. Returns a result
// object so callers can distinguish a parse failure from a parsed value.
// Async because the JSON5 codec may need to be fetched on first use.
async function parse() {
    const mode = currentMode();
    let codec;
    try {
        codec = await mode.load();
    } catch (error) {
        toast("Could not load the JSON5 library. Check your connection and try again.", {
            type: "error",
            title: "Library unavailable",
        });
        return { ok: false };
    }
    try {
        return { ok: true, value: codec.parse(rawJsonData()), codec };
    } catch (error) {
        toast(error.message, { type: "error", title: `Invalid ${mode.label}` });
        return { ok: false };
    }
}

// The "Example" button stays enabled on an empty editor — loading a sample is the
// one action that makes sense with no input yet.
const toggleButtons = actionButtons.filter((button) => button.dataset.action !== "example");

function refreshButtons() {
    const empty = rawJsonData().trim() === "";
    for (const button of toggleButtons) {
        button.disabled = empty;
    }
}

/* ------------------------------------------------------------------ actions */

async function prettyPrint() {
    const result = await parse();
    if (result.ok) {
        field.value = result.codec.stringify(result.value, INDENT);
    }
}

async function minify() {
    const result = await parse();
    if (result.ok) {
        field.value = result.codec.stringify(result.value, undefined);
    }
}

async function validate() {
    const mode = currentMode();
    const result = await parse();
    if (result.ok) {
        toast(`Your input is valid ${mode.label}.`, { type: "success", title: `Valid ${mode.label}` });
    }
}

async function copy() {
    const text = rawJsonData();
    try {
        await navigator.clipboard.writeText(text);
        toast("Copied to clipboard.", { type: "success" });
    } catch (error) {
        // Fallback for non-secure contexts / older browsers.
        field.select();
        const ok = document.execCommand("copy");
        field.setSelectionRange(0, 0);
        field.blur();
        toast(ok ? "Copied to clipboard." : "Could not copy to clipboard.", {
            type: ok ? "success" : "error",
        });
    }
}

function download() {
    const defaultName = `json-tools-${Math.round(Date.now() / 1000)}`;
    const input = window.prompt("File name", defaultName);
    if (input === null) return; // cancelled
    const name = (input.trim() || defaultName).replace(/\.json$/i, "");

    const blob = new Blob([rawJsonData()], { type: "application/json;charset=utf-8" });
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

function clear() {
    field.value = "";
    refreshButtons();
    field.focus();
}

function loadExample() {
    if (rawJsonData().trim() !== "" && !window.confirm("Replace the current contents with example data?")) {
        return; // keep the user's input
    }
    field.value = currentMode().label === "JSON5" ? EXAMPLE_JSON5 : EXAMPLE_JSON;
    refreshButtons();
    field.focus();
    toast("Loaded example data.", { type: "success" });
}

const handlers = { pretty: prettyPrint, minify, validate, copy, download, example: loadExample, clear };

/* ------------------------------------------------------------------ theming */

function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
}

function resolveInitialTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function toggleTheme() {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    haptic();
    // Spin/shrink the icon out, swap the mask, then let it spring back in.
    themeToggle.classList.add("is-toggling");
    applyTheme(next);
    localStorage.setItem(THEME_KEY, next);
    setTimeout(() => themeToggle.classList.remove("is-toggling"), 200);
}

/* ----------------------------------------------------------------- drag/drop */

function loadFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        field.value = reader.result;
        refreshButtons();
        toast(`Loaded ${file.name}`, { type: "success" });
    };
    reader.onerror = () => toast("Could not read that file.", { type: "error" });
    reader.readAsText(file);
}

function setupDropZone() {
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
    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        depth = 0;
        hide();
        loadFile(e.dataTransfer.files[0]);
    });
}

/* -------------------------------------------------------------------- wiring */

applyTheme(resolveInitialTheme());
refreshButtons();
setupDropZone();

themeToggle.addEventListener("click", toggleTheme);
field.addEventListener("input", refreshButtons);

// Follow the device theme live, but only while the user hasn't made a manual
// choice — a saved preference always wins.
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (!localStorage.getItem(THEME_KEY)) {
        applyTheme(e.matches ? "dark" : "light");
    }
});

for (const button of actionButtons) {
    button.addEventListener("click", () => {
        haptic(button.dataset.action === "clear" ? 12 : 8);
        const action = handlers[button.dataset.action];
        if (action) action();
    });
}

// A light tick when switching format mode, matching the sliding-pill motion.
for (const radio of document.querySelectorAll('input[name="mode"]')) {
    radio.addEventListener("change", () => haptic(6));
}
