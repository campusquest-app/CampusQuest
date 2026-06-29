"use client";

import { useSyncExternalStore } from "react";

let drawerOpen = false;
const listeners = new Set<() => void>();

const NAV_KEYBOARD_KEYS = new Set(["ArrowLeft", "ArrowRight", "1", "2", "3", "4", "5"]);
let keydownGuardAttached = false;

function blockNavKeysWhileDrawerOpen(event: KeyboardEvent): void {
  if (!drawerOpen) return;
  if (event.key === "Escape") return;
  const modified = event.metaKey || event.ctrlKey || event.altKey;
  if (modified && NAV_KEYBOARD_KEYS.has(event.key)) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}

function syncKeydownGuard(open: boolean): void {
  if (typeof window === "undefined") return;
  if (open && !keydownGuardAttached) {
    window.addEventListener("keydown", blockNavKeysWhileDrawerOpen, true);
    keydownGuardAttached = true;
  } else if (!open && keydownGuardAttached) {
    window.removeEventListener("keydown", blockNavKeysWhileDrawerOpen, true);
    keydownGuardAttached = false;
  }
}

function emit(): void {
  listeners.forEach((listener) => listener());
}

function syncDomAttribute(open: boolean): void {
  if (typeof document === "undefined") return;
  if (open) {
    document.documentElement.setAttribute("data-cq-drawer-open", "");
  } else {
    document.documentElement.removeAttribute("data-cq-drawer-open");
  }
}

/** True while the side drawer is open or finishing its close animation. */
export function getIsDrawerOpen(): boolean {
  return drawerOpen;
}

export function setIsDrawerOpen(open: boolean): void {
  if (drawerOpen === open) return;
  drawerOpen = open;
  syncDomAttribute(open);
  syncKeydownGuard(open);
  emit();
}

export function subscribeIsDrawerOpen(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useIsDrawerOpen(): boolean {
  return useSyncExternalStore(subscribeIsDrawerOpen, getIsDrawerOpen, () => false);
}
