/** Allowlisted accounts: rolling-window weekly caps on display username / display name changes. */

export const IDENTITY_WEEKLY_CHANGE_LIMIT = 10;
export const IDENTITY_WEEKLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const WEEKLY_BUDGET_EMAILS = new Set<string>(["nicklockhart22@uri.edu"]);

export type StoredIdentityChangeEvent = {
  at: string;
  k: "display" | "username";
};

export type WeeklyIdentityBudgetPublic = {
  max_per_week: number;
  window_days: number;
  display_used: number;
  username_used: number;
};

export function hasWeeklyIdentityBudget(email: string | null | undefined): boolean {
  const e = email?.trim().toLowerCase();
  return e != null && WEEKLY_BUDGET_EMAILS.has(e);
}

export function parseIdentityWeeklyEvents(raw: unknown): StoredIdentityChangeEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredIdentityChangeEvent[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const at = (item as { at?: unknown }).at;
    const k = (item as { k?: unknown }).k;
    if (typeof at === "string" && (k === "display" || k === "username")) {
      const t = Date.parse(at);
      if (!Number.isNaN(t)) out.push({ at: new Date(t).toISOString(), k });
    }
  }
  return out;
}

export function pruneIdentityWeeklyEvents(
  events: StoredIdentityChangeEvent[],
  nowMs: number,
  windowMs: number,
): StoredIdentityChangeEvent[] {
  const cutoff = nowMs - windowMs;
  return events.filter((e) => Date.parse(e.at) >= cutoff);
}

export function countWeeklyByKind(
  events: StoredIdentityChangeEvent[],
  nowMs: number,
  windowMs: number,
): { display_used: number; username_used: number; pruned: StoredIdentityChangeEvent[] } {
  const pruned = pruneIdentityWeeklyEvents(events, nowMs, windowMs);
  let display_used = 0;
  let username_used = 0;
  for (const e of pruned) {
    if (e.k === "display") display_used += 1;
    else username_used += 1;
  }
  return { display_used, username_used, pruned };
}

export function appendIdentityWeeklyEvents(
  pruned: StoredIdentityChangeEvent[],
  args: { display?: boolean; username?: boolean; nowIso: string },
): StoredIdentityChangeEvent[] {
  const next = [...pruned];
  if (args.display) next.push({ at: args.nowIso, k: "display" });
  if (args.username) next.push({ at: args.nowIso, k: "username" });
  return next;
}

export function publicWeeklyBudgetFromEvents(
  raw: unknown,
  nowMs = Date.now(),
): WeeklyIdentityBudgetPublic | null {
  const events = parseIdentityWeeklyEvents(raw);
  const { display_used, username_used } = countWeeklyByKind(events, nowMs, IDENTITY_WEEKLY_WINDOW_MS);
  return {
    max_per_week: IDENTITY_WEEKLY_CHANGE_LIMIT,
    window_days: 7,
    display_used,
    username_used,
  };
}

/** Strip internal JSON from API payloads; attach usage counts when the DB column exists (migration applied). */
export function enrichProfileRowForApiClient(
  row: Record<string, unknown>,
  email: string | null | undefined,
): Record<string, unknown> {
  const { identity_weekly_change_events: _events, ...rest } = row;
  const out: Record<string, unknown> = { ...rest };
  if (
    hasWeeklyIdentityBudget(email) &&
    Object.prototype.hasOwnProperty.call(row, "identity_weekly_change_events")
  ) {
    out.weekly_identity_budget = publicWeeklyBudgetFromEvents(_events);
  }
  return out;
}
