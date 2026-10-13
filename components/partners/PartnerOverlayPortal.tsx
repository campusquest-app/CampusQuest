"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renders full-screen partner overlays on document.body. The tab swipe shell uses `will-change: transform`,
 * which would otherwise trap `position: fixed` children inside the tab, under the app header.
 */
export function PartnerOverlayPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
