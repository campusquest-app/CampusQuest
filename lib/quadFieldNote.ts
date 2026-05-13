import type { FieldNote, RamMark } from "./types";

/** Row shape from GET /api/quad/posts (with profiles join). */
export type QuadPostApiRow = {
  id: string;
  user_id: string;
  body: string;
  proof_url: string | null;
  visibility: "public" | "friends";
  ram_marks: unknown;
  related_activity_id?: string | null;
  related_quest_slug?: string | null;
  author_streak_days?: number | null;
  nod_count: number;
  hype_count: number;
  verify_count: number;
  assist_count: number;
  created_at: string;
  profiles?: {
    display_name: string | null;
    username: string | null;
    avatar_custom_json?: string | null;
  } | null | Array<{
    display_name: string | null;
    username: string | null;
    avatar_custom_json?: string | null;
  }>;
};

export function quadPostRowToFieldNote(row: QuadPostApiRow): FieldNote {
  const p = row.profiles;
  const prof = Array.isArray(p) ? p[0] : p;
  const name = (prof?.display_name ?? "Student").trim() || "Student";
  const username = (prof?.username ?? "student").trim().toLowerCase().replace(/\s+/g, "_") || "student";
  let avatar = "🎓";
  const aj = prof?.avatar_custom_json;
  if (typeof aj === "string" && aj.trim().length > 0) {
    avatar = aj.trim();
  }

  let ramMarks: RamMark[] = [];
  if (Array.isArray(row.ram_marks)) {
    ramMarks = (row.ram_marks as { id?: string; tag: string }[]).map((r, i) => ({
      id: r.id ?? `rm-${row.id}-${i}`,
      tag: String(r.tag ?? "").toLowerCase().slice(0, 15),
    }));
  }
  ramMarks = ramMarks.filter((r) => r.tag.length > 0);

  const createdAt = Date.parse(row.created_at);
  const baseline = {
    nod: Math.max(0, row.nod_count ?? 0),
    hype: Math.max(0, row.hype_count ?? 0),
    verify: Math.max(0, row.verify_count ?? 0),
    assist: Math.max(0, row.assist_count ?? 0),
  };

  return {
    id: row.id,
    authorId: row.user_id,
    authorName: name,
    authorUsername: username,
    authorAvatar: avatar,
    body: row.body,
    ramMarks,
    nodCount: baseline.nod,
    vouchCount: baseline.hype,
    nodByUserIds: new Set(),
    vouchByUserIds: new Set(),
    hypeCount: baseline.hype,
    verifyCount: baseline.verify,
    assistCount: baseline.assist,
    hypeByUserIds: new Set(),
    verifyByUserIds: new Set(),
    assistByUserIds: new Set(),
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    proofUrl: row.proof_url ?? undefined,
    visibility: row.visibility,
    authorStreakDays: row.author_streak_days ?? undefined,
    reactionBaseline: baseline,
  };
}
