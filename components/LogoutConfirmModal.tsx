"use client";

import { createPortal } from "react-dom";

export function LogoutConfirmModal({
  open,
  isSigningOut,
  error,
  title = "Sign out?",
  description = "You can sign back in anytime. Your progress is saved to your account.",
  onCancel,
  onConfirm,
}: {
  open: boolean;
  isSigningOut: boolean;
  error?: string | null;
  title?: string;
  description?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <button
        type="button"
        className="cq-confirm-modal-backdrop"
        aria-label="Dismiss sign out dialog"
        disabled={isSigningOut}
        onClick={() => {
          if (!isSigningOut) onCancel();
        }}
      />
      <div className="cq-confirm-modal-card" role="dialog" aria-modal="true" aria-labelledby="cq-logout-confirm-title">
        <h3 id="cq-logout-confirm-title" className="font-display text-lg font-bold text-white">
          {title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-white/55">{description}</p>
        {error ? (
          <p className="mt-3 text-xs text-amber-200 bg-amber-500/15 border border-amber-400/30 rounded-lg px-3 py-2">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={isSigningOut}
            onClick={onCancel}
            className="flex-1 rounded-xl border border-white/[0.12] py-2.5 text-sm font-medium text-white/75 hover:bg-white/[0.06] disabled:opacity-45 disabled:pointer-events-none"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSigningOut}
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-rose-500/90 py-2.5 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-55 disabled:pointer-events-none"
          >
            {isSigningOut ? "Signing out…" : "Sign Out"}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
