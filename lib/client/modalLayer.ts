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

function syncVisualViewport(): void {
  const root = document.documentElement;
  const vv = window.visualViewport;
  const height = vv ? vv.height : window.innerHeight;
  const top = vv ? vv.offsetTop : 0;
  root.style.setProperty("--cq-modal-vv-h", `${Math.round(height)}px`);
  root.style.setProperty("--cq-modal-vv-top", `${Math.round(top)}px`);
  root.toggleAttribute(MODAL_KEYBOARD_ATTR, window.innerHeight - height > KEYBOARD_THRESHOLD_PX);
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
