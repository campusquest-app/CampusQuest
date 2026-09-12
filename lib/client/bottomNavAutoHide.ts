/**
 * Social/Quad-only bottom-nav hide/reveal.
 * Binary slide (not 1:1 Instagram conceal) with a directional threshold so
 * tiny jitter does not toggle the bar.
 */

export const BOTTOM_NAV_HIDE_THRESHOLD_PX = 12;
export const BOTTOM_NAV_TOP_REVEAL_Y = 48;
export const QUAD_SCROLL_ROOT_SELECTOR = "[data-cq-quad-scroll-root]";

export type BottomNavAutoHideState = {
  hidden: boolean;
  accumulated: number;
};

export function resolveBottomNavScrollRoot(
  doc: Document | null | undefined = typeof document === "undefined" ? null : document,
): Window | HTMLElement {
  const el = doc?.querySelector(QUAD_SCROLL_ROOT_SELECTOR);
  if (!el || !doc) return window;
  // DocumentElement/body mark window scrolling for the Social feed.
  if (isDocumentScrollMarker(el, doc)) return window;
  if (el instanceof HTMLElement) return el;
  return window;
}

/** True when the marked scroll root is the document itself (window scrolling). */
export function isDocumentScrollMarker(el: Element, doc: Document): boolean {
  return el === doc.documentElement || el === doc.body;
}

export function readScrollY(root: Window | HTMLElement): number {
  if (root instanceof HTMLElement) return root.scrollTop;
  return window.scrollY || document.documentElement.scrollTop || 0;
}

export function computeBottomNavAutoHide(input: {
  hidden: boolean;
  accumulated: number;
  delta: number;
  scrollY: number;
  threshold?: number;
  topRevealY?: number;
}): BottomNavAutoHideState {
  const threshold = input.threshold ?? BOTTOM_NAV_HIDE_THRESHOLD_PX;
  const topRevealY = input.topRevealY ?? BOTTOM_NAV_TOP_REVEAL_Y;

  if (input.scrollY <= topRevealY) {
    return { hidden: false, accumulated: 0 };
  }

  const sameDirection =
    (input.accumulated >= 0 && input.delta >= 0) || (input.accumulated <= 0 && input.delta <= 0);
  const accumulated = sameDirection ? input.accumulated + input.delta : input.delta;

  if (!input.hidden && accumulated >= threshold) {
    return { hidden: true, accumulated: 0 };
  }
  if (input.hidden && accumulated <= -threshold) {
    return { hidden: false, accumulated: 0 };
  }

  return { hidden: input.hidden, accumulated };
}
