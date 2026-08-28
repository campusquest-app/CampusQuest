import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";
import type { ProfileRow, UserStatsRow } from "@/lib/server/types";
import {
  isKnownQaAccountEmail,
  QA_ACCOUNT_PROFILE_FLAGS,
} from "@/lib/internalAccount";

/** Total budget for auth/profile/stats readiness after signup/login.
 * Kept under typical serverless request limits so we can return a recoverable
 * AUTH_CREATED_SETUP_PENDING response instead of being killed mid-setup.
 */
export const PLAYER_SETUP_TIMEOUT_MS = 6_500;

const SETUP_LOG_PREFIX = "[cq:player-setup]";

function sanitizeUsername(seed: string) {
  const normalized = seed
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized.slice(0, 20) || "player";
}

function buildUsername(email: string, userId: string) {
  const base = sanitizeUsername(email.split("@")[0] ?? "player");
  return `${base}_${userId.slice(0, 6)}`.slice(0, 24);
}

function nowMs() {
  return Date.now();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff delays capped so total waits stay near the timeout budget. */
export function nextBackoffMs(attempt: number): number {
  // attempt 1 → 150ms, 2 → 300ms, 3 → 600ms, 4 → 1200ms, then 2000ms cap
  return Math.min(2000, 150 * 2 ** Math.max(0, attempt - 1));
}

export function isForeignKeyViolation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "23503") return true;
  const msg = (error.message ?? "").toLowerCase();
  return (
    msg.includes("foreign key") ||
    msg.includes("violates foreign key constraint") ||
    (msg.includes("auth.users") && msg.includes("profiles"))
  );
}

export function isTransientSetupError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (isForeignKeyViolation(error)) return true;
  const code = (error.code ?? "").toLowerCase();
  const msg = (error.message ?? "").toLowerCase();
  return (
    code === "40001" || // serialization failure
    code === "40p01" || // deadlock
    code === "57014" || // query canceled
    code === "57p01" ||
    msg.includes("timeout") ||
    msg.includes("temporar") ||
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("connection")
  );
}

function logSetup(phase: string, details: Record<string, unknown>) {
  console.info(SETUP_LOG_PREFIX, phase, {
    ts: new Date().toISOString(),
    ...details,
  });
}

function logSetupError(phase: string, details: Record<string, unknown>) {
  console.error(SETUP_LOG_PREFIX, phase, {
    ts: new Date().toISOString(),
    ...details,
  });
}

async function waitForAuthUser(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  deadlineMs: number,
) {
  const started = nowMs();
  let attempt = 0;
  let lastError: { message?: string; code?: string } | null = null;

  while (nowMs() < deadlineMs) {
    attempt += 1;
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (!error && data?.user?.id === userId) {
      logSetup("auth_user_ready", {
        userId,
        attempt,
        elapsedMs: nowMs() - started,
      });
      return;
    }
    lastError = error;
    const wait = nextBackoffMs(attempt);
    const remaining = deadlineMs - nowMs();
    if (remaining <= 0) break;
    logSetup("auth_user_pending", {
      userId,
      attempt,
      waitMs: Math.min(wait, remaining),
      error: error?.message ?? null,
      code: error?.code ?? null,
    });
    await sleep(Math.min(wait, remaining));
  }

  logSetupError("auth_user_timeout", {
    userId,
    attempts: attempt,
    elapsedMs: nowMs() - started,
    lastError: lastError?.message ?? null,
    lastCode: lastError?.code ?? null,
  });
  throw new ApiError(
    503,
    "We're finishing your account. Hang tight — this only takes a moment.",
    "AUTH_USER_NOT_READY",
  );
}

async function upsertProfileRow(
  admin: ReturnType<typeof createAdminClient>,
  profileInsert: Record<string, unknown>,
  userId: string,
  deadlineMs: number,
) {
  const started = nowMs();
  let attempt = 0;
  let lastError: { message?: string; code?: string } | null = null;

  while (nowMs() < deadlineMs) {
    attempt += 1;
    const { error } = await admin.from("profiles").upsert(profileInsert, {
      onConflict: "id",
      ignoreDuplicates: true,
    });

    if (!error) {
      logSetup("profile_upsert_ok", {
        userId,
        attempt,
        elapsedMs: nowMs() - started,
      });
      return;
    }

    lastError = error;
    // Username taken for a preferred username — fall back to derived unique name once.
    if (
      attempt === 1 &&
      (error.message ?? "").toLowerCase().includes("username") &&
      typeof profileInsert.username === "string"
    ) {
      const fallback = buildUsername(String(profileInsert.username), userId);
      if (fallback !== profileInsert.username) {
        logSetup("profile_username_collision_retry", {
          userId,
          previous: profileInsert.username,
          next: fallback,
        });
        profileInsert.username = fallback;
        continue;
      }
    }

    if (!isTransientSetupError(error)) {
      logSetupError("profile_upsert_failed", {
        userId,
        attempt,
        message: error.message,
        code: error.code ?? null,
      });
      throw new ApiError(400, error.message, "PROFILE_SETUP_FAILED");
    }

    const wait = nextBackoffMs(attempt);
    const remaining = deadlineMs - nowMs();
    if (remaining <= 0) break;
    logSetup("profile_upsert_retry", {
      userId,
      attempt,
      waitMs: Math.min(wait, remaining),
      message: error.message,
      code: error.code ?? null,
      fk: isForeignKeyViolation(error),
    });
    await sleep(Math.min(wait, remaining));
  }

  logSetupError("profile_upsert_timeout", {
    userId,
    attempts: attempt,
    elapsedMs: nowMs() - started,
    lastError: lastError?.message ?? null,
    lastCode: lastError?.code ?? null,
  });
  throw new ApiError(
    503,
    "We're finishing your account. Hang tight — this only takes a moment.",
    "PROFILE_SETUP_PENDING",
  );
}

async function upsertStatsRow(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  deadlineMs: number,
) {
  const started = nowMs();
  let attempt = 0;
  let lastError: { message?: string; code?: string } | null = null;
  const payload = {
    user_id: userId,
    level: 1,
    total_xp: 0,
    strength: 0,
    stamina: 0,
    knowledge: 0,
    social: 0,
    focus: 0,
  };

  while (nowMs() < deadlineMs) {
    attempt += 1;
    const { error } = await admin.from("user_stats").upsert(payload, {
      onConflict: "user_id",
      ignoreDuplicates: true,
    });

    if (!error) {
      logSetup("stats_upsert_ok", {
        userId,
        attempt,
        elapsedMs: nowMs() - started,
      });
      return;
    }

    lastError = error;
    if (!isTransientSetupError(error)) {
      logSetupError("stats_upsert_failed", {
        userId,
        attempt,
        message: error.message,
        code: error.code ?? null,
      });
      throw new ApiError(400, error.message, "STATS_SETUP_FAILED");
    }

    const wait = nextBackoffMs(attempt);
    const remaining = deadlineMs - nowMs();
    if (remaining <= 0) break;
    logSetup("stats_upsert_retry", {
      userId,
      attempt,
      waitMs: Math.min(wait, remaining),
      message: error.message,
      code: error.code ?? null,
    });
    await sleep(Math.min(wait, remaining));
  }

  logSetupError("stats_upsert_timeout", {
    userId,
    attempts: attempt,
    elapsedMs: nowMs() - started,
    lastError: lastError?.message ?? null,
  });
  throw new ApiError(
    503,
    "We're finishing your account. Hang tight — this only takes a moment.",
    "STATS_SETUP_PENDING",
  );
}

async function pollUntilProfileAndStats(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  deadlineMs: number,
): Promise<{ profile: ProfileRow; stats: UserStatsRow }> {
  const started = nowMs();
  let attempt = 0;

  while (nowMs() < deadlineMs) {
    attempt += 1;
    const [{ data: profile, error: profileError }, { data: stats, error: statsError }] =
      await Promise.all([
        admin.from("profiles").select("*").eq("id", userId).maybeSingle(),
        admin.from("user_stats").select("*").eq("user_id", userId).maybeSingle(),
      ]);

    if (profile && stats) {
      logSetup("ready", {
        userId,
        attempt,
        elapsedMs: nowMs() - started,
        username: (profile as ProfileRow).username,
      });
      return { profile: profile as ProfileRow, stats: stats as UserStatsRow };
    }

    logSetup("poll_missing", {
      userId,
      attempt,
      hasProfile: Boolean(profile),
      hasStats: Boolean(stats),
      profileError: profileError?.message ?? null,
      statsError: statsError?.message ?? null,
      elapsedMs: nowMs() - started,
    });

    // Self-heal mid-poll if a row vanished or the first upsert raced.
    if (!profile) {
      try {
        await upsertProfileRow(
          admin,
          {
            id: userId,
            username: buildUsername(userId, userId),
            display_name: "CampusQuest Player",
            bio: "",
          },
          userId,
          Math.min(deadlineMs, nowMs() + 2_500),
        );
      } catch {
        // Continue polling until deadline — next loop logs the issue.
      }
    } else if (!stats) {
      try {
        await upsertStatsRow(admin, userId, Math.min(deadlineMs, nowMs() + 2_500));
      } catch {
        // Continue polling.
      }
    }

    const wait = nextBackoffMs(attempt);
    const remaining = deadlineMs - nowMs();
    if (remaining <= 0) break;
    await sleep(Math.min(wait, remaining));
  }

  logSetupError("poll_timeout", {
    userId,
    attempts: attempt,
    elapsedMs: nowMs() - started,
  });
  throw new ApiError(
    503,
    "We're finishing your account. Hang tight — this only takes a moment.",
    "PLAYER_SETUP_PENDING",
  );
}

/**
 * Atomically ensure Auth user → profiles → user_stats before the app continues.
 * Polls with exponential backoff for up to {@link PLAYER_SETUP_TIMEOUT_MS}.
 * Safe to call on every signup and login — does not overwrite existing profile fields.
 */
export async function ensurePlayerSetup(args: {
  userId: string;
  email?: string | null;
  displayName?: string;
  username?: string;
}) {
  const { userId, email, displayName, username: preferredUsername } = args;
  const admin = createAdminClient();
  const started = nowMs();
  const deadlineMs = started + PLAYER_SETUP_TIMEOUT_MS;

  logSetup("begin", {
    userId,
    hasEmail: Boolean(email),
    hasPreferredUsername: Boolean(preferredUsername?.trim()),
    timeoutMs: PLAYER_SETUP_TIMEOUT_MS,
  });

  await waitForAuthUser(admin, userId, deadlineMs);

  const username = preferredUsername?.trim()
    ? sanitizeUsername(preferredUsername).slice(0, 24) || buildUsername(email ?? userId, userId)
    : buildUsername(email ?? userId, userId);
  const defaultName = displayName?.trim() || (email ? email.split("@")[0] : "CampusQuest Player");

  // role intentionally omitted for normal users: they choose Student /
  // Faculty-Staff on the account-type onboarding screen (NULL = not chosen).
  const isQa = isKnownQaAccountEmail(email);
  const profileInsert: Record<string, unknown> = {
    id: userId,
    username,
    display_name: defaultName.slice(0, 50),
    bio: "",
    ...(isQa ? QA_ACCOUNT_PROFILE_FLAGS : {}),
  };

  await upsertProfileRow(admin, profileInsert, userId, deadlineMs);

  if (isQa) {
    // ignoreDuplicates may leave an older unflagged row — force QA flags.
    const { error: flagError } = await admin
      .from("profiles")
      .update({ ...QA_ACCOUNT_PROFILE_FLAGS })
      .eq("id", userId);
    if (flagError && !/column .* does not exist/i.test(flagError.message ?? "")) {
      throw new ApiError(400, flagError.message, "QA_PROFILE_FLAGS_FAILED");
    }
  }

  await upsertStatsRow(admin, userId, deadlineMs);

  const ready = await pollUntilProfileAndStats(admin, userId, deadlineMs);

  logSetup("complete", {
    userId,
    elapsedMs: nowMs() - started,
    username: ready.profile.username,
  });

  return ready;
}
