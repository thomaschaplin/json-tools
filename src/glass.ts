import { haptic } from "./toast";

// Liquid Glass pointer interactions: a specular highlight that tracks the cursor
// across glass surfaces, plus a press ripple on the action buttons. This is pure
// flourish, so it only runs for fine pointers (mouse/trackpad) when the user
// hasn't asked to reduce motion — touch devices and reduced-motion users keep the
// CSS defaults, where --pointer stays 0 and no sheen or ripple ever appears.

const SHEEN_SELECTOR = "[data-glass]";
const RIPPLE_SELECTOR = ".button, .icon-button";

function setPointer(el: HTMLElement, x: number, y: number): void {
  const rect = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${((x - rect.left) / rect.width) * 100}%`);
  el.style.setProperty("--my", `${((y - rect.top) / rect.height) * 100}%`);
  el.style.setProperty("--pointer", "1");
}

function clearPointer(el: HTMLElement): void {
  el.style.setProperty("--pointer", "0");
}

function spawnRipple(el: HTMLElement, x: number, y: number): void {
  const rect = el.getBoundingClientRect();
  const ripple = document.createElement("span");
  ripple.className = "glass-ripple";
  ripple.style.setProperty("--rx", `${x - rect.left}px`);
  ripple.style.setProperty("--ry", `${y - rect.top}px`);
  ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
  el.appendChild(ripple);
}

export function setupGlass(): void {
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!finePointer || reduceMotion) return;

  let active: HTMLElement | null = null;

  // One delegated listener drives the sheen on whichever glass surface the
  // pointer is currently over, including toasts that mount after load.
  document.addEventListener(
    "pointermove",
    (e) => {
      const surface = (e.target as Element | null)?.closest<HTMLElement>(SHEEN_SELECTOR) ?? null;
      if (surface !== active) {
        if (active) clearPointer(active);
        active = surface;
      }
      if (surface) setPointer(surface, e.clientX, e.clientY);
    },
    { passive: true },
  );

  // Reset the highlight when the pointer leaves the window entirely.
  document.addEventListener("pointerleave", () => {
    if (active) {
      clearPointer(active);
      active = null;
    }
  });

  document.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button !== 0) return;
      const target = (e.target as Element | null)?.closest<HTMLElement>(RIPPLE_SELECTOR);
      if (!target || (target as HTMLButtonElement).disabled) return;
      haptic(5);
      spawnRipple(target, e.clientX, e.clientY);
    },
    { passive: true },
  );
}
