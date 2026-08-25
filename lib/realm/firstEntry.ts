export const REALM_MAP_FOCUS_KEY = "cq_realm_map_focus_v1";

export type RealmMapFocusPayload = {
  eventId?: string;
  locationId?: string;
  source?: "events" | "feed" | "search";
  /** After focusing a mapped event, start the existing Walk Here route. */
  walk?: boolean;
};

function readSession(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function removeSession(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function setRealmMapFocus(payload: RealmMapFocusPayload): void {
  writeSession(REALM_MAP_FOCUS_KEY, JSON.stringify(payload));
}

export function peekRealmMapFocus(): RealmMapFocusPayload | null {
  const raw = readSession(REALM_MAP_FOCUS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RealmMapFocusPayload;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      eventId: typeof parsed.eventId === "string" ? parsed.eventId : undefined,
      locationId: typeof parsed.locationId === "string" ? parsed.locationId : undefined,
      source:
        parsed.source === "events" || parsed.source === "feed" || parsed.source === "search"
          ? parsed.source
          : undefined,
      walk: parsed.walk === true ? true : undefined,
    };
  } catch {
    return null;
  }
}

export function consumeRealmMapFocus(): RealmMapFocusPayload | null {
  const payload = peekRealmMapFocus();
  removeSession(REALM_MAP_FOCUS_KEY);
  return payload;
}

export const PENDING_REALM_ARRIVAL_KEY = "cq_pending_realm_arrival_v1";

export function markPendingRealmArrival(): void {
  writeSession(PENDING_REALM_ARRIVAL_KEY, "1");
}

export function hasPendingRealmArrival(): boolean {
  return readSession(PENDING_REALM_ARRIVAL_KEY) === "1";
}

export function clearPendingRealmArrival(): void {
  removeSession(PENDING_REALM_ARRIVAL_KEY);
}

/**
 * First-entry Realm welcome.
 * `undefined` = column missing / pre-migration payload → grandfather (do not force).
 * `null` = eligible new completed account.
 * timestamp = already seen or backfilled.
 */
export function shouldShowRealmArrival(args: {
  realmWelcomeSeenAt: string | null | undefined;
  pending: boolean;
  onboardingComplete: boolean;
}): boolean {
  if (!args.onboardingComplete) return false;
  if (args.realmWelcomeSeenAt) return false;
  if (args.realmWelcomeSeenAt === undefined) return false;
  return args.pending || args.realmWelcomeSeenAt === null;
}

export function shouldLandOnRealmFirstEntry(args: {
  realmWelcomeSeenAt: string | null | undefined;
  pending: boolean;
}): boolean {
  if (args.pending) return true;
  if (args.realmWelcomeSeenAt === undefined) return false;
  return args.realmWelcomeSeenAt === null;
}

export function shouldShowNavHints(navHintsSeenAt: string | null | undefined): boolean {
  if (navHintsSeenAt === undefined) return false;
  return navHintsSeenAt == null;
}

export function readOptionalProfileTimestamp(
  profile: Record<string, unknown> | null | undefined,
  key: string,
): string | null | undefined {
  if (!profile || !Object.prototype.hasOwnProperty.call(profile, key)) return undefined;
  const value = profile[key];
  if (value == null) return null;
  return typeof value === "string" ? value : null;
}

export function campusArrivalName(schoolName?: string | null, institutionId?: string | null): string {
  const named = schoolName?.trim();
  if (named) return named;
  if ((institutionId ?? "").toLowerCase() === "uri") return "URI";
  return "campus";
}
