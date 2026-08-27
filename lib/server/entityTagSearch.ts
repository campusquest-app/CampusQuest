import { createAdminClient } from "@/lib/server/supabase";
import { listHiddenUserIds } from "@/lib/server/qaTestAccount";
import { TAG_SEARCH_LIMIT, type TagEntityType } from "@/lib/postTags";
import { normalizeMentionSlug } from "@/lib/mentionSlug";

export type TagSearchHit = {
  entityType: TagEntityType;
  entityId: string;
  displayLabel: string;
  subtitle: string | null;
  mentionSlug: string;
  avatarUrl: string | null;
  meta?: Record<string, string | boolean | null>;
};

function rankScore(query: string, exact: string, display: string): number {
  const q = query.toLowerCase();
  const e = exact.toLowerCase();
  const d = display.toLowerCase();
  if (e === q) return 300;
  if (d === q) return 280;
  if (e.startsWith(q)) return 200;
  if (d.startsWith(q)) return 180;
  if (e.includes(q)) return 100;
  if (d.includes(q)) return 80;
  return 0;
}

async function loadBlockedIds(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<Set<string>> {
  const { data } = await admin
    .from("blocked_users")
    .select("blocker_id, blocked_id")
    .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);
  const blocked = new Set<string>();
  for (const row of data ?? []) {
    if (row.blocker_id === userId) blocked.add(row.blocked_id);
    if (row.blocked_id === userId) blocked.add(row.blocker_id);
  }
  return blocked;
}

export async function searchTaggableEntities(args: {
  viewerId: string;
  query: string;
  filter?: "all" | "people" | "organizations" | "events";
  limit?: number;
}): Promise<TagSearchHit[]> {
  const q = args.query.trim();
  if (q.length < 1) return [];
  const limit = Math.min(TAG_SEARCH_LIMIT, Math.max(1, args.limit ?? TAG_SEARCH_LIMIT));
  const filter = args.filter ?? "all";
  const admin = createAdminClient();
  const safe = q.replace(/[%_,]/g, "");
  const [blockedSet, hidden] = await Promise.all([
    loadBlockedIds(admin, args.viewerId),
    listHiddenUserIds(admin),
  ]);

  const hits: TagSearchHit[] = [];

  if (filter === "all" || filter === "people") {
    const { data } = await admin
      .from("profiles")
      .select("id, username, display_name, avatar_url, role")
      .or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`)
      .limit(limit * 2);
    for (const row of data ?? []) {
      if (blockedSet.has(row.id) || hidden.has(row.id)) continue;
      if (row.role === "qa") continue;
      const username = (row.username ?? "").trim();
      if (!username) continue;
      hits.push({
        entityType: "user",
        entityId: row.id,
        displayLabel: (row.display_name ?? username).trim() || username,
        subtitle: `@${username}`,
        mentionSlug: username.toLowerCase(),
        avatarUrl: row.avatar_url ?? null,
        meta: { role: row.role ?? "student", kind: "Person" },
      });
    }
  }

  if (filter === "all" || filter === "organizations") {
    const { data } = await admin
      .from("student_organizations")
      .select("id, name, category, logo_url, mention_slug, is_approved")
      .or(`name.ilike.%${safe}%,mention_slug.ilike.%${safe}%`)
      .eq("is_approved", true)
      .limit(limit * 2);
    for (const row of data ?? []) {
      const slug = (row.mention_slug ?? normalizeMentionSlug(row.name ?? "")).toLowerCase();
      if (!slug) continue;
      hits.push({
        entityType: "organization",
        entityId: row.id,
        displayLabel: row.name ?? "Organization",
        subtitle: row.category ?? "Organization",
        mentionSlug: slug,
        avatarUrl: row.logo_url ?? null,
        meta: { verified: row.is_approved === true, kind: "Organization" },
      });
    }
  }

  if (filter === "all" || filter === "events") {
    const nowIso = new Date().toISOString();
    const [{ data: campusEvents }, { data: externalEvents }] = await Promise.all([
      admin
        .from("campus_events")
        .select("id, title, starts_at, location_name, mention_slug, is_cancelled")
        .or(`title.ilike.%${safe}%,mention_slug.ilike.%${safe}%`)
        .eq("is_cancelled", false)
        .gte("ends_at", nowIso)
        .order("starts_at", { ascending: true })
        .limit(limit),
      admin
        .from("external_events")
        .select(
          "id, title, starts_at, location_name, venue_name, organization_name, sport, opponent, mention_slug, image_url, is_active",
        )
        .or(
          `title.ilike.%${safe}%,mention_slug.ilike.%${safe}%,organization_name.ilike.%${safe}%,sport.ilike.%${safe}%,opponent.ilike.%${safe}%`,
        )
        .eq("is_active", true)
        .gte("ends_at", nowIso)
        .order("starts_at", { ascending: true })
        .limit(limit),
    ]);

    for (const row of campusEvents ?? []) {
      const slug = (row.mention_slug ?? normalizeMentionSlug(row.title ?? "")).toLowerCase();
      hits.push({
        entityType: "event",
        entityId: row.id,
        displayLabel: row.title ?? "Event",
        subtitle: [row.starts_at ? new Date(row.starts_at).toLocaleString() : null, row.location_name]
          .filter(Boolean)
          .join(" · "),
        mentionSlug: slug,
        avatarUrl: null,
        meta: { kind: "Event", cancelled: false },
      });
    }
    for (const row of externalEvents ?? []) {
      const slug = (row.mention_slug ?? normalizeMentionSlug(row.title ?? "")).toLowerCase();
      hits.push({
        entityType: "external_event",
        entityId: row.id,
        displayLabel: row.title ?? "Event",
        subtitle: [
          row.starts_at ? new Date(row.starts_at).toLocaleString() : null,
          row.venue_name || row.location_name,
          row.organization_name,
        ]
          .filter(Boolean)
          .join(" · "),
        mentionSlug: slug,
        avatarUrl: row.image_url ?? null,
        meta: { kind: "Event", cancelled: false },
      });
    }
  }

  hits.sort(
    (a, b) =>
      rankScore(q, b.mentionSlug, b.displayLabel) - rankScore(q, a.mentionSlug, a.displayLabel),
  );
  return hits.slice(0, limit);
}
