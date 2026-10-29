"use client";

import { CAMPUS_EMAIL_USER_MESSAGES } from "@/lib/campusEmailVerification";

const DELIVERY_FAILURE_KEY = "cq_signup_verification_delivery_failed";

export type SignupVerificationDeliveryState = "sent" | "already_verified" | "send_failed";

/**
 * Account creation and email delivery are separate. A failed send must stay
 * on the signup screen with a resend action instead of a success banner.
 */
export function signupVerificationUi(state: SignupVerificationDeliveryState | null | undefined): {
  blockEntry: boolean;
  offerResend: boolean;
  errorMessage: string | null;
} {
  if (state === "send_failed") {
    return {
      blockEntry: true,
      offerResend: true,
      errorMessage: CAMPUS_EMAIL_USER_MESSAGES.sendFailed,
    };
  }
  return { blockEntry: false, offerResend: false, errorMessage: null };
}

export function rememberSignupVerificationDeliveryFailed(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(DELIVERY_FAILURE_KEY, "1");
}

export function clearSignupVerificationDeliveryFailure(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(DELIVERY_FAILURE_KEY);
}

export function takeSignupVerificationDeliveryError(): string | null {
  if (typeof window === "undefined") return null;
  const failed = window.sessionStorage.getItem(DELIVERY_FAILURE_KEY) === "1";
  window.sessionStorage.removeItem(DELIVERY_FAILURE_KEY);
  return failed ? CAMPUS_EMAIL_USER_MESSAGES.sendFailed : null;
}
