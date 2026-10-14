"use client";

import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { X } from "lucide-react";

const DISMISS_PX = 72;

export function RealmOverlaySheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dragRef = useRef<{ pointerId: number; startY: number; lastY: number; dragging: boolean } | null>(null);
  const sheetRef = useRef<HTMLElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const beginDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("button")) return;
    const body = bodyRef.current;
    if (body && body.scrollTop > 1 && event.target !== event.currentTarget) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      dragging: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dy = event.clientY - drag.startY;
    drag.lastY = event.clientY;
    const sheet = sheetRef.current;
    if (!sheet) return;
    if (dy > 8) drag.dragging = true;
    if (dy > 0) {
      sheet.style.transform = `translate3d(0, ${dy}px, 0)`;
    }
  };

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    const dy = drag.lastY - drag.startY;
    const sheet = sheetRef.current;
    if (sheet) sheet.style.transform = "";
    if (drag.dragging && dy >= DISMISS_PX) onClose();
  };

  return (
    <div className="cq-realm-overlay" role="presentation" data-no-drawer-swipe="true">
      <button type="button" className="cq-realm-overlay__backdrop" aria-label="Close" onClick={onClose} />
      <section
        ref={sheetRef}
        className="cq-realm-overlay-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-cq-gesture-block="all"
      >
        <header
          className="cq-realm-overlay-sheet__handle"
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <span className="cq-realm-overlay-sheet__grabber" aria-hidden />
          <h2 className="cq-realm-overlay-sheet__title">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            className="cq-realm-overlay-sheet__close"
            onClick={onClose}
            aria-label={`Close ${title}`}
          >
            <X className="h-4 w-4" strokeWidth={2.4} />
          </button>
        </header>
        <div ref={bodyRef} className="cq-realm-overlay-sheet__body" data-cq-scroll-root>
          {children}
        </div>
      </section>
    </div>
  );
}
