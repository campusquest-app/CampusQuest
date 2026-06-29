import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";
import { addXpInternal } from "@/lib/server/services";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CampusMemoryReactionMeta = {
  likeCount: number;
  likedByMe: boolean;
  starCount: number;
  starredByMe: boolean;
};

const EMPTY_REACTIONS: CampusMemoryReactionMeta = {
  likeCount: 0,
  likedByMe: false,
  starCount: 0,
  starredByMe: false,
};

function isMissingReactionsTable(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST204") return true;
  const msg = (error.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("could not find");
}

export async function loadCampusMemoryReactionMeta(args: {
  userClient: SupabaseClient;
  userId: string;
  memoryIds: string[];
}): Promise<Map<string, CampusMemoryReactionMeta>> {
  const result = new Map<string, CampusMemoryReactionMeta>();
  for (const id of args.memoryIds) result.set(id, { ...EMPTY_REACTIONS });

  if (args.memoryIds.length === 0) return result;

  const [likesRes, starsRes, myLikesRes, myStarsRes] = await Promise.all([
    args.userClient.from("campus_memory_likes").select("memory_id").in("memory_id", args.memoryIds),
    args.userClient.from("campus_memory_stars").select("memory_id").in("memory_id", args.memoryIds),
    args.userClient
      .from("campus_memory_likes")
      .select("memory_id")
      .eq("user_id", args.userId)
      .in("memory_id", args.memoryIds),
    args.userClient
      .from("campus_memory_stars")
      .select("memory_id")
      .eq("user_id", args.userId)
      .in("memory_id", args.memoryIds),
  ]);

  if (
    isMissingReactionsTable(likesRes.error)
    || isMissingReactionsTable(starsRes.error)
    || isMissingReactionsTable(myLikesRes.error)
    || isMissingReactionsTable(myStarsRes.error)
  ) {
    return result;
  }

  if (likesRes.error || starsRes.error || myLikesRes.error || myStarsRes.error) {
    throw new ApiError(500, "Could not load memory reactions.", "CAMPUS_MEMORY_REACTIONS_FAILED");
  }

  const likeCounts = new Map<string, number>();
  for (const row of likesRes.data ?? []) {
    const id = row.memory_id as string;
    likeCounts.set(id, (likeCounts.get(id) ?? 0) + 1);
  }

  const starCounts = new Map<string, number>();
  for (const row of starsRes.data ?? []) {
    const id = row.memory_id as string;
    starCounts.set(id, (starCounts.get(id) ?? 0) + 1);
  }

  const myLikes = new Set((myLikesRes.data ?? []).map((row) => row.memory_id as string));
  const myStars = new Set((myStarsRes.data ?? []).map((row) => row.memory_id as string));

  for (const id of args.memoryIds) {
    result.set(id, {
      likeCount: likeCounts.get(id) ?? 0,
      likedByMe: myLikes.has(id),
      starCount: starCounts.get(id) ?? 0,
      starredByMe: myStars.has(id),
    });
  }

  return result;
}

async function assertMemoryVisible(
  userClient: SupabaseClient,
  memoryId: string,
): Promise<{ id: string; user_id: string }> {
  const { data, error } = await userClient
    .from("campus_memories")
    .select("id, user_id")
    .eq("id", memoryId)
    .in("visibility", ["public", "campus"])
    .maybeSingle();

  if (error) {
    throw new ApiError(500, "Could not load memory.", "CAMPUS_MEMORY_FETCH_FAILED");
  }
  if (!data) {
    throw new ApiError(404, "Memory not found.", "CAMPUS_MEMORY_NOT_FOUND");
  }
  return data;
}

export async function starCampusMemory(args: {
  userClient: SupabaseClient;
  userId: string;
  memoryId: string;
}): Promise<CampusMemoryReactionMeta & { xpAwarded: boolean; xpAmount: number }> {
  await assertMemoryVisible(args.userClient, args.memoryId);

  const { error: insertError } = await args.userClient.from("campus_memory_stars").insert({
    memory_id: args.memoryId,
    user_id: args.userId,
  });

  let xpAwarded = false;
  if (!insertError) {
    const admin = createAdminClient();
    await addXpInternal({
      userClient: admin,
      userId: args.userId,
      amount: 1,
      sourceType: "campus_memory_star",
      sourceId: args.memoryId,
      note: "Starred a campus Memory",
    });
    xpAwarded = true;
  } else if (insertError.code === "23505") {
    // Already starred — idempotent, no duplicate XP.
  } else if (isMissingReactionsTable(insertError)) {
    throw new ApiError(503, "Memory stars aren't available yet.", "CAMPUS_MEMORY_STARS_NOT_READY");
  } else {
    throw new ApiError(400, insertError.message ?? "Could not star memory.", "CAMPUS_MEMORY_STAR_FAILED");
  }

  const meta = await loadCampusMemoryReactionMeta({
    userClient: args.userClient,
    userId: args.userId,
    memoryIds: [args.memoryId],
  });
  const reactions = meta.get(args.memoryId) ?? EMPTY_REACTIONS;

  return {
    ...reactions,
    starredByMe: true,
    xpAwarded,
    xpAmount: xpAwarded ? 1 : 0,
  };
}

export async function toggleCampusMemoryLike(args: {
  userClient: SupabaseClient;
  userId: string;
  memoryId: string;
}): Promise<CampusMemoryReactionMeta> {
  await assertMemoryVisible(args.userClient, args.memoryId);

  const { data: existing, error: lookupError } = await args.userClient
    .from("campus_memory_likes")
    .select("id")
    .eq("memory_id", args.memoryId)
    .eq("user_id", args.userId)
    .maybeSingle();

  if (lookupError) {
    if (isMissingReactionsTable(lookupError)) {
      throw new ApiError(503, "Memory likes aren't available yet.", "CAMPUS_MEMORY_LIKES_NOT_READY");
    }
    throw new ApiError(500, "Could not load like state.", "CAMPUS_MEMORY_LIKE_LOOKUP_FAILED");
  }

  if (existing?.id) {
    const { error: deleteError } = await args.userClient
      .from("campus_memory_likes")
      .delete()
      .eq("id", existing.id);
    if (deleteError) {
      throw new ApiError(400, deleteError.message ?? "Could not unlike memory.", "CAMPUS_MEMORY_UNLIKE_FAILED");
    }
  } else {
    const { error: insertError } = await args.userClient.from("campus_memory_likes").insert({
      memory_id: args.memoryId,
      user_id: args.userId,
    });
    if (insertError) {
      if (insertError.code === "23505") {
        // Race: treat as liked.
      } else if (isMissingReactionsTable(insertError)) {
        throw new ApiError(503, "Memory likes aren't available yet.", "CAMPUS_MEMORY_LIKES_NOT_READY");
      } else {
        throw new ApiError(400, insertError.message ?? "Could not like memory.", "CAMPUS_MEMORY_LIKE_FAILED");
      }
    }
  }

  const meta = await loadCampusMemoryReactionMeta({
    userClient: args.userClient,
    userId: args.userId,
    memoryIds: [args.memoryId],
  });
  return meta.get(args.memoryId) ?? EMPTY_REACTIONS;
}
