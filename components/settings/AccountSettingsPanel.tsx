"use client";

import { useEffect, useState } from "react";
import { DrawerSubPanelShell } from "@/components/DrawerSubPanelShell";
import { fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import { supabaseClient } from "@/lib/supabase/client";
import type { MeProfileRow } from "@/lib/client/profileCharacter";
import type { CampusEmailVerificationStatus } from "@/lib/server/campusEmailVerification";

export function AccountSettingsPanel({ onBack }: { onBack: () => void }) {
  const [profile, setProfile] = useState<MeProfileRow | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<CampusEmailVerificationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [me, status, session] = await Promise.all([
          fetchAuthed<MeProfileRow>("/api/me/profile"),
          fetchAuthed<CampusEmailVerificationStatus>("/api/auth/email-verification/status"),
          supabaseClient.auth.getSession(),
        ]);
        if (cancelled) return;
        setProfile(me);
        setEmailStatus(status);
        setEmail(session.data.session?.user.email ?? null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load your account.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function sendPasswordReset() {
    if (!email || resetting) return;
    setResetting(true);
    setNotice(null);
    setError(null);
    try {
      await postAuthed("/api/auth/reset-password", { email });
      setNotice("Password reset email sent. Open it to choose a new password. Your campus email stays unverified until you confirm a code.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send a password reset email.");
    } finally {
      setResetting(false);
    }
  }

  const verified = emailStatus?.verified === true;

  return (
    <DrawerSubPanelShell title="Account" onBack={onBack} scrollStorageKey="settings-account">
      {loading ? <p className="py-8 text-center text-sm text-white/55">Loading your account…</p> : null}
      {error ? (
        <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100" role="alert">
          {error}
        </p>
      ) : null}
      {profile ? (
        <div className="space-y-3">
          <dl className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-white/40">Name</dt>
              <dd className="text-white/90">{profile.display_name || "Not set"}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-white/40">Username</dt>
              <dd className="text-white/90">@{profile.username}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-white/40">Sign-in email</dt>
              <dd className="text-white/90">{email ?? emailStatus?.emailMasked ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-white/40">Email verification</dt>
              <dd className={verified ? "text-cyan-200" : "text-amber-200"}>
                {verified ? "Verified" : "Not verified"}
              </dd>
            </div>
          </dl>
          <p className="text-[12px] leading-relaxed text-white/50">
            Name and photo are edited from Profile. Email verification cannot be skipped. A password reset email goes only to this sign-in address.
          </p>
          {notice ? <p className="text-sm text-cyan-200" role="status">{notice}</p> : null}
          <button
            type="button"
            disabled={!email || resetting}
            onClick={() => void sendPasswordReset()}
            className="w-full rounded-xl bg-cyan-400/90 px-3 py-3 text-sm font-semibold text-slate-950 disabled:opacity-40 touch-manipulation"
          >
            {resetting ? "Sending…" : "Email a password reset"}
          </button>
        </div>
      ) : null}
    </DrawerSubPanelShell>
  );
}
