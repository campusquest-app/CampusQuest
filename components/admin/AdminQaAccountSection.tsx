"use client";

import { useState } from "react";
import { ApiRequestError, postAuthed } from "@/lib/client/dashboardApi";

type QaResetPayload = {
  email: string;
  userId: string;
  created: boolean;
  reset: boolean;
};

/**
 * Admin tool for the permanent QA sign-up test account. The account is never
 * deleted — resetting returns it to the first onboarding screen.
 */
export function AdminQaAccountSection() {
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleReset() {
    setResetting(true);
    setMessage(null);
    setError(null);
    try {
      const data = await postAuthed<QaResetPayload, Record<string, never>>(
        "/api/internal/admin/qa-account/reset",
        {},
      );
      setMessage(
        data.created
          ? `QA account ${data.email} created and ready at the first sign-up screen.`
          : `QA account ${data.email} reset — next sign-in starts at the first sign-up screen.`,
      );
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : err instanceof Error ? err.message : "Reset failed.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <section className="cq-admin-panel p-4 space-y-3">
      <div>
        <p className="font-semibold text-white">QA Onboarding Account</p>
        <p className="mt-1 text-xs text-white/55">
          Permanent hidden test account for the sign-up experience. Resetting restores it to a
          brand-new-user state (onboarding, avatar, profile, tutorial) without deleting it or
          changing its password. It never earns XP and never appears in leaderboards, search, or
          analytics.
        </p>
      </div>
      <button
        type="button"
        onClick={() => void handleReset()}
        disabled={resetting}
        className="rounded-xl bg-uri-keaney px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {resetting ? "Resetting…" : "Reset QA Onboarding"}
      </button>
      {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
      {error ? <p className="text-sm text-amber-300">{error}</p> : null}
    </section>
  );
}
