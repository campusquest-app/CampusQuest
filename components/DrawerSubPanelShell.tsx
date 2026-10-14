"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";

const scrollMemory = new Map<string, number>();

export function DrawerSubPanelShell({
  title,
  onBack,
  children,
  scrollStorageKey,
}: {
  title: string;
  onBack: () => void;
  children: ReactNode;
  /** Restores this panel's scroll position when the user comes back. */
  scrollStorageKey?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node || !scrollStorageKey) return;
    node.scrollTop = scrollMemory.get(scrollStorageKey) ?? 0;
    const onScroll = () => scrollMemory.set(scrollStorageKey, node.scrollTop);
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => node.removeEventListener("scroll", onScroll);
  }, [scrollStorageKey]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-white/[0.08] px-2 py-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-white/70 transition hover:bg-white/[0.06] hover:text-white active:scale-95 touch-manipulation"
          aria-label="Go back"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2.2} />
        </button>
        <h2 className="font-display text-base font-bold tracking-tight text-white">{title}</h2>
      </header>
      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-3">{children}</div>
    </div>
  );
}
