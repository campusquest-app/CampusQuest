import { ApiError } from "@/lib/server/http";

const XP_CAPS: Record<string, number> = {
  activity: 750,
  quest: 5000,
  boss: 10000,
  guild: 2500,
  manual: 10000,
  streak_bonus: 500,
  quad_spark: 1,
  quad_post: 10,
  campus_memory_star: 1,
};

type Bucket = { count: number; resetAt: number };
type RateStore = Map<string, Bucket>;

const globalRateStore: RateStore =
  (globalThis as { __campusquestRateStore?: RateStore }).__campusquestRateStore ??
  new Map<string, Bucket>();

if (!(globalThis as { __campusquestRateStore?: RateStore }).__campusquestRateStore) {
  (globalThis as { __campusquestRateStore?: RateStore }).__campusquestRateStore = globalRateStore;
}

export function assertSafeXpGrant(sourceType: string, amount: number) {
  const max = XP_CAPS[sourceType] ?? 1000;
  if (!Number.isInteger(amount) || amount <= 0 || amount > max) {
    throw new ApiError(400, `XP amount out of allowed range for ${sourceType}.`, "XP_OUT_OF_RANGE");
  }
}

export function assertSafeMinutes(minutes?: number) {
  if (minutes == null) return;
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 720) {
    throw new ApiError(400, "Minutes must be between 1 and 720.", "MINUTES_OUT_OF_RANGE");
  }
}

export function enforceRateLimit(args: {
  userId: string;
  routeKey: string;
  limit: number;
  windowMs: number;
  message?: string;
  code?: string;
}) {
  enforceKeyedRateLimit({
    key: args.userId,
    routeKey: args.routeKey,
    limit: args.limit,
    windowMs: args.windowMs,
    message: args.message,
    code: args.code,
  });
}

export function enforceKeyedRateLimit(args: {
  key: string;
  routeKey: string;
  limit: number;
  windowMs: number;
  message?: string;
  code?: string;
}) {
  const { key, routeKey, limit, windowMs, message, code } = args;
  const now = Date.now();
  const storeKey = `${routeKey}:${key}`;
  const existing = globalRateStore.get(storeKey);

  if (!existing || now >= existing.resetAt) {
    globalRateStore.set(storeKey, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (existing.count >= limit) {
    throw new ApiError(429, message ?? "Too many requests. Try again shortly.", code ?? "RATE_LIMITED");
  }

  existing.count += 1;
  globalRateStore.set(storeKey, existing);
}

export function getRequestClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

export function assertModerationSafeText(args: { text: string; field: "post" | "comment"; maxLen: number }) {
  const { text, field, maxLen } = args;
  const trimmed = text.trim();
  if (!trimmed) {
    throw new ApiError(400, `${field} cannot be empty.`, "EMPTY_CONTENT");
  }
  if (trimmed.length > maxLen) {
    throw new ApiError(400, `${field} exceeds max length.`, "CONTENT_TOO_LONG");
  }
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) {
    throw new ApiError(400, `${field} contains invalid control characters.`, "INVALID_CONTENT");
  }
  if (/<script\b|javascript:/i.test(trimmed)) {
    throw new ApiError(400, `${field} contains unsafe content.`, "UNSAFE_CONTENT");
  }
}

