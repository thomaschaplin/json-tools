import { haptic } from "./toast";

export type Theme = "light" | "dark";

const THEME_KEY = "json-tools-theme";

type ThemeListener = (theme: Theme) => void;
const listeners = new Set<ThemeListener>();

// Subscribe to theme changes (e.g. so the editor can swap its colour scheme in
// lockstep with the rest of the UI).
export function onThemeChange(fn: ThemeListener): void {
  listeners.add(fn);
}

function notify(theme: Theme): void {
  for (const fn of listeners) fn(theme);
}

export function currentTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
}

function resolveInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function setupTheme(themeToggle: HTMLElement): void {
  // The inline <head> script already set data-theme before first paint; re-apply
  // here for the JS-driven path and to keep everything in sync.
  applyTheme(resolveInitialTheme());

  themeToggle.addEventListener("click", () => {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    haptic();
    // Spin/shrink the icon out, swap the mask, then let it spring back in.
    themeToggle.classList.add("is-toggling");
    applyTheme(next);
    localStorage.setItem(THEME_KEY, next);
    notify(next);
    setTimeout(() => themeToggle.classList.remove("is-toggling"), 200);
  });

  // Follow the device theme live, but only while the user hasn't made a manual
  // choice — a saved preference always wins.
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", (e) => {
      if (!localStorage.getItem(THEME_KEY)) {
        const next: Theme = e.matches ? "dark" : "light";
        applyTheme(next);
        notify(next);
      }
    });
}
