/**
 * Server-only campus email verification (6-digit codes).
 * Never logs plaintext codes. Never exposes hashes to the client.
 */

import { ApiError } from "@/lib/server/http";
import { normalizeEmail } from "@/lib/platformAdmin";
import { createAdminClient } from "@/lib/server/supabase";
import { isOnboardingQaEmail } from "@/lib/onboardingQa";
import {
  CAMPUS_EMAIL_CODE_TTL_SECONDS,
  CAMPUS_EMAIL_MAX_ATTEMPTS,
  CAMPUS_EMAIL_RESEND_COOLDOWN_SECONDS,
  CAMPUS_EMAIL_SEND_LIMIT,
  CAMPUS_EMAIL_SEND_WINDOW_SECONDS,
  CAMPUS_EMAIL_USER_MESSAGES,
  isAllowedCampusVerificationEmail,
  isValidCampusEmailCode,
  maskCampusEmail,
  secondsUntil,
} from "@/lib/campusEmailVerification";
import {
  campusEmailCodesMatch,
  generateCampusEmailCode,
  getEmailVerificationSecret,
  hashCampusEmailCode,
} from "@/lib/server/campusEmailVerificationCrypto";
import { sendCampusVerificationEmailViaResend } from "@/lib/server/campusEmailVerificationMail";

export type CampusEmailChallengeRow = {
  id: string;
  user_id: string;
  email: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
  created_at: string;
  dispatched_at: string | null;
  consumed_at: string | null;
  invalidated_at: string | null;
};

export type CampusEmailVerificationStatus = {
  verified: boolean;
  verifiedAt: string | null;
  emailMasked: string;
  hasActiveChallenge: boolean;
  expiresInSeconds: number;
  resendAvailableInSeconds: number;
  dispatched: boolean;
  submitted: boolean;
  consumed: boolean;
};

export type SendCampusEmailResult = {
  ok: true;
  alreadyVerified: boolean;
  expiresInSeconds: number;
  resendAvailableInSeconds: number;
  emailMasked: string;
};

export type VerifyCampusEmailResult = {
  ok: true;
  verified: true;
  verifiedAt: string;
};

export type CampusEmailStore = {
  getProfileVerifiedAt: (userId: string) => Promise<string | null>;
  setProfileVerifiedAt: (userId: string, at: string | null) => Promise<void>;
  listChallenges: (userId: string) => Promise<CampusEmailChallengeRow[]>;
  insertChallenge: (
    row: Omit<CampusEmailChallengeRow, "id"> & { id?: string },
  ) => Promise<CampusEmailChallengeRow>;
  invalidateOpenChallenges: (userId: string, at: string) => Promise<void>;
  markDispatched: (id: string, at: string) => Promise<void>;
  consumeIfHashMatches: (args: {
    id: string;
    userId: string;
    codeHash: string;
    at: string;
  }) => Promise<boolean>;
  incrementAttempts: (id: string) => Promise<number>;
};

export type CampusEmailMailer = (args: { to: string; code: string }) => Promise<void>;

function cooldownError(seconds: number): ApiError {
  return new ApiError(429, CAMPUS_EMAIL_USER_MESSAGES.cooldown(seconds), "EMAIL_VERIFICATION_COOLDOWN");
}

export function createSupabaseCampusEmailStore(): CampusEmailStore {
  const admin = createAdminClient();
  return {
    async getProfileVerifiedAt(userId) {
      const { data, error } = await admin
        .from("profiles")
        .select("campus_email_verified_at")
        .eq("id", userId)
        .maybeSingle();
      if (error) {
        throw new ApiError(500, CAMPUS_EMAIL_USER_MESSAGES.sendFailed, "EMAIL_VERIFICATION_PROFILE");
      }
      const value = data?.campus_email_verified_at;
      return typeof value === "string" && value.trim() ? value : null;
    },
    async setProfileVerifiedAt(userId, at) {
      const { error } = await admin.from("profiles").update({ campus_email_verified_at: at }).eq("id", userId);
      if (error) {
        throw new ApiError(500, CAMPUS_EMAIL_USER_MESSAGES.sendFailed, "EMAIL_VERIFICATION_PROFILE");
      }
    },
    async listChallenges(userId) {
      const { data, error } = await admin
        .from("campus_email_verification_challenges")
        .select(
          "id, user_id, email, code_hash, expires_at, attempts, created_at, dispatched_at, consumed_at, invalidated_at",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) {
        throw new ApiError(500, CAMPUS_EMAIL_USER_MESSAGES.sendFailed, "EMAIL_VERIFICATION_STORE");
      }
      return (data ?? []) as CampusEmailChallengeRow[];
    },
    async insertChallenge(row) {
      const { data, error } = await admin
        .from("campus_email_verification_challenges")
        .insert({
          user_id: row.user_id,
          email: row.email,
          code_hash: row.code_hash,
          expires_at: row.expires_at,
          attempts: row.attempts,
          created_at: row.created_at,
          dispatched_at: row.dispatched_at,
          consumed_at: row.consumed_at,
          invalidated_at: row.invalidated_at,
        })
        .select(
          "id, user_id, email, code_hash, expires_at, attempts, created_at, dispatched_at, consumed_at, invalidated_at",
        )
        .single();
      if (error || !data) {
        throw new ApiError(500, CAMPUS_EMAIL_USER_MESSAGES.sendFailed, "EMAIL_VERIFICATION_STORE");
      }
      return data as CampusEmailChallengeRow;
    },
    async invalidateOpenChallenges(userId, at) {
      const { error } = await admin
        .from("campus_email_verification_challenges")
        .update({ invalidated_at: at })
        .eq("user_id", userId)
        .is("consumed_at", null)
        .is("invalidated_at", null);
      if (error) {
        throw new ApiError(500, CAMPUS_EMAIL_USER_MESSAGES.sendFailed, "EMAIL_VERIFICATION_STORE");
      }
    },
    async markDispatched(id, at) {
      const { error } = await admin
        .from("campus_email_verification_challenges")
        .update({ dispatched_at: at })
        .eq("id", id);
      if (error) {
        throw new ApiError(500, CAMPUS_EMAIL_USER_MESSAGES.sendFailed, "EMAIL_VERIFICATION_STORE");
      }
    },
    async consumeIfHashMatches(args) {
      const { data, error } = await admin.rpc("consume_campus_email_challenge_and_verify", {
        p_id: args.id,
        p_user_id: args.userId,
        p_code_hash: args.codeHash,
        p_now: args.at,
      });
      if (!error) {
        return data === true;
      }
      const { data: row, error: fallbackError } = await admin
        .from("campus_email_verification_challenges")
        .update({ consumed_at: args.at })
        .eq("id", args.id)
        .eq("user_id", args.userId)
        .eq("code_hash", args.codeHash)
        .is("consumed_at", null)
        .is("invalidated_at", null)
        .select("id")
        .maybeSingle();
      if (fallbackError) {
        throw new ApiError(500, CAMPUS_EMAIL_USER_MESSAGES.incorrect, "EMAIL_VERIFICATION_STORE");
      }
      if (!row?.id) return false;
      const { error: verifyError } = await admin
        .from("profiles")
        .update({ campus_email_verified_at: args.at })
        .eq("id", args.userId);
      if (verifyError) {
        throw new ApiError(500, CAMPUS_EMAIL_USER_MESSAGES.incorrect, "EMAIL_VERIFICATION_PROFILE");
      }
      return true;
    },
    async incrementAttempts(id) {
      const { data, error } = await admin.rpc("increment_campus_email_challenge_attempts", { p_id: id });
      if (!error && typeof data === "number") {
        return data;
      }
      const { data: current, error: readError } = await admin
        .from("campus_email_verification_challenges")
        .select("attempts")
        .eq("id", id)
        .single();
      if (readError || !current) {
        throw new ApiError(500, CAMPUS_EMAIL_USER_MESSAGES.incorrect, "EMAIL_VERIFICATION_STORE");
      }
      const next = Number(current.attempts ?? 0) + 1;
      const { error: writeError } = await admin
        .from("campus_email_verification_challenges")
        .update({ attempts: next })
        .eq("id", id)
        .is("consumed_at", null)
        .is("invalidated_at", null);
      if (writeError) {
        throw new ApiError(500, CAMPUS_EMAIL_USER_MESSAGES.incorrect, "EMAIL_VERIFICATION_STORE");
      }
      return next;
    },
  };
}

function latestChallenge(rows: CampusEmailChallengeRow[]): CampusEmailChallengeRow | null {
  return rows[0] ?? null;
}

function isOpen(row: CampusEmailChallengeRow, now: Date): boolean {
  return !row.consumed_at && !row.invalidated_at && Date.parse(row.expires_at) > now.getTime();
}

export async function getCampusEmailVerificationStatus(args: {
  userId: string;
  email: string;
  store: CampusEmailStore;
  now?: Date;
}): Promise<CampusEmailVerificationStatus> {
  const now = args.now ?? new Date();
  const email = normalizeEmail(args.email);
  const verifiedAt = await args.store.getProfileVerifiedAt(args.userId);
  const rows = await args.store.listChallenges(args.userId);
  const latest = latestChallenge(rows);
  const active = latest && isOpen(latest, now) ? latest : null;
  const latestCreatedMs = latest ? Date.parse(latest.created_at) : 0;
  const resendAt = latestCreatedMs + CAMPUS_EMAIL_RESEND_COOLDOWN_SECONDS * 1000;

  return {
    verified: Boolean(verifiedAt),
    verifiedAt,
    emailMasked: maskCampusEmail(email),
    hasActiveChallenge: Boolean(active),
    expiresInSeconds: active ? secondsUntil(Date.parse(active.expires_at), now.getTime()) : 0,
    resendAvailableInSeconds: latest ? secondsUntil(resendAt, now.getTime()) : 0,
    dispatched: Boolean(latest?.dispatched_at),
    submitted: Boolean(latest && (latest.attempts > 0 || latest.consumed_at)),
    consumed: Boolean(latest?.consumed_at),
  };
}

export async function sendCampusEmailVerification(args: {
  userId: string;
  email: string;
  resetIfQa?: boolean;
  store: CampusEmailStore;
  mailer?: CampusEmailMailer;
  now?: Date;
  generateCode?: () => string;
  secret?: string;
}): Promise<SendCampusEmailResult> {
  const now = args.now ?? new Date();
  const email = normalizeEmail(args.email);
  if (!email || !isAllowedCampusVerificationEmail(email)) {
    throw new ApiError(403, CAMPUS_EMAIL_USER_MESSAGES.domain, "EMAIL_VERIFICATION_DOMAIN");
  }

  const qaReset = args.resetIfQa === true && isOnboardingQaEmail(email);
  if (args.resetIfQa === true && !qaReset) {
    throw new ApiError(
      403,
      "Verification QA cycles are limited to the designated internal QA account.",
      "VERIFICATION_QA_FORBIDDEN",
    );
  }

  if (qaReset) {
    await args.store.setProfileVerifiedAt(args.userId, null);
  }

  const verifiedAt = await args.store.getProfileVerifiedAt(args.userId);
  if (verifiedAt && !qaReset) {
    return {
      ok: true,
      alreadyVerified: true,
      expiresInSeconds: 0,
      resendAvailableInSeconds: 0,
      emailMasked: maskCampusEmail(email),
    };
  }

  const rows = await args.store.listChallenges(args.userId);
  const latest = latestChallenge(rows);
  if (latest) {
    const resendAt = Date.parse(latest.created_at) + CAMPUS_EMAIL_RESEND_COOLDOWN_SECONDS * 1000;
    const wait = secondsUntil(resendAt, now.getTime());
    if (wait > 0) {
      throw cooldownError(wait);
    }
  }

  const windowStart = now.getTime() - CAMPUS_EMAIL_SEND_WINDOW_SECONDS * 1000;
  const recentSends = rows.filter((row) => Date.parse(row.created_at) >= windowStart).length;
  if (recentSends >= CAMPUS_EMAIL_SEND_LIMIT) {
    throw new ApiError(429, CAMPUS_EMAIL_USER_MESSAGES.cooldown(60), "EMAIL_VERIFICATION_RATE_LIMIT");
  }

  const secret = args.secret ?? getEmailVerificationSecret();
  const code = (args.generateCode ?? generateCampusEmailCode)();
  if (!isValidCampusEmailCode(code)) {
    throw new ApiError(500, CAMPUS_EMAIL_USER_MESSAGES.sendFailed, "EMAIL_VERIFICATION_CODE");
  }

  await args.store.invalidateOpenChallenges(args.userId, now.toISOString());

  const expiresAt = new Date(now.getTime() + CAMPUS_EMAIL_CODE_TTL_SECONDS * 1000).toISOString();
  const inserted = await args.store.insertChallenge({
    user_id: args.userId,
    email,
    code_hash: hashCampusEmailCode({ userId: args.userId, email, code, secret }),
    expires_at: expiresAt,
    attempts: 0,
    created_at: now.toISOString(),
    dispatched_at: null,
    consumed_at: null,
    invalidated_at: null,
  });

  try {
    const mailer = args.mailer ?? ((mailArgs) => sendCampusVerificationEmailViaResend(mailArgs));
    await mailer({ to: email, code });
  } catch (error) {
    await args.store.invalidateOpenChallenges(args.userId, new Date().toISOString());
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, CAMPUS_EMAIL_USER_MESSAGES.sendFailed, "EMAIL_VERIFICATION_SEND_FAILED");
  }

  await args.store.markDispatched(inserted.id, now.toISOString());

  return {
    ok: true,
    alreadyVerified: false,
    expiresInSeconds: CAMPUS_EMAIL_CODE_TTL_SECONDS,
    resendAvailableInSeconds: CAMPUS_EMAIL_RESEND_COOLDOWN_SECONDS,
    emailMasked: maskCampusEmail(email),
  };
}

export async function verifyCampusEmailCode(args: {
  userId: string;
  email: string;
  code: string;
  store: CampusEmailStore;
  now?: Date;
  secret?: string;
}): Promise<VerifyCampusEmailResult> {
  const now = args.now ?? new Date();
  const email = normalizeEmail(args.email);
  const code = (args.code ?? "").trim();

  if (!isValidCampusEmailCode(code)) {
    throw new ApiError(400, CAMPUS_EMAIL_USER_MESSAGES.incorrect, "EMAIL_VERIFICATION_INVALID_CODE");
  }

  const existingVerified = await args.store.getProfileVerifiedAt(args.userId);
  if (existingVerified) {
    return { ok: true, verified: true, verifiedAt: existingVerified };
  }

  const rows = await args.store.listChallenges(args.userId);
  const candidate = rows.find((row) => !row.invalidated_at) ?? null;
  if (!candidate) {
    throw new ApiError(400, CAMPUS_EMAIL_USER_MESSAGES.missing, "EMAIL_VERIFICATION_NOT_FOUND");
  }
  if (candidate.user_id !== args.userId) {
    throw new ApiError(403, CAMPUS_EMAIL_USER_MESSAGES.incorrect, "EMAIL_VERIFICATION_FORBIDDEN");
  }
  if (candidate.consumed_at) {
    throw new ApiError(400, CAMPUS_EMAIL_USER_MESSAGES.invalidated, "EMAIL_VERIFICATION_CONSUMED");
  }
  if (Date.parse(candidate.expires_at) <= now.getTime()) {
    throw new ApiError(400, CAMPUS_EMAIL_USER_MESSAGES.expired, "EMAIL_VERIFICATION_EXPIRED");
  }
  if (candidate.attempts >= CAMPUS_EMAIL_MAX_ATTEMPTS) {
    throw new ApiError(429, CAMPUS_EMAIL_USER_MESSAGES.tooManyAttempts, "EMAIL_VERIFICATION_TOO_MANY_ATTEMPTS");
  }

  const secret = args.secret ?? getEmailVerificationSecret();
  const submittedHash = hashCampusEmailCode({ userId: args.userId, email, code, secret });
  if (!campusEmailCodesMatch(candidate.code_hash, submittedHash)) {
    const attempts = await args.store.incrementAttempts(candidate.id);
    if (attempts >= CAMPUS_EMAIL_MAX_ATTEMPTS) {
      throw new ApiError(429, CAMPUS_EMAIL_USER_MESSAGES.tooManyAttempts, "EMAIL_VERIFICATION_TOO_MANY_ATTEMPTS");
    }
    throw new ApiError(400, CAMPUS_EMAIL_USER_MESSAGES.incorrect, "EMAIL_VERIFICATION_INVALID_CODE");
  }

  const consumed = await args.store.consumeIfHashMatches({
    id: candidate.id,
    userId: args.userId,
    codeHash: submittedHash,
    at: now.toISOString(),
  });
  if (!consumed) {
    throw new ApiError(400, CAMPUS_EMAIL_USER_MESSAGES.invalidated, "EMAIL_VERIFICATION_CONSUMED");
  }

  let verifiedAt = await args.store.getProfileVerifiedAt(args.userId);
  if (!verifiedAt) {
    verifiedAt = now.toISOString();
    await args.store.setProfileVerifiedAt(args.userId, verifiedAt);
  }
  return { ok: true, verified: true, verifiedAt };
}
