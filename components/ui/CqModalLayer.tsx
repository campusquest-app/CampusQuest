"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { acquireModalLayer, isTopModalLayer } from "@/lib/client/modalLayer";

/**
 * Top-level modal layer: portaled to document.body so `position: fixed` is never
 * trapped by transformed ancestors (the tab swipe shell uses `will-change: transform`),
 * stacked above the dock nav and composer, sized to the visual viewport.
 *
 * Bottom sheet on phones, centered dialog from `sm` up. Children supply the panel
 * contents; use `.cq-modal-header`, `.cq-modal-body`, `.cq-modal-footer` for layout.
 */
export function CqModalLayer({
  open,
  onDismiss,
  dismissible = true,
  labelledBy,
  panelClassName = "",
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
  /** Render the panel as a <form> so header/body/footer share one submit target. */
  panelAs?: "div" | "form";
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
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

  if (!open || !mounted) return null;

  const panelProps = {
    className: `cq-modal-panel ${panelClassName}`.trim(),
    onClick: (event: React.MouseEvent) => event.stopPropagation(),
  };

  return createPortal(
    <div
      className="cq-modal-layer"
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
        <form {...panelProps} onSubmit={onSubmit}>
          {children}
        </form>
      ) : (
        <div {...panelProps}>{children}</div>
      )}
    </div>,
    document.body,
  );
}
