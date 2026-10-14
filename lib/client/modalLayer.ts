"use client";

/**
 * Shared state for app-level modal layers (Edit Post, Add Tags, …).
 *
 * - Ref-counted so nested modals share one background scroll lock and one
 *   `html[data-cq-modal-open]` flag (which hides the dock nav via CSS).
 * - A stack so Escape only dismisses the top-most layer.
 * - Mirrors `window.visualViewport` into CSS vars so sheets stay inside the
 *   visible area when the iOS keyboard opens.
 */

export const MODAL_OPEN_ATTR = "data-cq-modal-open";
export const MODAL_KEYBOARD_ATTR = "data-cq-modal-keyboard";

/** Visual-viewport shrink beyond this is treated as an on-screen keyboard. */
const KEYBOARD_THRESHOLD_PX = 120;

type ScrollSnapshot = {
  htmlOverflow: string;
  bodyOverflow: string;
  scrollX: number;
  scrollY: number;
};

let openCount = 0;
let snapshot: ScrollSnapshot | null = null;
const stack: symbol[] = [];
let detachViewport: (() => void) | null = null;

export function getOpenModalLayerCount(): number {
  return openCount;
}

export function isTopModalLayer(id: symbol): boolean {
  return stack.length > 0 && stack[stack.length - 1] === id;
}

/** Gap kept between a revealed field and the edge of the scrolling modal body. */
const REVEAL_MARGIN_PX = 12;

/**
 * iOS scrolls the focused field into view before the sheet shrinks to the
 * keyboard-reduced viewport, which can leave it behind the pinned footer.
 * Adjusts only the modal body's own scrollTop — never the page.
 */
export function revealFocusedModalField(): void {
  const active = document.activeElement as HTMLElement | null;
  const body = active?.closest?.(".cq-modal-body") as HTMLElement | null;
  if (!active || !body) return;
  const field = active.getBoundingClientRect();
  const box = body.getBoundingClientRect();
  if (field.bottom > box.bottom - REVEAL_MARGIN_PX) {
    body.scrollTop += field.bottom - box.bottom + REVEAL_MARGIN_PX;
  } else if (field.top < box.top + REVEAL_MARGIN_PX) {
    body.scrollTop -= box.top + REVEAL_MARGIN_PX - field.top;
  }
}

function syncVisualViewport(): void {
  const root = document.documentElement;
  const vv = window.visualViewport;
  const height = vv ? vv.height : window.innerHeight;
  const top = vv ? vv.offsetTop : 0;
  root.style.setProperty("--cq-modal-vv-h", `${Math.round(height)}px`);
  root.style.setProperty("--cq-modal-vv-top", `${Math.round(top)}px`);
  const keyboardOpen = window.innerHeight - height > KEYBOARD_THRESHOLD_PX;
  root.toggleAttribute(MODAL_KEYBOARD_ATTR, keyboardOpen);
  if (keyboardOpen) window.requestAnimationFrame?.(revealFocusedModalField);
}

/**
 * Makes everything outside `layer` inert (no taps, Tab focus, or VoiceOver) while
 * it is open. Nested layers stack: the lower modal becomes inert under the upper
 * one. Returns a restore function that only clears what this call set.
 */
export function isolateModalLayer(layer: Element): () => void {
  const changed: HTMLElement[] = [];
  for (const child of Array.from(document.body.children) as HTMLElement[]) {
    if (child === layer || child.inert) continue;
    child.inert = true;
    changed.push(child);
  }
  return () => {
    for (const el of changed) el.inert = false;
  };
}

type TouchStyle = { overflowX: string; overflowY: string };

/**
 * Whether a touchmove from `target` may proceed: only when some element between
 * it and the layer can still scroll in the drag direction. Everything else is
 * cancelled so drags on the header, footer, or backdrop never scroll or
 * rubber-band the page behind (iOS Safari / standalone PWA ignore overflow lock there).
 */
export function canModalTouchScroll(
  target: Element | null,
  layer: Element,
  dx: number,
  dy: number,
  styleOf: (el: Element) => TouchStyle = (el) => getComputedStyle(el),
): boolean {
  const vertical = Math.abs(dy) >= Math.abs(dx);
  for (let node = target; node && node !== layer; node = node.parentElement) {
    if (node.tagName === "INPUT") return true;
    const el = node as HTMLElement;
    const style = styleOf(el);
    if (vertical && /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1) {
      if (dy > 0 && el.scrollTop > 0) return true;
      if (dy < 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true;
    }
    if (!vertical && /(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth + 1) {
      if (dx > 0 && el.scrollLeft > 0) return true;
      if (dx < 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1) return true;
    }
  }
  return false;
}

/** Attaches the non-passive touch guard described in `canModalTouchScroll`. */
export function guardModalTouchMove(layer: HTMLElement): () => void {
  let startX = 0;
  let startY = 0;
  const onStart = (event: TouchEvent) => {
    startX = event.touches[0]?.clientX ?? 0;
    startY = event.touches[0]?.clientY ?? 0;
  };
  const onMove = (event: TouchEvent) => {
    if (event.touches.length !== 1 || !event.cancelable) return;
    const touch = event.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (!canModalTouchScroll(event.target as Element, layer, dx, dy)) event.preventDefault();
  };
  layer.addEventListener("touchstart", onStart, { passive: true });
  layer.addEventListener("touchmove", onMove, { passive: false });
  return () => {
    layer.removeEventListener("touchstart", onStart);
    layer.removeEventListener("touchmove", onMove);
  };
}

function attachVisualViewport(): () => void {
  const vv = window.visualViewport;
  syncVisualViewport();
  vv?.addEventListener("resize", syncVisualViewport);
  vv?.addEventListener("scroll", syncVisualViewport);
  window.addEventListener("resize", syncVisualViewport);
  return () => {
    vv?.removeEventListener("resize", syncVisualViewport);
    vv?.removeEventListener("scroll", syncVisualViewport);
    window.removeEventListener("resize", syncVisualViewport);
    const root = document.documentElement;
    root.style.removeProperty("--cq-modal-vv-h");
    root.style.removeProperty("--cq-modal-vv-top");
    root.removeAttribute(MODAL_KEYBOARD_ATTR);
  };
}

/** Register an open modal layer. Returns the release function (idempotent). */
export function acquireModalLayer(): { id: symbol; release: () => void } {
  const id = Symbol("cq-modal-layer");
  if (typeof document === "undefined") return { id, release: () => {} };

  const html = document.documentElement;
  const body = document.body;
  if (openCount === 0) {
    snapshot = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.setAttribute(MODAL_OPEN_ATTR, "true");
    detachViewport = attachVisualViewport();
  }
  openCount += 1;
  stack.push(id);

  let released = false;
  return {
    id,
    release: () => {
      if (released) return;
      released = true;
      const index = stack.lastIndexOf(id);
      if (index >= 0) stack.splice(index, 1);
      openCount = Math.max(0, openCount - 1);
      if (openCount > 0) return;

      detachViewport?.();
      detachViewport = null;
      html.removeAttribute(MODAL_OPEN_ATTR);
      if (snapshot) {
        html.style.overflow = snapshot.htmlOverflow;
        body.style.overflow = snapshot.bodyOverflow;
        // iOS can drift the document scroll while overflow is locked; put the feed back.
        if (window.scrollX !== snapshot.scrollX || window.scrollY !== snapshot.scrollY) {
          window.scrollTo(snapshot.scrollX, snapshot.scrollY);
        }
        snapshot = null;
      }
    },
  };
}
