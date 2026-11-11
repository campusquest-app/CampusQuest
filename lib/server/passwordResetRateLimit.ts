import { createHmac } from "crypto";
import { AUTH_EMAIL_USER_MESSAGES } from "@/lib/authEmailDelivery";
import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";

export const PASSWORD_RESET_EMAIL_LIMIT = 3;
export const PASSWORD_RESET_IP_LIMIT = 8;
export const PASSWORD_RESET_WINDOW_SECONDS = 15 * 60;

export type PasswordResetRateConsume = (
  bucket: string,
  limit: number,
  windowSeconds: number,
) => Promise<boolean>;

function rateLimitSecret(env: Record<string, string | undefined>): string {
  const secret = (env.EMAIL_VERIFICATION_SECRET ?? "").trim();
  if (!secret) {
    throw new ApiError(503, AUTH_EMAIL_USER_MESSAGES.generic, "RATE_LIMIT_UNAVAILABLE");
  }
  return secret;
}

/** HMAC bucket. The stored key cannot be turned back into an email or IP. */
export function passwordResetRateBucket(
  kind: "email" | "ip",
  value: string,
  secret: string,
): string {
  const normalized = kind === "email" ? value.trim().toLowerCase() : value.trim();
  return createHmac("sha256", secret)
    .update(`password-reset:${kind}:${normalized}`)
    .digest("hex");
}

async function consumePasswordResetBucket(
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("consume_password_reset_rate_limit", {
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error || typeof data !== "boolean") {
    throw new Error("password_reset_rate_limit_unavailable");
  }
  return data;
}

/**
 * Shared email and IP limits for password reset.
 * A limiter or database failure denies the request before any mail is sent.
 */
export async function enforcePasswordResetRateLimits(args: {
  email: string;
  ip: string;
  env?: Record<string, string | undefined>;
  consume?: PasswordResetRateConsume;
}): Promise<void> {
  const secret = rateLimitSecret(args.env ?? process.env);
  const consume = args.consume ?? consumePasswordResetBucket;
  const emailBucket = passwordResetRateBucket("email", args.email, secret);
  const ipBucket = passwordResetRateBucket("ip", args.ip, secret);

  try {
    const emailAllowed = await consume(emailBucket, PASSWORD_RESET_EMAIL_LIMIT, PASSWORD_RESET_WINDOW_SECONDS);
    if (!emailAllowed) {
      throw new ApiError(429, AUTH_EMAIL_USER_MESSAGES.rateLimited, "EMAIL_RATE_LIMIT");
    }
    const ipAllowed = await consume(ipBucket, PASSWORD_RESET_IP_LIMIT, PASSWORD_RESET_WINDOW_SECONDS);
    if (!ipAllowed) {
      throw new ApiError(429, AUTH_EMAIL_USER_MESSAGES.rateLimited, "EMAIL_RATE_LIMIT");
    }
  } catch (error) {
    if (error instanceof ApiError && error.code === "EMAIL_RATE_LIMIT") throw error;
    throw new ApiError(503, AUTH_EMAIL_USER_MESSAGES.generic, "RATE_LIMIT_UNAVAILABLE");
  }
}
