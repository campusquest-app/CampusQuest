"use client";

import { useEffect, useState } from "react";
import { DrawerSubPanelShell } from "@/components/DrawerSubPanelShell";
import { CampusEmailOtpInput } from "@/components/auth/CampusEmailOtpInput";
import { fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import type { CampusEmailVerificationStatus } from "@/lib/server/campusEmailVerification";

type SchoolPayload = {
  verified: boolean;
  schoolName: string | null;
  schoolDomain: string | null;
  requiredDomain: string | null;
  requiredSchoolName: string;
  verification: { status: "pending" | "verified"; verifiedAt: string | null };
};

export function CampusSchoolSettingsPanel({ onBack }: { onBack: () => void }) {
  const [school, setSchool] = useState<SchoolPayload | null>(null);
  const [email, setEmail] = useState<CampusEmailVerificationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [awaitingCode, setAwaitingCode] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [schoolBody, emailBody] = await Promise.all([
        fetchAuthed<SchoolPayload>("/api/me/school-verification"),
        fetchAuthed<CampusEmailVerificationStatus>("/api/auth/email-verification/status"),
      ]);
      setSchool(schoolBody);
      setEmail(emailBody);
      setAwaitingCode(emailBody.hasActiveChallenge && !emailBody.verified);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load campus access.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // Initial load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendCode() {
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      await postAuthed("/api/auth/email-verification/send", {});
      setAwaitingCode(true);
      setNotice("We sent a code to your campus email. Enter it here. This does not mark you verified.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send a verification code.");
    } finally {
      setSending(false);
    }
  }

  async function submitCode(next = code) {
    if (next.length !== 6 || verifying) return;
    setVerifying(true);
    setError(null);
    try {
      await postAuthed("/api/auth/email-verification/verify", { code: next });
      setNotice("Campus email verified.");
      setCode("");
      setAwaitingCode(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code was not accepted.");
    } finally {
      setVerifying(false);
    }
  }

  const access = school?.verified === true ? "Campus access is on." : "Campus access is locked until verification succeeds.";
  const stateLabel =
    school?.verification.status === "verified" && email?.verified
      ? "Verified"
      : "Pending";

  return (
    <DrawerSubPanelShell title="Campus / School" onBack={onBack} scrollStorageKey="settings-campus">
      {loading && !school ? <p className="py-8 text-center text-sm text-white/55">Loading campus access…</p> : null}
      {error ? (
        <p className="mb-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100" role="alert">
          {error}
        </p>
      ) : null}
      {school ? (
        <div className="space-y-3">
          <dl className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-white/40">School</dt>
              <dd className="text-white/90">{school.schoolName ?? school.requiredSchoolName}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-white/40">Campus email</dt>
              <dd className="text-white/90">{email?.emailMasked ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-white/40">Email domain</dt>
              <dd className="text-white/90">{school.schoolDomain ?? "Unknown"}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-white/40">Required domain</dt>
              <dd className="text-white/90">{school.requiredDomain ?? "Not configured"}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-white/40">Status</dt>
              <dd className={stateLabel === "Verified" ? "text-cyan-200" : "text-amber-200"}>{stateLabel}</dd>
            </div>
          </dl>
          <p className="text-[12px] leading-relaxed text-white/55">
            {stateLabel === "Verified"
              ? "Your campus email is verified. "
              : "Pending means the school email has not been confirmed yet. A rejected or incorrect code leaves the account unverified. "}
            {access} You cannot mark yourself verified.
          </p>
          {notice ? <p className="text-sm text-cyan-200" role="status">{notice}</p> : null}
          <button
            type="button"
            disabled={sending}
            onClick={() => void sendCode()}
            className="w-full rounded-xl bg-cyan-400/90 px-3 py-3 text-sm font-semibold text-slate-950 disabled:opacity-40 touch-manipulation"
          >
            {sending ? "Sending…" : email?.verified ? "Send a new verification code" : "Verify campus email"}
          </button>
          {awaitingCode ? (
            <div className="space-y-2">
              <p className="text-xs text-white/50">Enter the 6-digit code from your campus email.</p>
              <CampusEmailOtpInput
                value={code}
                disabled={verifying}
                onChange={setCode}
                onComplete={(next) => void submitCode(next)}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </DrawerSubPanelShell>
  );
}
