/** sessionStorage draft so legal-document navigation can return to intact signup fields. */

export const AUTH_SIGNUP_DRAFT_KEY = "cq_auth_signup_draft";

export type AuthSignupDraft = {
  mode: "signin" | "signup";
  email: string;
  username: string;
  password: string;
  acceptedTerms: boolean;
};

const EMPTY: AuthSignupDraft = {
  mode: "signup",
  email: "",
  username: "",
  password: "",
  acceptedTerms: false,
};

function isDraft(value: unknown): value is AuthSignupDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as AuthSignupDraft;
  return (
    (draft.mode === "signin" || draft.mode === "signup") &&
    typeof draft.email === "string" &&
    typeof draft.username === "string" &&
    typeof draft.password === "string" &&
    typeof draft.acceptedTerms === "boolean"
  );
}

export function readAuthSignupDraft(): AuthSignupDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(AUTH_SIGNUP_DRAFT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeAuthSignupDraft(draft: AuthSignupDraft): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(AUTH_SIGNUP_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Ignore quota / private-mode failures; signup still works without persistence.
  }
}

export function clearAuthSignupDraft(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(AUTH_SIGNUP_DRAFT_KEY);
  } catch {
    // ignore
  }
}

export function emptyAuthSignupDraft(): AuthSignupDraft {
  return { ...EMPTY };
}
