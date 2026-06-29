"use client";

import { useEffect, useSyncExternalStore } from "react";

let immersiveDepth = 0;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

/** Register a nested full-screen surface (DM thread, share sheet, scanner, etc.). */
export function registerImmersiveScreen(): () => void {
  immersiveDepth += 1;
  emit();
  return () => {
    immersiveDepth = Math.max(0, immersiveDepth - 1);
    emit();
  };
}

export function getImmersiveScreenDepth(): number {
  return immersiveDepth;
}

export function subscribeImmersiveScreens(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True when any nested immersive overlay is mounted. */
export function useImmersiveScreenDepth(): number {
  return useSyncExternalStore(subscribeImmersiveScreens, getImmersiveScreenDepth, () => 0);
}

/** Call from full-screen overlays that should hide the bottom navigation. */
export function useRegisterImmersiveScreen(active = true): void {
  useEffect(() => {
    if (!active) return undefined;
    return registerImmersiveScreen();
  }, [active]);
}
