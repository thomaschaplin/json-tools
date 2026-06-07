// Resolve a required element by id, throwing early (instead of silently failing
// later) if the DOM doesn't contain it. Keeps the rest of the app null-safe.
export function requireEl<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing required element #${id}`);
  return el as T;
}

const toasts = requireEl("toasts");

// A subtle vibration on interaction. Progressive enhancement — supported on
// Android/Chrome and silently ignored where the Vibration API is unavailable
// (notably iOS Safari), so calling it is always safe.
export function haptic(ms = 8): void {
  navigator.vibrate?.(ms);
}

// Let an element be flicked away with a vertical swipe, iOS banner style. The
// finger is tracked upward 1:1 (the dismiss direction) and damped downward, with
// opacity fading as it travels. Past a small threshold the swipe commits and
// `dismiss` is called; otherwise it springs back to rest.
function makeSwipeable(el: HTMLElement, dismiss: () => void): void {
  let startY = 0;
  let dy = 0;
  let dragging = false;

  el.addEventListener("pointerdown", (e: PointerEvent) => {
    dragging = true;
    startY = e.clientY;
    dy = 0;
    el.setPointerCapture(e.pointerId);
    el.style.transition = "none";
  });

  el.addEventListener("pointermove", (e: PointerEvent) => {
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

export type ToastType = "info" | "success" | "error";

export function toast(
  message: string,
  { type = "info", title }: { type?: ToastType; title?: string } = {},
): void {
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  // Opt into the Liquid Glass surface treatment (specular rim + pointer sheen).
  el.dataset.glass = "";
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
