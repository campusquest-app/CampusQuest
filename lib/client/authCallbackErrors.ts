export type AuthCallbackRecovery = {
  code: string;
  title: string;
  message: string;
  allowResend: boolean;
};

const RECOVERY: Record<string, AuthCallbackRecovery> = {
  otp_expired: {
    code: "otp_expired",
    title: "This verification link expired",
    message: "Request a new verification email and open the latest message.",
    allowResend: true,
  },
  access_denied: {
    code: "access_denied",
    title: "This verification link is no longer valid",
    message: "It may have expired or already been used. Request a new email to continue.",
    allowResend: true,
  },
  signup_disabled: {
    code: "signup_disabled",
    title: "Signups are temporarily unavailable",
    message: "Please try again later.",
    allowResend: false,
  },
};

export function parseAuthCallbackParams(source: {
  search?: string | null;
  hash?: string | null;
}): Record<string, string> {
  const out: Record<string, string> = {};
  const consume = (raw: string) => {
    const trimmed = raw.startsWith("?") || raw.startsWith("#") ? raw.slice(1) : raw;
    if (!trimmed) return;
    const params = new URLSearchParams(trimmed);
    params.forEach((value, key) => {
      if (value && !out[key]) out[key] = value;
    });
  };
  if (source.search) consume(source.search);
  if (source.hash) consume(source.hash);
  return out;
}

export function mapAuthCallbackError(params: Record<string, string>): AuthCallbackRecovery | null {
  const errorCode = (params.error_code || params.errorCode || "").toLowerCase();
  const error = (params.error || "").toLowerCase();
  const description = (params.error_description || params.errorDescription || "").toLowerCase();

  if (errorCode === "otp_expired" || description.includes("expired") || description.includes("otp_expired")) {
    return RECOVERY.otp_expired!;
  }
  if (error === "access_denied" || errorCode === "access_denied") {
    return RECOVERY.access_denied!;
  }
  if (errorCode === "signup_disabled") {
    return RECOVERY.signup_disabled!;
  }
  if (error || errorCode) {
    return {
      code: errorCode || error || "auth_callback_failed",
      title: "We couldn't finish email verification",
      message: "Request a new verification email, then open the latest link on this device.",
      allowResend: true,
    };
  }
  return null;
}

export function shouldOfferVerificationResend(recovery: AuthCallbackRecovery | null): boolean {
  return Boolean(recovery?.allowResend);
}
