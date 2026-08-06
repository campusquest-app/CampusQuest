import { resolveProfileAvatar } from "./avatarSource";
import type { QuadCarouselMediaDto } from "./quadMedia";
import type { FieldNote, FieldNoteMention, FieldNoteTag, RamMark } from "./types";

export type QuadReactionType = "like" | "spark";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPersistedQuadPostId(id: string): boolean {
  return UUID_RE.test(id);
}

/** Row shape from GET /api/quad/posts (with profiles join). */
export type QuadPostApiRow = {
  id: string;
  user_id: string;
  body: string;
  proof_url: string | null;
  media_type?: "none" | "image" | "video" | null;
  poster_url?: string | null;
  media_duration_seconds?: number | null;
  media_has_audio?: boolean | null;
  media_width?: number | null;
  media_height?: number | null;
  media_processing_status?: string | null;
  visibility: "public" | "friends";
  ram_marks: unknown;
  related_activity_id?: string | null;
  related_quest_slug?: string | null;
  author_streak_days?: number | null;
  location_id?: string | null;
  location_name?: string | null;
  nod_count: number;
  hype_count: number;
  verify_count: number;
  assist_count: number;
  created_at: string;
  viewer_reactions?: QuadReactionType[];
  like_count?: number;
  current_user_has_liked?: boolean;
  comments_count?: number;
  profiles?: {
    display_name: string | null;
    username: string | null;
    avatar_custom_json?: string | null;
    avatar_url?: string | null;
  } | null | Array<{
    display_name: string | null;
    username: string | null;
    avatar_custom_json?: string | null;
    avatar_url?: string | null;
  }>;
  tags?: FieldNoteTag[];
  mentions?: FieldNoteMention[];
  media?: QuadCarouselMediaDto[];
  media_count?: number | null;
  cover_media_id?: string | null;
};

export function quadPostRowToFieldNote(row: QuadPostApiRow, viewerId?: string): FieldNote {
  const p = row.profiles;
  const prof = Array.isArray(p) ? p[0] : p;
  const name = (prof?.display_name ?? "Student").trim() || "Student";
  const username = (prof?.username ?? "student").trim().toLowerCase().replace(/\s+/g, "_") || "student";
  const avatar = resolveProfileAvatar(prof ?? undefined);

  let ramMarks: RamMark[] = [];
  if (Array.isArray(row.ram_marks)) {
    ramMarks = (row.ram_marks as { id?: string; tag: string }[]).map((r, i) => ({
      id: r.id ?? `rm-${row.id}-${i}`,
      tag: String(r.tag ?? "").toLowerCase().slice(0, 15),
    }));
  }
  ramMarks = ramMarks.filter((r) => r.tag.length > 0);

  const createdAt = Date.parse(row.created_at);
  const viewerReactions = row.viewer_reactions ?? [];
  const hasLiked = row.current_user_has_liked ?? viewerReactions.includes("like");
  const hasSparked = viewerReactions.includes("spark");

  return {
    id: row.id,
    authorId: row.user_id,
    authorName: name,
    authorUsername: username,
    authorAvatar: avatar,
    body: row.body,
    ramMarks,
    nodCount: Math.max(0, row.like_count ?? row.nod_count ?? 0),
    vouchCount: Math.max(0, row.hype_count ?? 0),
    nodByUserIds: new Set(viewerId && hasLiked ? [viewerId] : []),
    vouchByUserIds: new Set(viewerId && hasSparked ? [viewerId] : []),
    hypeCount: Math.max(0, row.hype_count ?? 0),
    verifyCount: Math.max(0, row.verify_count ?? 0),
    assistCount: Math.max(0, row.assist_count ?? 0),
    hypeByUserIds: new Set(viewerId && hasSparked ? [viewerId] : []),
    verifyByUserIds: new Set(),
    assistByUserIds: new Set(),
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    proofUrl: row.proof_url ?? undefined,
    mediaType:
      row.media_type === "video" || row.media_type === "image" || row.media_type === "none"
        ? row.media_type
        : row.proof_url
          ? "image"
          : "none",
    posterUrl: row.poster_url ?? undefined,
    mediaDurationSeconds:
      row.media_duration_seconds != null ? Number(row.media_duration_seconds) : undefined,
    mediaHasAudio: row.media_has_audio === true,
    mediaWidth: row.media_width ?? undefined,
    mediaHeight: row.media_height ?? undefined,
    visibility: row.visibility,
    authorStreakDays: row.author_streak_days ?? undefined,
    locationId: row.location_id ?? undefined,
    locationName: row.location_name ?? undefined,
    isPersisted: true,
    commentCount: Math.max(0, row.comments_count ?? 0),
    tags: row.tags ?? [],
    mentions: row.mentions ?? [],
    media: row.media ?? [],
    mediaCount: row.media_count ?? row.media?.length ?? 0,
    coverMediaId: row.cover_media_id ?? undefined,
  };
}
