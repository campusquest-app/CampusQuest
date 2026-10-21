"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  acquireModalLayer,
  guardModalTouchMove,
  isolateModalLayer,
  isTopModalLayer,
} from "@/lib/client/modalLayer";

/**
 * Top-level modal layer: portaled to document.body so `position: fixed` is never
 * trapped by transformed ancestors (the tab swipe shell uses `will-change: transform`),
 * stacked above the dock nav and composer, sized to the visual viewport.
 *
 * `placement="sheet"` (default): bottom sheet on phones, centered from `sm` up.
 * `placement="dialog"`: centered dialog on all breakpoints (Events filters, etc.).
 * Children supply the panel contents; use `.cq-modal-header`, `.cq-modal-body`,
 * `.cq-modal-footer` for layout.
 */
export function CqModalLayer({
  open,
  onDismiss,
  dismissible = true,
  labelledBy,
  panelClassName = "",
  placement = "sheet",
  panelAs = "div",
  onSubmit,
  children,
}: {
  open: boolean;
  onDismiss: () => void;
  /** False while saving — backdrop taps and Escape are ignored. */
  dismissible?: boolean;
  labelledBy: string;
  panelClassName?: string;
  /** sheet = bottom sheet on phones; dialog = centered on all sizes. */
  placement?: "sheet" | "dialog";
  /** Render the panel as a <form> so header/body/footer share one submit target. */
  panelAs?: "div" | "form";
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const [layerEl, setLayerEl] = useState<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const dismissRef = useRef(onDismiss);
  const dismissibleRef = useRef(dismissible);
  dismissRef.current = onDismiss;
  dismissibleRef.current = dismissible;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return undefined;
    const layer = acquireModalLayer();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !isTopModalLayer(layer.id)) return;
      if (!dismissibleRef.current) return;
      event.stopPropagation();
      dismissRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      layer.release();
    };
  }, [open]);

  useEffect(() => {
    if (!open || !layerEl) return undefined;
    const opener = document.activeElement as HTMLElement | null;
    const restoreInert = isolateModalLayer(layerEl);
    const releaseTouch = guardModalTouchMove(layerEl);
    // Focus the panel itself (not a field) so iOS does not raise the keyboard.
    if (!layerEl.contains(document.activeElement)) panelRef.current?.focus({ preventScroll: true });
    return () => {
      releaseTouch();
      restoreInert();
      if (opener?.isConnected && !opener.closest("[inert]")) opener.focus({ preventScroll: true });
    };
  }, [open, layerEl]);

  if (!open || !mounted) return null;

  const panelProps = {
    className: `cq-modal-panel ${placement === "dialog" ? "cq-modal-panel--dialog" : ""} ${panelClassName}`.trim(),
    tabIndex: -1,
    onClick: (event: React.MouseEvent) => event.stopPropagation(),
  };

  return createPortal(
    <div
      ref={setLayerEl}
      className={`cq-modal-layer${placement === "dialog" ? " cq-modal-layer--dialog" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      data-no-drawer-swipe="true"
      data-cq-gesture-block="all"
    >
      <div
        className="cq-modal-backdrop"
        aria-hidden
        onClick={() => {
          if (dismissibleRef.current) dismissRef.current();
        }}
      />
      {panelAs === "form" ? (
        <form
          {...panelProps}
          ref={(el) => {
            panelRef.current = el;
          }}
          onSubmit={onSubmit}
        >
          {children}
        </form>
      ) : (
        <div
          {...panelProps}
          ref={(el) => {
            panelRef.current = el;
          }}
        >
          {children}
        </div>
      )}
    </div>,
    document.body,
  );
}
