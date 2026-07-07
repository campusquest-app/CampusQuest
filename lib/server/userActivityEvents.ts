import { ApiError } from "@/lib/server/http";
import type { createUserClient } from "@/lib/server/supabase";
import { buildQrScanActivityPayload } from "@/lib/userActivityEventPayload";

type SupabaseClientLike = ReturnType<typeof createUserClient>;

export type UserActivityType =
  | "qr_check_in"
  | "quest_completed"
  | "xp_reward"
  | "manual_log"
  | "post_created"
  | "memory_saved"
  | "achievement";

export type UserActivityEventRow = {
  id: string;
  user_id: string;
  activity_type: UserActivityType;
  title: string;
  description: string | null;
  xp_awarded: number;
  quest_id: string | null;
  location_id: string | null;
  qr_code_id: string | null;
  post_id: string | null;
  memory_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

const DEDUP_WINDOW_MS = 5 * 60 * 1000;

export function buildQrScanActivityEvent(input: {
  questCompleted: { questId: string; questName: string; xpReward: number } | null;
  locationName: string | null;
  qrTitle: string;
  totalXpAwarded: number;
  qrCodeId: string;
  questId?: string | null;
  locationId?: string | null;
}) {
  const payload = buildQrScanActivityPayload(input);
  return {
    activity_type: payload.activity_type,
    title: payload.title,
    description: payload.description,
    xp_awarded: payload.xp_awarded,
    quest_id: payload.quest_id,
    location_id: input.locationId ?? null,
    qr_code_id: payload.qr_code_id,
    metadata: payload.metadata,
  };
}

async function hasRecentDuplicate(args: {
  client: SupabaseClientLike;
  userId: string;
  qrCodeId?: string | null;
  questId?: string | null;
  activityType: UserActivityType;
}): Promise<boolean> {
  const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();

  if (args.qrCodeId) {
    const { count, error } = await args.client
      .from("user_activity_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", args.userId)
      .eq("qr_code_id", args.qrCodeId)
      .gte("created_at", since);
    if (error) throw new ApiError(500, error.message, "ACTIVITY_DEDUP_FAILED");
    if ((count ?? 0) > 0) return true;
  }

  if (args.activityType === "quest_completed" && args.questId) {
    const { count, error } = await args.client
      .from("user_activity_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", args.userId)
      .eq("quest_id", args.questId)
      .eq("activity_type", "quest_completed")
      .gte("created_at", since);
    if (error) throw new ApiError(500, error.message, "ACTIVITY_DEDUP_FAILED");
    if ((count ?? 0) > 0) return true;
  }

  return false;
}

export async function insertUserActivityEvent(args: {
  client: SupabaseClientLike;
  userId: string;
  activity_type: UserActivityType;
  title: string;
  description?: string | null;
  xp_awarded?: number;
  quest_id?: string | null;
  location_id?: string | null;
  qr_code_id?: string | null;
  post_id?: string | null;
  memory_id?: string | null;
  metadata?: Record<string, unknown>;
  skipDedup?: boolean;
}): Promise<UserActivityEventRow | null> {
  const title = args.title.trim();
  if (!title) return null;

  if (!args.skipDedup) {
    const duplicate = await hasRecentDuplicate({
      client: args.client,
      userId: args.userId,
      qrCodeId: args.qr_code_id,
      questId: args.quest_id,
      activityType: args.activity_type,
    });
    if (duplicate) return null;
  }

  const { data, error } = await args.client
    .from("user_activity_events")
    .insert({
      user_id: args.userId,
      activity_type: args.activity_type,
      title,
      description: args.description ?? null,
      xp_awarded: Math.max(0, args.xp_awarded ?? 0),
      quest_id: args.quest_id ?? null,
      location_id: args.location_id ?? null,
      qr_code_id: args.qr_code_id ?? null,
      post_id: args.post_id ?? null,
      memory_id: args.memory_id ?? null,
      metadata: args.metadata ?? {},
    })
    .select("*")
    .single();

  if (error) {
    throw new ApiError(500, error.message, "ACTIVITY_INSERT_FAILED");
  }

  return data as UserActivityEventRow;
}

export async function recordQrScanActivityEvent(args: {
  client: SupabaseClientLike;
  userId: string;
  questCompleted: { questId: string; questName: string; xpReward: number } | null;
  locationName: string | null;
  qrTitle: string;
  totalXpAwarded: number;
  qrCodeId: string;
  questId?: string | null;
  locationId?: string | null;
}): Promise<UserActivityEventRow | null> {
  const payload = buildQrScanActivityEvent(args);
  return insertUserActivityEvent({
    client: args.client,
    userId: args.userId,
    ...payload,
  });
}

export async function listUserActivityFeed(args: {
  client: SupabaseClientLike;
  userId: string;
  limit?: number;
}): Promise<UserActivityEventRow[]> {
  const limit = Math.min(100, Math.max(1, args.limit ?? 50));

  const { data: events, error: eventsError } = await args.client
    .from("user_activity_events")
    .select("*")
    .eq("user_id", args.userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (eventsError) {
    throw new ApiError(500, eventsError.message, "ACTIVITY_FEED_FAILED");
  }

  const rows = (events ?? []) as UserActivityEventRow[];

  const { data: posts, error: postsError } = await args.client
    .from("quad_posts")
    .select("id, body, created_at")
    .eq("user_id", args.userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(20, limit));

  if (postsError) {
    throw new ApiError(500, postsError.message, "ACTIVITY_FEED_FAILED");
  }

  const postEvents: UserActivityEventRow[] = (posts ?? []).map((post) => ({
    id: `post-${post.id}`,
    user_id: args.userId,
    activity_type: "post_created",
    title: "Posted on The Quad",
    description: typeof post.body === "string" && post.body.trim() ? post.body.trim().slice(0, 120) : null,
    xp_awarded: 0,
    quest_id: null,
    location_id: null,
    qr_code_id: null,
    post_id: post.id as string,
    memory_id: null,
    metadata: {},
    created_at: post.created_at as string,
  }));

  const { data: memories, error: memoriesError } = await args.client
    .from("campus_memories")
    .select("id, location_name, body, created_at")
    .eq("user_id", args.userId)
    .eq("saved_to_profile", true)
    .order("created_at", { ascending: false })
    .limit(Math.min(20, limit));

  if (memoriesError) {
    throw new ApiError(500, memoriesError.message, "ACTIVITY_FEED_FAILED");
  }

  const memoryEvents: UserActivityEventRow[] = (memories ?? []).map((memory) => ({
    id: `memory-${memory.id}`,
    user_id: args.userId,
    activity_type: "memory_saved",
    title: memory.location_name
      ? `Saved a memory at ${memory.location_name}`
      : "Saved a campus memory",
    description:
      typeof memory.body === "string" && memory.body.trim() ? memory.body.trim().slice(0, 120) : null,
    xp_awarded: 0,
    quest_id: null,
    location_id: null,
    qr_code_id: null,
    post_id: null,
    memory_id: memory.id as string,
    metadata: { location_name: memory.location_name },
    created_at: memory.created_at as string,
  }));

  return [...rows, ...postEvents, ...memoryEvents]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}
