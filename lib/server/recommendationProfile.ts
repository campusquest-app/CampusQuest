import { normalizeCommunityIds, normalizeInterestIds } from "@/lib/onboarding/taxonomy";
import { matchRecommendationTopics } from "@/lib/recommendations/match";
import {
  campusEventToRecommendationEntity,
  organizationToRecommendationEntity,
} from "@/lib/recommendations/adapters";
import { inferAffinitiesFromSignals, type RecommendationBehaviorSignal } from "@/lib/recommendations/profile";
import type { UserRecommendationProfile } from "@/lib/recommendations/types";
import { createAdminClient } from "@/lib/server/supabase";
import type { User } from "@supabase/supabase-js";

type ClientLike = {
  from: (table: string) => any;
};

type Row = Record<string, unknown>;

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asRows(data: unknown): Row[] {
  if (!Array.isArray(data)) return [];
  return data.filter((row): row is Row => Boolean(row) && typeof row === "object");
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen: Record<string, true> = {};
  for (const value of values) {
    const id = String(value ?? "").trim();
    if (!id || seen[id]) continue;
    seen[id] = true;
    out.push(id);
  }
  return out;
}

async function loadOwnRsvpSignals(userClient: ClientLike, userId: string): Promise<RecommendationBehaviorSignal[]> {
  const { data, error } = await userClient
    .from("event_rsvps")
    .select("event_id, status")
    .eq("user_id", userId)
    .in("status", ["going", "interested"])
    .limit(40);
  if (error || !Array.isArray(data) || data.length === 0) return [];
  const rsvpRows = asRows(data);
  const eventIds = uniqueStrings(rsvpRows.map((row) => String(row.event_id ?? "")));
  if (eventIds.length === 0) return [];
  const { data: events } = await userClient
    .from("campus_events")
    .select("id, title, description, category, location_name")
    .in("id", eventIds);
  const byId = new Map(asRows(events).map((row) => [String(row.id), row]));
  const signals: RecommendationBehaviorSignal[] = [];
  for (const row of rsvpRows) {
    const event = byId.get(String(row.event_id));
    if (!event) continue;
    const match = matchRecommendationTopics(
      campusEventToRecommendationEntity({
        id: String(event.id),
        title: String(event.title ?? ""),
        description: String(event.description ?? ""),
        category: (event.category as string | null) ?? null,
        location: (event.location_name as string | null) ?? null,
      }),
    );
    const topicIds = [...match.interestIds, ...match.communityIds];
    if (topicIds.length === 0) continue;
    signals.push({
      kind: row.status === "going" ? "rsvp_going" : "rsvp_interested",
      topicIds,
    });
  }
  return signals;
}

async function loadOwnOrgSignals(userClient: ClientLike, userId: string): Promise<{
  signals: RecommendationBehaviorSignal[];
  followedOrganizationIds: string[];
  followedOrganizationNames: string[];
}> {
  const { data, error } = await userClient
    .from("organization_members")
    .select("organization_id, membership_kind, status")
    .eq("user_id", userId)
    .limit(50);
  if (error || !Array.isArray(data) || data.length === 0) {
    return { signals: [], followedOrganizationIds: [], followedOrganizationNames: [] };
  }
  const approved = asRows(data).filter((row) => String(row.status ?? "approved") !== "denied");
  const orgIds = uniqueStrings(approved.map((row: Row) => String(row.organization_id ?? "")));
  if (orgIds.length === 0) {
    return { signals: [], followedOrganizationIds: [], followedOrganizationNames: [] };
  }
  const { data: orgs } = await userClient
    .from("student_organizations")
    .select("id, name, description, category")
    .in("id", orgIds);
  const byId = new Map(asRows(orgs).map((row) => [String(row.id), row]));
  const followedOrganizationIds: string[] = [];
  const followedOrganizationNames: string[] = [];
  const signals: RecommendationBehaviorSignal[] = [];
  for (const row of approved) {
    const org = byId.get(String(row.organization_id));
    if (!org) continue;
    followedOrganizationIds.push(String(org.id));
    followedOrganizationNames.push(String(org.name ?? ""));
    const match = matchRecommendationTopics(
      organizationToRecommendationEntity({
        id: String(org.id),
        name: String(org.name ?? ""),
        description: String(org.description ?? ""),
        category: (org.category as string | null) ?? null,
      }),
    );
    const topicIds = [...match.interestIds, ...match.communityIds];
    if (topicIds.length === 0) continue;
    signals.push({
      kind: row.membership_kind === "follower" ? "org_follower" : "org_member",
      topicIds,
    });
  }
  return { signals, followedOrganizationIds, followedOrganizationNames };
}

async function loadOwnCheckInSignals(userClient: ClientLike, userId: string): Promise<RecommendationBehaviorSignal[]> {
  const { data, error } = await userClient
    .from("qr_scans")
    .select("qr_code_id, status")
    .eq("user_id", userId)
    .in("status", ["success", "admin_bypass"])
    .order("scanned_at", { ascending: false })
    .limit(25);
  if (error || !Array.isArray(data) || data.length === 0) return [];
  const scanRows = asRows(data);
  const qrIds = uniqueStrings(scanRows.map((row) => String(row.qr_code_id ?? "")));
  if (qrIds.length === 0) return [];
  const { data: codes } = await userClient
    .from("qr_codes")
    .select("id, title, event_id, type, qr_type")
    .in("id", qrIds);
  const eventIds = uniqueStrings(
    asRows(codes)
      .filter((row) => {
        const type = String(row.type ?? "");
        const qrType = String(row.qr_type ?? "");
        return Boolean(row.event_id) && (type === "event" || qrType === "event_check_in");
      })
      .map((row) => String(row.event_id)),
  );
  if (eventIds.length === 0) return [];
  const { data: events } = await userClient
    .from("campus_events")
    .select("id, title, description, category")
    .in("id", eventIds);
  const signals: RecommendationBehaviorSignal[] = [];
  for (const event of asRows(events)) {
    const match = matchRecommendationTopics(
      campusEventToRecommendationEntity({
        id: String(event.id),
        title: String(event.title ?? ""),
        description: String(event.description ?? ""),
        category: (event.category as string | null) ?? null,
      }),
    );
    const topicIds = [...match.interestIds, ...match.communityIds];
    if (topicIds.length === 0) continue;
    signals.push({ kind: "check_in", topicIds });
  }
  return signals;
}

export async function loadUserRecommendationProfile(args: {
  userClient: ClientLike;
  user: User;
}): Promise<UserRecommendationProfile> {
  const userId = args.user.id;

  const [profileResult, prefsResult, rsvpSignals, orgBundle, checkInSignals] = await Promise.all([
    args.userClient
      .from("profiles")
      .select("institution_id, student_status, class_year")
      .eq("id", userId)
      .maybeSingle(),
    args.userClient
      .from("user_onboarding_preferences")
      .select("interests, communities, institution_id, school_name")
      .eq("user_id", userId)
      .maybeSingle(),
    loadOwnRsvpSignals(args.userClient, userId).catch(() => [] as RecommendationBehaviorSignal[]),
    loadOwnOrgSignals(args.userClient, userId).catch(() => ({
      signals: [] as RecommendationBehaviorSignal[],
      followedOrganizationIds: [] as string[],
      followedOrganizationNames: [] as string[],
    })),
    loadOwnCheckInSignals(args.userClient, userId).catch(() => [] as RecommendationBehaviorSignal[]),
  ]);

  const profile = (profileResult.data ?? {}) as Record<string, unknown>;
  const prefs = (prefsResult.data ?? {}) as Record<string, unknown>;
  const campusId =
    String(profile.institution_id ?? prefs.institution_id ?? "").trim() ||
    (String(prefs.school_name ?? "").toLowerCase().includes("rhode island") ? "uri" : null);

  return {
    campusId,
    studentStatus: (profile.student_status as string | null) ?? null,
    classYear: typeof profile.class_year === "number" ? profile.class_year : null,
    explicitInterests: normalizeInterestIds(asStringArray(prefs.interests)),
    explicitCommunities: normalizeCommunityIds(asStringArray(prefs.communities)),
    inferredAffinities: inferAffinitiesFromSignals([
      ...rsvpSignals,
      ...orgBundle.signals,
      ...checkInSignals,
    ]),
    followedOrganizationIds: orgBundle.followedOrganizationIds,
    followedOrganizationNames: orgBundle.followedOrganizationNames,
    // Never ship score-breakdown debug to clients (admin or student). Ranking still runs.
    includeDebug: false,
  };
}

/** Kept so analytics/popularity callers can reuse admin exclusion without extra imports. */
export async function loadAnalyticsExcludedUserIds(): Promise<Set<string>> {
  const { listAnalyticsExcludedUserIds } = await import("@/lib/server/qaTestAccount");
  return listAnalyticsExcludedUserIds(createAdminClient());
}
