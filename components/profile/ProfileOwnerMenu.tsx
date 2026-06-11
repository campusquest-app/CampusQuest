"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export function ProfileOwnerMenu({
  open,
  onClose,
  onEditIdentity,
  onEditBio,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  onEditIdentity: () => void;
  onEditBio: () => void;
  onLogout?: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[110]" role="presentation">
      <button type="button" className="absolute inset-0 bg-black/20" onClick={onClose} aria-label="Close menu" />
      <div
        ref={panelRef}
        className="absolute right-3 top-[max(3.5rem,env(safe-area-inset-top,0px))] w-52 overflow-hidden rounded-xl border border-cq-border bg-cq-card shadow-xl sm:right-5"
        role="menu"
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            onEditIdentity();
          }}
          className="block w-full px-4 py-3 text-left text-sm font-medium text-cq-foreground hover:bg-cq-elevated"
        >
          Edit name & username
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            onEditBio();
          }}
          className="block w-full border-t border-cq-border px-4 py-3 text-left text-sm font-medium text-cq-foreground hover:bg-cq-elevated"
        >
          Edit bio
        </button>
        {onLogout ? (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="block w-full border-t border-cq-border px-4 py-3 text-left text-sm font-medium text-red-300 hover:bg-red-500/10"
          >
            Log out
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
