"use client";

const CREATE_POST_MODAL_ATTR = "data-cq-create-post-open";

type BodyScrollSnapshot = {
  htmlOverflow: string;
  bodyOverflow: string;
};

let bodyScrollSnapshot: BodyScrollSnapshot | null = null;

/** Blur focused inputs so mobile Safari can exit input-zoom mode. */
export function releaseFocusedElement(): void {
  if (typeof document === "undefined") return;
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }
}

/** Lock page scroll while a full-screen modal is open. */
export function lockBodyScrollForModal(): void {
  if (typeof document === "undefined" || bodyScrollSnapshot) return;
  const html = document.documentElement;
  const body = document.body;
  bodyScrollSnapshot = {
    htmlOverflow: html.style.overflow,
    bodyOverflow: body.style.overflow,
  };
  html.style.overflow = "hidden";
  body.style.overflow = "hidden";
}

/** Restore page scroll after modal closes. */
export function restoreBodyScrollLock(): void {
  if (typeof document === "undefined" || !bodyScrollSnapshot) return;
  const html = document.documentElement;
  const body = document.body;
  html.style.overflow = bodyScrollSnapshot.htmlOverflow;
  body.style.overflow = bodyScrollSnapshot.bodyOverflow;
  bodyScrollSnapshot = null;
}

export function markCreatePostModalOpen(open: boolean): void {
  if (typeof document === "undefined") return;
  if (open) {
    document.documentElement.setAttribute(CREATE_POST_MODAL_ATTR, "true");
    return;
  }
  document.documentElement.removeAttribute(CREATE_POST_MODAL_ATTR);
}

export function isCreatePostModalOpen(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.hasAttribute(CREATE_POST_MODAL_ATTR);
}

/** Blur inputs and restore body overflow after modal dismiss. */
export function releaseModalViewportState(): void {
  releaseFocusedElement();
  restoreBodyScrollLock();
  markCreatePostModalOpen(false);
}

/**
 * Reset iOS Safari input-zoom and stale scroll locks after auth or major route transitions.
 * Call before unmounting auth UI and again when the authenticated shell mounts.
 */
export function resetMobileViewportScale(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  releaseModalViewportState();
  try {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  } catch {
    // best effort
  }
}
