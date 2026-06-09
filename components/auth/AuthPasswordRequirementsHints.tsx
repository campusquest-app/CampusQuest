"use client";

import { checkPasswordRequirements, PASSWORD_REQUIREMENT_RULES } from "@/lib/passwordRequirements";

export function AuthPasswordRequirementsHints({ password }: { password: string }) {
  const checks = checkPasswordRequirements(password);
  const show = password.length > 0;

  if (!show) return null;

  return (
    <ul className="cq-auth-password-hints mt-2 space-y-1" aria-live="polite">
      <li className={`cq-auth-password-hint ${checks.minLength ? "cq-auth-password-hint--met" : ""}`}>
        <span className="cq-auth-password-hint-icon" aria-hidden>
          {checks.minLength ? "✓" : "○"}
        </span>
        At least 8 characters
      </li>
      {PASSWORD_REQUIREMENT_RULES.map((rule) => {
        const met = checks[rule.key];
        return (
          <li key={rule.key} className={`cq-auth-password-hint ${met ? "cq-auth-password-hint--met" : ""}`}>
            <span className="cq-auth-password-hint-icon" aria-hidden>
              {met ? "✓" : "○"}
            </span>
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}
