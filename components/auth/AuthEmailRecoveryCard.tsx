"use client";

import { AUTH_EMAIL_USER_MESSAGES } from "@/lib/authEmailDelivery";
import type { AuthCallbackRecovery } from "@/lib/client/authCallbackErrors";

export function AuthEmailRecoveryCard({
  recovery,
  email,
  onEmailChange,
  onResend,
  resendLabel,
  resendDisabled,
  notice,
}: {
  recovery: AuthCallbackRecovery;
  email: string;
  onEmailChange: (value: string) => void;
  onResend: () => void;
  resendLabel: string;
  resendDisabled: boolean;
  notice: string | null;
}) {
  return (
    <div className="cq-auth-form-panel space-y-4">
      <h2 className="font-display text-xl font-bold text-white">{recovery.title}</h2>
      <p className="text-sm text-white/70">{recovery.message}</p>
      {recovery.allowResend ? (
        <>
          <label htmlFor="auth-recovery-email" className="cq-auth-label">
            URI email
          </label>
          <input
            id="auth-recovery-email"
            type="email"
            autoComplete="username email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="you@uri.edu"
            className="cq-auth-input"
          />
          <button
            type="button"
            onClick={onResend}
            disabled={resendDisabled}
            className="cq-auth-btn-primary w-full"
          >
            {resendLabel}
          </button>
        </>
      ) : null}
      {notice ? <p className="cq-auth-notice">{notice}</p> : null}
      {!recovery.allowResend ? (
        <p className="text-xs text-white/45">{AUTH_EMAIL_USER_MESSAGES.generic}</p>
      ) : null}
    </div>
  );
}
