"use client";

import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE = "input, textarea, select, button";

/**
 * Sizes the login surface to the visible viewport and scrolls the focused
 * field into view when the iOS keyboard covers it. The shell scrolls; the
 * page behind it does not jump.
 */
export function AuthScrollShell({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;

    const sync = () => {
      const viewport = window.visualViewport;
      const height = viewport?.height ?? window.innerHeight;
      const top = viewport?.offsetTop ?? 0;
      root.style.setProperty("--cq-auth-viewport", `${Math.round(height)}px`);
      root.style.setProperty("--cq-auth-viewport-top", `${Math.round(top)}px`);
    };

    const reveal = (target: HTMLElement) => {
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop ?? 0;
      const height = viewport?.height ?? window.innerHeight;
      const rect = target.getBoundingClientRect();
      const margin = 16;
      if (rect.bottom > top + height - margin || rect.top < top + margin) {
        target.scrollIntoView({ block: "center", inline: "nearest" });
      }
    };

    const onFocus = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.matches(FOCUSABLE)) return;
      window.setTimeout(() => reveal(target), 280);
    };

    sync();
    window.visualViewport?.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    root.addEventListener("focusin", onFocus);
    return () => {
      window.visualViewport?.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      root.removeEventListener("focusin", onFocus);
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
