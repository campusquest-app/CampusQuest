"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiRequestError, fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import { AdminSectionIntro } from "@/components/admin/AdminUi";

type AuthQaStatus = {
  requireEmailVerification: boolean;
  supabase: {
    configured: boolean;
    urlHost: string | null;
    hasAnonKey: boolean;
    hasServiceRoleKey: boolean;
    missingEnvNames: string[];
  };
  emailProvider: {
    integration: string;
    smtpConfiguredInApp: boolean;
    note: string;
  };
  redirects: {
    siteUrl: string | null;
    emailRedirectUrl: string | null;
    callbackPath: string;
    configured: boolean;
    configError: string | null;
  };
  resend: {
    clientCooldownMs: number;
    serverLimitPerWindow: number;
    serverWindowMinutes: number;
  };
  signup: {
    pilotSchoolName: string;
    pilotDomain: string | null;
    approvedQaSignupEmails: string[];
  };
  onboardingQa: {
    email: string;
    mode: string;
    verificationCycle: string;
  };
};

type DiagnosticPayload = {
  email: string;
  summary: string;
  issues: string[];
  authUser: {
    id: string;
    emailConfirmed: boolean;
    emailConfirmedAt: string | null;
    lastSignInAt: string | null;
    createdAt: string | null;
    isBanned: boolean;
  } | null;
  profile: { id: string; role: string | null; onboardingCompleted: boolean | null } | null;
  stats: { userId: string; level: number; totalXp: number } | null;
};

type QaChecklist = {
  authenticated: boolean;
  verificationStateReset: boolean;
  codeGenerated: boolean;
  emailDispatched: boolean;
  codeSubmitted: boolean;
  codeValidated: boolean;
  verificationStored: boolean;
  onboardingContinued: boolean;
};

type QaCycleView = {
  campusEmailVerified: boolean;
  campusEmailVerifiedAt: string | null;
  authUserId: string;
  checklist: QaChecklist;
};

export function AdminAuthQaSection() {
  const [status, setStatus] = useState<AuthQaStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [lookupEmail, setLookupEmail] = useState("");
  const [actionEmail, setActionEmail] = useState("");
  const [diagnostic, setDiagnostic] = useState<DiagnosticPayload | null>(null);
  const [qaView, setQaView] = useState<QaCycleView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setStatusError(null);
    try {
      const data = await fetchAuthed<AuthQaStatus>("/api/internal/admin/auth-qa");
      setStatus(data);
    } catch (err) {
      setStatusError(err instanceof ApiRequestError ? err.message : "Could not load Auth QA status.");
    }
  }, []);

  async function loadQaView() {
    try {
      const data = await fetchAuthed<QaCycleView>("/api/auth/qa/verification-cycle");
      setQaView(data);
    } catch {
      setQaView(null);
    }
  }

  useEffect(() => {
    void loadStatus();
    void loadQaView();
  }, [loadStatus]);

  async function runDiagnostic() {
    setBusy("diagnostic");
    setError(null);
    setMessage(null);
    try {
      const email = lookupEmail.trim().toLowerCase();
      const data = await fetchAuthed<DiagnosticPayload>(
        `/api/internal/admin/auth-diagnostic?email=${encodeURIComponent(email)}`,
      );
      setDiagnostic(data);
      setMessage(data.summary);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Diagnostic failed.");
    } finally {
      setBusy(null);
    }
  }

  async function runEmailAction(action: "resend_confirmation" | "password_reset") {
    setBusy(action);
    setError(null);
    setMessage(null);
    try {
      const data = await postAuthed<
        { accepted: true; delivered: false; message: string },
        { action: typeof action; email: string }
      >("/api/internal/admin/auth-qa", {
        action,
        email: actionEmail.trim().toLowerCase(),
      });
      setMessage(data.message);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Request failed.");
    } finally {
      setBusy(null);
    }
  }

  async function startVerificationQaCycle() {
    setBusy("verification_qa_cycle");
    setError(null);
    setMessage(null);
    try {
      const data = await postAuthed<
        { emailSent: boolean; alreadySent: boolean; message: string },
        { forceNew: boolean }
      >("/api/auth/qa/verification-cycle", { forceNew: true });
      setMessage(data.message);
      await loadQaView();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not start verification QA cycle.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4">
      <AdminSectionIntro
        title="Authentication QA"
        description="Admin-only checks for the production Supabase + Resend email pipeline. This never unverifies or recreates your platform admin account."
      />

      {statusError ? <p className="text-sm text-amber-300">{statusError}</p> : null}

      {status ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="cq-admin-panel p-4 space-y-2">
            <p className="font-semibold text-white">Pipeline status</p>
            <p className="text-xs text-white/60">
              Email verification required: {status.requireEmailVerification ? "yes" : "no (currently off)"}
            </p>
            <p className="text-xs text-white/60">Supabase host: {status.supabase.urlHost ?? "not set"}</p>
            <p className="text-xs text-white/60">
              Anon key present: {status.supabase.hasAnonKey ? "yes" : "no"} · Service role present:{" "}
              {status.supabase.hasServiceRoleKey ? "yes" : "no"}
            </p>
            <p className="text-xs text-white/55">{status.emailProvider.integration}</p>
            <p className="text-xs text-white/40">{status.emailProvider.note}</p>
          </div>
          <div className="cq-admin-panel p-4 space-y-2">
            <p className="font-semibold text-white">Redirects & cooldowns</p>
            <p className="text-xs text-white/60 break-all">
              Site URL: {status.redirects.siteUrl ?? "(not configured)"}
            </p>
            <p className="text-xs text-white/60 break-all">
              Email redirect: {status.redirects.emailRedirectUrl ?? "(not configured)"}
            </p>
            {status.redirects.configError ? (
              <p className="text-xs text-amber-300">{status.redirects.configError}</p>
            ) : null}
            <p className="text-xs text-white/60">
              Resend cooldown: {Math.round(status.resend.clientCooldownMs / 1000)}s · server limit{" "}
              {status.resend.serverLimitPerWindow}/{status.resend.serverWindowMinutes}m
            </p>
            <p className="text-xs text-white/60">
              Signup domain: @{status.signup.pilotDomain} · QA signup exceptions:{" "}
              {status.signup.approvedQaSignupEmails.join(", ") || "none"}
            </p>
            <p className="text-xs text-white/60">
              Onboarding QA: {status.onboardingQa.email} — {status.onboardingQa.mode}
            </p>
            <p className="text-xs text-white/55">{status.onboardingQa.verificationCycle}</p>
          </div>
        </div>
      ) : null}

      <div className="cq-admin-panel p-4 space-y-3">
        <p className="font-semibold text-white">Email Verification QA</p>
        <p className="text-xs text-white/55">
          Signed in as the allowlisted QA account only. Resets CampusQuest campus-email
          verification (not the Supabase Auth user) and sends a real 6-digit code through Resend.
        </p>
        {qaView ? (
          <ul className="text-xs text-white/70 space-y-1 font-mono">
            <li>Authenticated {qaView.checklist.authenticated ? "✓" : "–"}</li>
            <li>Verification state reset {qaView.checklist.verificationStateReset ? "✓" : "–"}</li>
            <li>Code generated {qaView.checklist.codeGenerated ? "✓" : "–"}</li>
            <li>Email dispatched {qaView.checklist.emailDispatched ? "✓" : "–"}</li>
            <li>Code submitted {qaView.checklist.codeSubmitted ? "✓" : "–"}</li>
            <li>Code validated {qaView.checklist.codeValidated ? "✓" : "–"}</li>
            <li>Verification stored {qaView.checklist.verificationStored ? "✓" : "–"}</li>
            <li>Onboarding continued {qaView.checklist.onboardingContinued ? "✓" : "–"}</li>
            <li>Auth UUID unchanged {qaView.authUserId ? "✓" : "–"}</li>
          </ul>
        ) : (
          <p className="text-xs text-white/45">Sign in as the QA account to load this checklist.</p>
        )}
        <button
          type="button"
          onClick={() => void startVerificationQaCycle()}
          disabled={Boolean(busy)}
          className="rounded-xl bg-uri-keaney px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy === "verification_qa_cycle" ? "Sending test email..." : "Send test verification email"}
        </button>
      </div>

      <div className="cq-admin-panel p-4 space-y-3">
        <p className="font-semibold text-white">Account diagnostic</p>
        <p className="text-xs text-white/55">
          Looks up auth confirmation, profile, and stats. Does not change the account.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            value={lookupEmail}
            onChange={(e) => setLookupEmail(e.target.value)}
            placeholder="student@uri.edu"
            className="cq-auth-input flex-1"
          />
          <button
            type="button"
            onClick={() => void runDiagnostic()}
            disabled={Boolean(busy) || !lookupEmail.trim()}
            className="rounded-xl bg-uri-keaney px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy === "diagnostic" ? "Checking…" : "Run diagnostic"}
          </button>
        </div>
        {diagnostic?.authUser ? (
          <ul className="text-xs text-white/60 space-y-1">
            <li>UID: {diagnostic.authUser.id}</li>
            <li>Email confirmed: {diagnostic.authUser.emailConfirmed ? "yes" : "no"}</li>
            <li>Profile: {diagnostic.profile ? `${diagnostic.profile.id} (${diagnostic.profile.role ?? "none"})` : "missing"}</li>
            <li>
              Stats:{" "}
              {diagnostic.stats
                ? `level ${diagnostic.stats.level}, XP ${diagnostic.stats.totalXp}`
                : "missing"}
            </li>
            <li>Issues: {diagnostic.issues.length ? diagnostic.issues.join(", ") : "none"}</li>
          </ul>
        ) : null}
      </div>

      <div className="cq-admin-panel p-4 space-y-3">
        <p className="font-semibold text-white">Send a real auth email</p>
        <p className="text-xs text-white/55">
          Triggers the production Resend/Supabase path. Targets are limited to your admin email, approved QA
          accounts, or @uri.edu. Success means the request was accepted — not that the inbox received it.
        </p>
        <input
          type="email"
          value={actionEmail}
          onChange={(e) => setActionEmail(e.target.value)}
          placeholder="you@uri.edu"
          className="cq-auth-input"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void runEmailAction("resend_confirmation")}
            disabled={Boolean(busy) || !actionEmail.trim()}
            className="rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy === "resend_confirmation" ? "Sending…" : "Resend confirmation"}
          </button>
          <button
            type="button"
            onClick={() => void runEmailAction("password_reset")}
            disabled={Boolean(busy) || !actionEmail.trim()}
            className="rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy === "password_reset" ? "Sending…" : "Send password reset"}
          </button>
        </div>
      </div>

      {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
      {error ? <p className="text-sm text-amber-300">{error}</p> : null}

      <div className="cq-admin-panel p-4 space-y-2 text-xs text-white/50">
        <p className="font-semibold text-white/70">Manual checks this panel does not automate</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>Sign in as nicklockhart22@uri.edu, send a test 6-digit code, enter a wrong code, resend, then enter the newest code.</li>
          <li>Confirm Continue stays blocked until the code verifies and campus_email_verified_at is stored.</li>
          <li>Log out and back in — campus verification must remain saved. The Auth UUID must not change.</li>
        </ul>
      </div>
    </section>
  );
}
