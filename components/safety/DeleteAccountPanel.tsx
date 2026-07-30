"use client";

import { useState } from "react";
import { DrawerSubPanelShell } from "@/components/DrawerSubPanelShell";
import { deleteOwnAccountRequest } from "@/lib/client/safetyActionsClient";
import { ApiRequestError } from "@/lib/client/dashboardApi";
import { clearAccessToken } from "@/lib/client/apiSession";
import { invalidateMeSessionCache, resetMeSessionInflight } from "@/lib/client/meSessionCache";
import { signOutSupabaseSession } from "@/lib/client/supabaseSession";

export function DeleteAccountPanel({
  onBack,
  onDeleted,
}: {
  onBack: () => void;
  /** Called after successful deletion so the app can reset to signed-out state. */
  onDeleted: () => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmation.trim() === "DELETE" && !busy;

  async function handleDelete() {
    if (!canDelete) return;
    setBusy(true);
    setError(null);
    try {
      await deleteOwnAccountRequest();
      try {
        await signOutSupabaseSession();
      } catch {
        /* local cleanup continues */
      }
      clearAccessToken();
      invalidateMeSessionCache();
      resetMeSessionInflight();
      onDeleted();
    } catch (err) {
      const message =
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not delete your account.";
      setError(message);
      setBusy(false);
    }
  }

  return (
    <DrawerSubPanelShell title="Delete account" onBack={onBack}>
      <div className="space-y-4">
        <div className="rounded-2xl border border-rose-400/25 bg-rose-500/[0.08] p-4">
          <p className="text-sm font-semibold text-rose-100">This permanently deletes your CampusQuest account</p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-[12px] text-rose-100/70">
            <li>Your profile, posts, messages, and progress are removed</li>
            <li>This cannot be undone</li>
            <li>You can create a new account later with the same email</li>
          </ul>
        </div>

        <div>
          <label htmlFor="delete-account-confirm" className="text-xs font-medium text-white/50">
            Type <span className="font-mono text-white/80">DELETE</span> to confirm
          </label>
          <input
            id="delete-account-confirm"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white focus:border-rose-400/40 focus:outline-none"
            placeholder="DELETE"
          />
        </div>

        {error ? (
          <p className="text-sm text-rose-300" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          disabled={!canDelete}
          onClick={() => void handleDelete()}
          className="w-full rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Deleting…" : "Delete my account"}
        </button>

        <p className="text-[11px] text-white/40">
          Need help instead? Email{" "}
          <a className="text-cyan-300/90 underline" href="mailto:support@campusquest.app">
            support@campusquest.app
          </a>{" "}
          or visit{" "}
          <a className="text-cyan-300/90 underline" href="/support">
            Support
          </a>
          .
        </p>
      </div>
    </DrawerSubPanelShell>
  );
}
