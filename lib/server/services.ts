import { User } from "@supabase/supabase-js";
import { ApiError } from "@/lib/server/http";
import {
  calculateActivityXp,
  calculateBossDamage,
  calculateLevelProgression,
  rollLootDrop,
  updateStreak,
} from "@/lib/server/gameplay";
import { createAdminClient } from "@/lib/server/supabase";
import { assertModerationSafeText, assertSafeMinutes, assertSafeXpGrant } from "@/lib/server/security";
import type { PlayerProgressSnapshot } from "@/lib/server/types";

type SupabaseClientLike = ReturnType<typeof createAdminClient>;

type AddXpArgs = {
  userClient: SupabaseClientLike;
  userId: string;
  amount: number;
  sourceType: "activity" | "quest" | "boss" | "guild" | "manual" | "streak_bonus";
  sourceId?: string;
  questCompletionId?: string;
  activityId?: string;
  note?: string;
};

export async function createUserProfile(userClient: SupabaseClientLike, user: User, input: {
  username: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  campus?: string;
  classYear?: number;
}) {
  const profilePayload = {
    id: user.id,
    username: input.username,
    display_name: input.displayName,
    bio: input.bio ?? "",
    avatar_url: input.avatarUrl ?? null,
    campus: input.campus ?? null,
    class_year: input.classYear ?? null,
  };

  const { data: profile, error: profileError } = await userClient
    .from("profiles")
    .insert(profilePayload)
    .select("*")
    .single();
  if (profileError) throw new ApiError(400, profileError.message, "PROFILE_CREATE_FAILED");

  const { error: statsError } = await userClient.from("user_stats").insert({
    user_id: user.id,
    level: 1,
    total_xp: 0,
    strength: 0,
    stamina: 0,
    knowledge: 0,
    social: 0,
    focus: 0,
  });
  if (statsError) throw new ApiError(400, statsError.message, "STATS_CREATE_FAILED");

  return profile;
}

export async function updateProfile(userClient: SupabaseClientLike, userId: string, input: {
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  campus?: string;
  classYear?: number;
}) {
  const { data, error } = await userClient
    .from("profiles")
    .update({
      display_name: input.displayName,
      bio: input.bio,
      avatar_url: input.avatarUrl,
      campus: input.campus,
      class_year: input.classYear,
    })
    .eq("id", userId)
    .select("*")
    .single();
  if (error) throw new ApiError(400, error.message, "PROFILE_UPDATE_FAILED");
  return data;
}

export async function addXp(args: AddXpArgs) {
  const { userClient, userId, amount, sourceType, sourceId, questCompletionId, activityId, note } = args;
  assertSafeXpGrant(sourceType, amount);
  return addXpInternal({
    userClient,
    userId,
    amount,
    sourceType,
    sourceId,
    questCompletionId,
    activityId,
    note,
  });
}

export async function logActivity(args: {
  userClient: SupabaseClientLike;
  userId: string;
  activityId: string;
  minutes?: number;
}) {
  const { userClient, userId, activityId, minutes } = args;
  assertSafeMinutes(minutes);

  const { data: activity, error: activityError } = await userClient
    .from("activities")
    .select("id, base_xp, stat_key")
    .eq("id", activityId)
    .single();
  if (activityError || !activity) {
    throw new ApiError(404, "Activity not found.", "ACTIVITY_NOT_FOUND");
  }

  const { data: profile, error: profileError } = await userClient
    .from("profiles")
    .select("streak_days, last_activity_date")
    .eq("id", userId)
    .single();
  if (profileError || !profile) {
    throw new ApiError(404, "Profile not found.", "PROFILE_NOT_FOUND");
  }

  const streakUpdate = updateStreak(profile.last_activity_date);
  let nextStreakDays = profile.streak_days;
  if (streakUpdate.streakDays === "increment") nextStreakDays += 1;
  else if (typeof streakUpdate.streakDays === "number") nextStreakDays = streakUpdate.streakDays;

  const xpAmount = calculateActivityXp(activity.base_xp, nextStreakDays, minutes ?? 0);
  assertSafeXpGrant("activity", xpAmount);

  const { data: recentActivityCount, count: recentCount, error: recentActivityError } = await userClient
    .from("xp_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("source_type", "activity")
    .gte("created_at", new Date(Date.now() - 15_000).toISOString());
  void recentActivityCount;
  if (recentActivityError) {
    throw new ApiError(400, recentActivityError.message, "ACTIVITY_FLOOD_CHECK_FAILED");
  }
  if ((recentCount ?? 0) >= 3) {
    throw new ApiError(429, "Activity logging rate too high.", "ACTIVITY_RATE_LIMITED");
  }

  const { data: stats, error: statsError } = await userClient
    .from("user_stats")
    .select("strength, stamina, knowledge, social, focus")
    .eq("user_id", userId)
    .single();
  if (statsError || !stats) {
    throw new ApiError(404, "User stats not found.", "STATS_NOT_FOUND");
  }

  const statKey = activity.stat_key as "strength" | "stamina" | "knowledge" | "social" | "focus";
  const gain = Math.max(1, Math.floor(xpAmount / 20));
  const nextStats = { ...stats, [statKey]: Number(stats[statKey] ?? 0) + gain };

  const { error: statUpdateError } = await userClient
    .from("user_stats")
    .update(nextStats)
    .eq("user_id", userId);
  if (statUpdateError) throw new ApiError(400, statUpdateError.message, "STATS_UPDATE_FAILED");

  const xpResult = await addXpInternal({
    userClient,
    userId,
    amount: xpAmount,
    sourceType: "activity",
    activityId,
    note: minutes ? `Logged ${minutes} minutes` : "Logged activity",
  });

  const { error: profileUpdateError } = await userClient
    .from("profiles")
    .update({
      streak_days: nextStreakDays,
      last_activity_date: streakUpdate.lastActivityDate,
    })
    .eq("id", userId);
  if (profileUpdateError) throw new ApiError(400, profileUpdateError.message, "STREAK_UPDATE_FAILED");

  return {
    ...xpResult,
    streakDays: nextStreakDays,
    statGains: { [statKey]: gain },
  };
}

export async function completeQuest(args: {
  userClient: SupabaseClientLike;
  userId: string;
  userQuestId: string;
}) {
  const { userClient, userId, userQuestId } = args;
  const { data: userQuest, error: uqError } = await userClient
    .from("user_quests")
    .select("id, quest_id, progress_count, status")
    .eq("id", userQuestId)
    .eq("user_id", userId)
    .single();
  if (uqError || !userQuest) throw new ApiError(404, "User quest not found.", "USER_QUEST_NOT_FOUND");

  const { data: quest, error: questError } = await userClient
    .from("quests")
    .select("id, target_count, xp_reward, is_repeatable")
    .eq("id", userQuest.quest_id)
    .single();
  if (questError || !quest) throw new ApiError(404, "Quest not found.", "QUEST_NOT_FOUND");

  if (userQuest.progress_count < quest.target_count) {
    throw new ApiError(409, "Quest progress is not complete yet.", "QUEST_INCOMPLETE");
  }

  if (userQuest.status === "claimed") {
    throw new ApiError(409, "Quest already claimed.", "QUEST_ALREADY_CLAIMED");
  }

  const { data: existingForUserQuest } = await userClient
    .from("quest_completions")
    .select("id")
    .eq("user_quest_id", userQuest.id)
    .maybeSingle();
  if (existingForUserQuest) {
    throw new ApiError(409, "Quest completion already exists for this assignment.", "QUEST_ALREADY_COMPLETED");
  }

  if (!quest.is_repeatable) {
    const { count: previousCompletionCount, error: previousCompletionError } = await userClient
      .from("quest_completions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("quest_id", quest.id);
    if (previousCompletionError) {
      throw new ApiError(400, previousCompletionError.message, "QUEST_COMPLETION_CHECK_FAILED");
    }
    if ((previousCompletionCount ?? 0) > 0) {
      throw new ApiError(409, "This quest can only be completed once.", "QUEST_NON_REPEATABLE");
    }
  }

  const { data: completion, error: completionError } = await userClient
    .from("quest_completions")
    .insert({
      user_id: userId,
      quest_id: quest.id,
      user_quest_id: userQuest.id,
      xp_awarded: quest.xp_reward,
    })
    .select("*")
    .single();
  if (completionError) throw new ApiError(400, completionError.message, "QUEST_COMPLETION_FAILED");

  const { error: updateError } = await userClient
    .from("user_quests")
    .update({ status: "claimed", completed_at: new Date().toISOString() })
    .eq("id", userQuestId)
    .eq("user_id", userId);
  if (updateError) throw new ApiError(400, updateError.message, "USER_QUEST_UPDATE_FAILED");

  const xp = await addXpInternal({
    userClient,
    userId,
    amount: quest.xp_reward,
    sourceType: "quest",
    sourceId: completion.id,
    questCompletionId: completion.id,
    note: "Quest completion reward",
  });

  const { data: currentStats, error: currentStatsError } = await userClient
    .from("user_stats")
    .select("quests_completed")
    .eq("user_id", userId)
    .single();
  if (currentStatsError) throw new ApiError(400, currentStatsError.message, "STATS_FETCH_FAILED");
  const nextQuestCount = Number(currentStats?.quests_completed ?? 0) + 1;
  const { error: statsError } = await userClient
    .from("user_stats")
    .update({ quests_completed: nextQuestCount })
    .eq("user_id", userId);
  if (statsError) throw new ApiError(400, statsError.message, "STATS_QUEST_INCREMENT_FAILED");

  const streak = await updatePlayerStreakOnQuest(userClient, userId);
  const snapshot = await getPlayerProgressSnapshot(userClient, userId);

  return { completion, xp, streak, player: snapshot };
}

export async function scanQrQuest(args: {
  userClient: SupabaseClientLike;
  userId: string;
  qrCode: string;
}) {
  const { userClient, userId, qrCode } = args;

  const logScan = async (payload: {
    status: "accepted" | "rejected" | "duplicate";
    questLocationId?: string | null;
    userQuestId?: string | null;
  }) => {
    await userClient.from("qr_scan_logs").insert({
      user_id: userId,
      quest_location_id: payload.questLocationId ?? null,
      user_quest_id: payload.userQuestId ?? null,
      scanned_token: qrCode,
      status: payload.status,
    });
  };

  const { data: location, error: locationError } = await userClient
    .from("quest_locations")
    .select("id, quest_id, is_active")
    .eq("qr_token", qrCode)
    .maybeSingle();

  if (locationError) {
    throw new ApiError(400, locationError.message, "QR_SCAN_LOOKUP_FAILED");
  }
  if (!location) {
    await logScan({ status: "rejected" });
    throw new ApiError(400, "QR code is invalid.", "INVALID_QR_CODE");
  }

  if (!location.is_active) {
    await logScan({ status: "rejected", questLocationId: location.id });
    throw new ApiError(409, "QR code is inactive.", "INACTIVE_QR_CODE");
  }

  const { data: quest, error: questError } = await userClient
    .from("quests")
    .select("id, is_active, target_count, ends_at")
    .eq("id", location.quest_id)
    .single();
  if (questError || !quest) {
    await logScan({ status: "rejected", questLocationId: location.id });
    throw new ApiError(404, "Quest linked to QR code was not found.", "QR_QUEST_NOT_FOUND");
  }

  if (!quest.is_active) {
    await logScan({ status: "rejected", questLocationId: location.id });
    throw new ApiError(409, "Quest linked to QR code is inactive.", "INACTIVE_QR_QUEST");
  }

  if (quest.ends_at && new Date(quest.ends_at).getTime() < Date.now()) {
    await logScan({ status: "rejected", questLocationId: location.id });
    throw new ApiError(409, "QR quest is expired.", "EXPIRED_QR_CODE");
  }

  const { data: duplicateScan } = await userClient
    .from("qr_scan_logs")
    .select("id")
    .eq("user_id", userId)
    .eq("quest_location_id", location.id)
    .limit(1)
    .maybeSingle();

  if (duplicateScan) {
    await logScan({ status: "duplicate", questLocationId: location.id });
    throw new ApiError(409, "QR code was already used by this user.", "ALREADY_USED_QR_CODE");
  }

  const { data: userQuest, error: userQuestError } = await userClient
    .from("user_quests")
    .select("id, progress_count, status")
    .eq("user_id", userId)
    .eq("quest_id", quest.id)
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (userQuestError) {
    await logScan({ status: "rejected", questLocationId: location.id });
    throw new ApiError(400, userQuestError.message, "USER_QUEST_FETCH_FAILED");
  }
  if (!userQuest) {
    await logScan({ status: "rejected", questLocationId: location.id });
    throw new ApiError(404, "No active user quest is linked to this QR code.", "USER_QUEST_NOT_FOUND");
  }

  if (userQuest.status === "claimed") {
    await logScan({
      status: "duplicate",
      questLocationId: location.id,
      userQuestId: userQuest.id,
    });
    throw new ApiError(409, "Quest was already completed.", "QUEST_ALREADY_CLAIMED");
  }

  const targetCount = Number(quest.target_count ?? 1);
  const nextProgress = Math.max(Number(userQuest.progress_count ?? 0), targetCount);
  const { error: progressError } = await userClient
    .from("user_quests")
    .update({
      progress_count: nextProgress,
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", userQuest.id)
    .eq("user_id", userId);
  if (progressError) {
    await logScan({
      status: "rejected",
      questLocationId: location.id,
      userQuestId: userQuest.id,
    });
    throw new ApiError(400, progressError.message, "USER_QUEST_PROGRESS_UPDATE_FAILED");
  }

  const completionResult = await completeQuest({
    userClient,
    userId,
    userQuestId: userQuest.id,
  });

  await logScan({
    status: "accepted",
    questLocationId: location.id,
    userQuestId: userQuest.id,
  });

  return {
    qr: {
      status: "accepted",
      questLocationId: location.id,
      questId: quest.id,
    },
    quest: completionResult.completion,
    xp: completionResult.xp,
    streak: completionResult.streak,
    player: completionResult.player,
  };
}

export async function createProofUpload(args: {
  userClient: SupabaseClientLike;
  userId: string;
  extension: "jpg" | "jpeg" | "png" | "webp";
  contentType: "image/jpeg" | "image/png" | "image/webp";
  fileSizeBytes: number;
  questId: string;
  userQuestId: string;
}) {
  const { userClient, userId, extension, contentType, fileSizeBytes, questId, userQuestId } = args;
  const adminClient = createAdminClient();
  const fileName = `${crypto.randomUUID()}.${extension}`;
  const storagePath = `${userId}/quest-proofs/${userQuestId}/${fileName}`;

  const { data: userQuest, error: userQuestError } = await userClient
    .from("user_quests")
    .select("id, quest_id, status")
    .eq("id", userQuestId)
    .eq("user_id", userId)
    .single();
  if (userQuestError || !userQuest) {
    throw new ApiError(404, "User quest not found for proof submission.", "USER_QUEST_NOT_FOUND");
  }
  if (userQuest.quest_id !== questId) {
    throw new ApiError(400, "Proof quest mismatch.", "PROOF_QUEST_MISMATCH");
  }
  if (userQuest.status === "claimed") {
    throw new ApiError(409, "Quest already claimed.", "QUEST_ALREADY_CLAIMED");
  }

  const { data: pendingProof } = await userClient
    .from("proof_submissions")
    .select("id")
    .eq("user_id", userId)
    .eq("user_quest_id", userQuestId)
    .eq("status", "pending")
    .maybeSingle();
  if (pendingProof) {
    throw new ApiError(409, "Pending proof already exists for this quest.", "PENDING_PROOF_EXISTS");
  }

  const { data: signedUpload, error: signedUploadError } = await adminClient.storage
    .from("proof-images")
    .createSignedUploadUrl(storagePath);
  if (signedUploadError || !signedUpload) {
    throw new ApiError(400, signedUploadError?.message ?? "Failed to create upload URL.", "PROOF_SIGN_URL_FAILED");
  }

  const { data: submission, error: submissionError } = await userClient
    .from("proof_submissions")
    .insert({
      user_id: userId,
      quest_id: questId,
      user_quest_id: userQuestId,
      storage_path: storagePath,
      mime_type: contentType,
      file_size_bytes: fileSizeBytes,
      status: "pending",
    })
    .select("*")
    .single();
  if (submissionError) throw new ApiError(400, submissionError.message, "PROOF_SUBMISSION_CREATE_FAILED");

  return {
    upload: {
      signedUrl: signedUpload.signedUrl,
      token: signedUpload.token,
      path: storagePath,
      contentType,
    },
    submission,
  };
}

export async function fetchActiveUserQuests(args: {
  userClient: SupabaseClientLike;
  userId: string;
  limit: number;
}) {
  const { userClient, userId, limit } = args;
  const safeLimit = Math.max(1, Math.min(20, Number(limit) || 5));

  const { data, error } = await userClient
    .from("user_quests")
    .select("id, quest_id, progress_count, status, started_at, updated_at, quests(id, title, description, xp_reward, target_count, is_active)")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(safeLimit);
  if (error) throw new ApiError(400, error.message, "ACTIVE_QUESTS_FETCH_FAILED");

  return (data ?? [])
    .map((row: any) => ({
      id: row.id,
      quest_id: row.quest_id,
      progress_count: Number(row.progress_count ?? 0),
      status: row.status,
      started_at: row.started_at,
      updated_at: row.updated_at,
      quest: Array.isArray(row.quests) ? row.quests[0] ?? null : row.quests ?? null,
    }))
    .filter((row) => row.quest?.is_active !== false);
}

export async function reviewProofSubmission(args: {
  submissionId: string;
  decision: "approved" | "rejected";
  reviewNote?: string;
  reviewerUserId?: string;
}) {
  const { submissionId, decision, reviewNote, reviewerUserId } = args;
  const adminClient = createAdminClient();

  const { data: submission, error: submissionError } = await adminClient
    .from("proof_submissions")
    .select("id, user_id, quest_id, user_quest_id, status, storage_path")
    .eq("id", submissionId)
    .single();
  if (submissionError || !submission) {
    throw new ApiError(404, "Proof submission not found.", "PROOF_SUBMISSION_NOT_FOUND");
  }
  if (submission.status !== "pending") {
    throw new ApiError(409, "Proof submission already reviewed.", "PROOF_ALREADY_REVIEWED");
  }
  if (reviewerUserId && reviewerUserId === submission.user_id) {
    throw new ApiError(403, "Users cannot approve their own proof.", "SELF_APPROVAL_FORBIDDEN");
  }

  if (decision === "rejected") {
    const { data: rejected, error: rejectedError } = await adminClient
      .from("proof_submissions")
      .update({
        status: "rejected",
        review_note: reviewNote ?? null,
        reviewed_by: reviewerUserId ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", submissionId)
      .select("*")
      .single();
    if (rejectedError) throw new ApiError(400, rejectedError.message, "PROOF_REJECT_FAILED");
    return {
      proof: rejected,
      quest: null,
      xp: null,
      player: null,
      image: null,
    };
  }

  if (!submission.user_quest_id || !submission.quest_id) {
    throw new ApiError(400, "Submission is missing quest linkage.", "PROOF_MISSING_QUEST_LINK");
  }

  const { data: quest, error: questError } = await adminClient
    .from("quests")
    .select("target_count")
    .eq("id", submission.quest_id)
    .single();
  if (questError || !quest) {
    throw new ApiError(404, "Linked quest not found for proof approval.", "PROOF_QUEST_NOT_FOUND");
  }

  const { error: progressError } = await adminClient
    .from("user_quests")
    .update({
      progress_count: Number(quest.target_count ?? 1),
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", submission.user_quest_id)
    .eq("user_id", submission.user_id);
  if (progressError) {
    throw new ApiError(400, progressError.message, "PROOF_QUEST_PROGRESS_UPDATE_FAILED");
  }

  const completion = await completeQuest({
    userClient: adminClient,
    userId: submission.user_id,
    userQuestId: submission.user_quest_id,
  });

  const { data: approved, error: approvedError } = await adminClient
    .from("proof_submissions")
    .update({
      status: "approved",
      review_note: reviewNote ?? null,
      reviewed_by: reviewerUserId ?? null,
      reviewed_at: new Date().toISOString(),
      quest_completion_id: completion.completion.id,
    })
    .eq("id", submission.id)
    .select("*")
    .single();
  if (approvedError) throw new ApiError(400, approvedError.message, "PROOF_APPROVE_FAILED");

  const { data: signedUrlData } = await adminClient.storage
    .from("proof-images")
    .createSignedUrl(submission.storage_path, 60 * 60);

  return {
    proof: approved,
    quest: completion.completion,
    xp: completion.xp,
    player: completion.player,
    image: signedUrlData?.signedUrl ?? null,
  };
}

export async function listMyProofSubmissions(args: {
  userClient: SupabaseClientLike;
  userId: string;
  limit: number;
  offset: number;
}) {
  const { userClient, userId, limit, offset } = args;
  const adminClient = createAdminClient();

  const { data: rows, error } = await userClient
    .from("proof_submissions")
    .select("id, quest_id, user_quest_id, status, review_note, created_at, updated_at, storage_path, quests(title)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) {
    throw new ApiError(400, error.message, "PROOF_SUBMISSIONS_LIST_FAILED");
  }

  const submissions = await Promise.all(
    (rows ?? []).map(async (row: any) => {
      let signedImageUrl: string | null = null;
      if (row.storage_path) {
        const { data } = await adminClient.storage
          .from("proof-images")
          .createSignedUrl(row.storage_path, 10 * 60);
        signedImageUrl = data?.signedUrl ?? null;
      }

      return {
        id: row.id,
        quest_id: row.quest_id,
        user_quest_id: row.user_quest_id,
        status: row.status,
        review_note: row.review_note,
        created_at: row.created_at,
        updated_at: row.updated_at,
        quest_title: Array.isArray(row.quests) ? row.quests[0]?.title ?? null : row.quests?.title ?? null,
        image_url: signedImageUrl,
      };
    }),
  );

  return submissions;
}

export async function joinGuild(args: {
  userClient: SupabaseClientLike;
  userId: string;
  guildId: string;
}) {
  const { userClient, userId, guildId } = args;
  const adminClient = createAdminClient();

  const { data: guild, error: guildError } = await userClient
    .from("guilds")
    .select("id, owner_id")
    .eq("id", guildId)
    .single();
  if (guildError || !guild) throw new ApiError(404, "Guild not found.", "GUILD_NOT_FOUND");

  const { data: membership } = await userClient
    .from("guild_members")
    .select("guild_id")
    .eq("user_id", userId)
    .eq("guild_id", guildId)
    .maybeSingle();
  if (membership) throw new ApiError(409, "Already a guild member.", "ALREADY_GUILD_MEMBER");

  const { error: insertMembershipError } = await userClient.from("guild_members").insert({
    guild_id: guildId,
    user_id: userId,
    role: guild.owner_id === userId ? "owner" : "member",
  });
  if (insertMembershipError) throw new ApiError(400, insertMembershipError.message, "GUILD_JOIN_FAILED");

  const { error: profileUpdateError } = await userClient
    .from("profiles")
    .update({ guild_id: guildId })
    .eq("id", userId);
  if (profileUpdateError) throw new ApiError(400, profileUpdateError.message, "PROFILE_GUILD_UPDATE_FAILED");

  const { data: guildCurrent, error: guildCurrentError } = await adminClient
    .from("guilds")
    .select("member_count")
    .eq("id", guildId)
    .single();
  if (!guildCurrentError && guildCurrent) {
    await adminClient
      .from("guilds")
      .update({ member_count: Math.max(1, Number(guildCurrent.member_count ?? 1) + 1) })
      .eq("id", guildId);
  }

  return { joined: true, guildId };
}

export async function createGuild(args: {
  userClient: SupabaseClientLike;
  userId: string;
  name: string;
  description?: string;
  isPublic?: boolean;
}) {
  const { userClient, userId, name, description, isPublic = true } = args;

  const { data: existingMembership } = await userClient
    .from("guild_members")
    .select("guild_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (existingMembership) {
    throw new ApiError(409, "User is already in a guild.", "ALREADY_IN_GUILD");
  }

  const { data: guild, error: guildError } = await userClient
    .from("guilds")
    .insert({
      name,
      description: description ?? "",
      owner_id: userId,
      is_public: isPublic,
      total_xp: 0,
      member_count: 1,
    })
    .select("*")
    .single();
  if (guildError || !guild) {
    throw new ApiError(400, guildError?.message ?? "Guild creation failed.", "GUILD_CREATE_FAILED");
  }

  const { error: memberError } = await userClient.from("guild_members").insert({
    guild_id: guild.id,
    user_id: userId,
    role: "owner",
  });
  if (memberError) throw new ApiError(400, memberError.message, "GUILD_MEMBER_CREATE_FAILED");

  await userClient.from("profiles").update({ guild_id: guild.id }).eq("id", userId);

  return guild;
}

export async function listGuilds(userClient: SupabaseClientLike) {
  const { data: guilds, error } = await userClient
    .from("guilds")
    .select("id, name, description, total_xp, member_count, is_public, created_at")
    .eq("is_public", true)
    .order("total_xp", { ascending: false })
    .limit(100);
  if (error) throw new ApiError(400, error.message, "GUILD_LIST_FAILED");

  return (guilds ?? []).map((guild, index) => ({
    rank: index + 1,
    ...guild,
  }));
}

export async function getMyGuild(userClient: SupabaseClientLike, userId: string) {
  const { data: profile, error: profileError } = await userClient
    .from("profiles")
    .select("guild_id")
    .eq("id", userId)
    .single();
  if (profileError) throw new ApiError(400, profileError.message, "PROFILE_FETCH_FAILED");
  if (!profile?.guild_id) {
    throw new ApiError(404, "User is not in a guild.", "GUILD_NOT_FOUND");
  }

  const guildId = profile.guild_id;
  const [{ data: guild, error: guildError }, { data: members, error: membersError }] = await Promise.all([
    userClient
      .from("guilds")
      .select("id, name, description, total_xp, member_count, owner_id, is_public, created_at")
      .eq("id", guildId)
      .single(),
    userClient.from("guild_members").select("user_id, role, joined_at").eq("guild_id", guildId),
  ]);

  if (guildError || !guild) throw new ApiError(404, guildError?.message ?? "Guild not found.", "GUILD_NOT_FOUND");
  if (membersError) throw new ApiError(400, membersError.message, "GUILD_MEMBERS_FETCH_FAILED");

  const userIds = (members ?? []).map((m) => m.user_id);
  const [{ data: profiles }, { data: stats }] = await Promise.all([
    userClient.from("profiles").select("id, username, display_name, avatar_url").in("id", userIds),
    userClient.from("user_stats").select("user_id, level, total_xp").in("user_id", userIds),
  ]);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const statsMap = new Map((stats ?? []).map((s) => [s.user_id, s]));

  const memberLeaderboard = (members ?? [])
    .map((member) => {
      const p = profileMap.get(member.user_id);
      const s = statsMap.get(member.user_id);
      return {
        user_id: member.user_id,
        role: member.role,
        joined_at: member.joined_at,
        username: p?.username ?? null,
        display_name: p?.display_name ?? null,
        avatar_url: p?.avatar_url ?? null,
        level: Number(s?.level ?? 1),
        total_xp: Number(s?.total_xp ?? 0),
      };
    })
    .sort((a, b) => b.total_xp - a.total_xp)
    .map((member, index) => ({ rank: index + 1, ...member }));

  return {
    guild,
    members: memberLeaderboard,
  };
}

export async function createPost(args: {
  userClient: SupabaseClientLike;
  userId: string;
  body: string;
  imageUrl?: string;
}) {
  const { userClient, userId, body, imageUrl } = args;
  assertModerationSafeText({ text: body, field: "post", maxLen: 500 });
  const { data, error } = await userClient
    .from("posts")
    .insert({ user_id: userId, body, image_url: imageUrl ?? null })
    .select("*")
    .single();
  if (error) throw new ApiError(400, error.message, "POST_CREATE_FAILED");
  return data;
}

export async function addComment(args: {
  userClient: SupabaseClientLike;
  userId: string;
  postId: string;
  body: string;
}) {
  const { userClient, userId, postId, body } = args;
  assertModerationSafeText({ text: body, field: "comment", maxLen: 300 });
  const adminClient = createAdminClient();
  const { data: comment, error } = await userClient
    .from("comments")
    .insert({ post_id: postId, user_id: userId, body })
    .select("*")
    .single();
  if (error) throw new ApiError(400, error.message, "COMMENT_CREATE_FAILED");

  await syncPostCounts(adminClient, postId);
  return comment;
}

export async function listFeedPosts(args: {
  userClient: SupabaseClientLike;
  userId: string;
  limit: number;
  offset: number;
}) {
  const { userClient, userId, limit, offset } = args;
  const { data: posts, error: postsError } = await userClient
    .from("posts")
    .select("id, user_id, body, image_url, likes_count, comments_count, created_at, updated_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (postsError) throw new ApiError(400, postsError.message, "FEED_FETCH_FAILED");

  const postIds = (posts ?? []).map((p: any) => p.id);
  const authorIds = (posts ?? []).map((p: any) => p.user_id);
  const [{ data: authors }, { data: myLikes }] = await Promise.all([
    authorIds.length > 0
      ? userClient.from("profiles").select("id, username, display_name, avatar_url").in("id", authorIds)
      : Promise.resolve({ data: [] as any[] }),
    postIds.length > 0
      ? userClient.from("likes").select("post_id").eq("user_id", userId).in("post_id", postIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const authorMap = new Map((authors ?? []).map((author: any) => [author.id, author]));
  const likedSet = new Set((myLikes ?? []).map((like: any) => like.post_id));

  return (posts ?? []).map((post: any) => {
    const author = authorMap.get(post.user_id);
    return {
      id: post.id,
      body: post.body,
      image_url: post.image_url,
      likes_count: post.likes_count,
      comments_count: post.comments_count,
      liked_by_me: likedSet.has(post.id),
      created_at: post.created_at,
      updated_at: post.updated_at,
      author: {
        id: author?.id ?? post.user_id,
        username: author?.username ?? null,
        display_name: author?.display_name ?? null,
        avatar_url: author?.avatar_url ?? null,
      },
    };
  });
}

export async function listPostComments(args: {
  userClient: SupabaseClientLike;
  postId: string;
  limit: number;
  offset: number;
}) {
  const { userClient, postId, limit, offset } = args;

  const { data: postExists, error: postExistsError } = await userClient
    .from("posts")
    .select("id")
    .eq("id", postId)
    .maybeSingle();
  if (postExistsError) throw new ApiError(400, postExistsError.message, "POST_LOOKUP_FAILED");
  if (!postExists) throw new ApiError(404, "Post not found.", "POST_NOT_FOUND");

  const { data: comments, error: commentsError } = await userClient
    .from("comments")
    .select("id, post_id, user_id, body, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);
  if (commentsError) throw new ApiError(400, commentsError.message, "COMMENTS_FETCH_FAILED");

  const authorIds = (comments ?? []).map((c: any) => c.user_id);
  const { data: authors } =
    authorIds.length > 0
      ? await userClient.from("profiles").select("id, username, display_name, avatar_url").in("id", authorIds)
      : { data: [] as any[] };
  const authorMap = new Map((authors ?? []).map((author: any) => [author.id, author]));

  return (comments ?? []).map((comment: any) => {
    const author = authorMap.get(comment.user_id);
    return {
      id: comment.id,
      post_id: comment.post_id,
      body: comment.body,
      created_at: comment.created_at,
      author: {
        id: author?.id ?? comment.user_id,
        username: author?.username ?? null,
        display_name: author?.display_name ?? null,
        avatar_url: author?.avatar_url ?? null,
      },
    };
  });
}

export async function setPostLike(args: {
  userClient: SupabaseClientLike;
  userId: string;
  postId: string;
  liked: boolean;
}) {
  const { userClient, userId, postId, liked } = args;
  const adminClient = createAdminClient();
  if (liked) {
    const { error } = await userClient.from("likes").upsert({ post_id: postId, user_id: userId });
    if (error) throw new ApiError(400, error.message, "LIKE_CREATE_FAILED");
  } else {
    const { error } = await userClient.from("likes").delete().eq("post_id", postId).eq("user_id", userId);
    if (error) throw new ApiError(400, error.message, "LIKE_DELETE_FAILED");
  }

  await syncPostCounts(adminClient, postId);
  return { postId, liked };
}

export async function deleteOwnPost(args: {
  userClient: SupabaseClientLike;
  userId: string;
  postId: string;
}) {
  const { userClient, userId, postId } = args;
  const { data: deleted, error } = await userClient
    .from("posts")
    .delete()
    .eq("id", postId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) throw new ApiError(400, error.message, "POST_DELETE_FAILED");
  if (!deleted) throw new ApiError(404, "Post not found or not owned by user.", "POST_NOT_FOUND");
  return { deleted: true, postId };
}

export async function deleteOwnComment(args: {
  userClient: SupabaseClientLike;
  userId: string;
  commentId: string;
}) {
  const { userClient, userId, commentId } = args;
  const adminClient = createAdminClient();

  const { data: existing, error: existingError } = await userClient
    .from("comments")
    .select("id, post_id")
    .eq("id", commentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existingError) throw new ApiError(400, existingError.message, "COMMENT_LOOKUP_FAILED");
  if (!existing) throw new ApiError(404, "Comment not found or not owned by user.", "COMMENT_NOT_FOUND");

  const { error } = await userClient
    .from("comments")
    .delete()
    .eq("id", commentId)
    .eq("user_id", userId);
  if (error) throw new ApiError(400, error.message, "COMMENT_DELETE_FAILED");

  await syncPostCounts(adminClient, existing.post_id);
  return { deleted: true, commentId };
}

export async function startBossBattle(args: {
  userClient: SupabaseClientLike;
  userId: string;
  bossId: string;
}) {
  const { userClient, userId, bossId } = args;
  const { data: boss, error: bossError } = await userClient
    .from("bosses")
    .select("id, name, max_hp, xp_reward, min_level")
    .eq("id", bossId)
    .single();
  if (bossError || !boss) throw new ApiError(404, "Boss not found.", "BOSS_NOT_FOUND");

  const { data: stats, error: statsError } = await userClient
    .from("user_stats")
    .select("level")
    .eq("user_id", userId)
    .single();
  if (statsError || !stats) throw new ApiError(404, "User stats not found.", "STATS_NOT_FOUND");

  if (stats.level < boss.min_level) {
    throw new ApiError(403, `Requires level ${boss.min_level}.`, "BOSS_LEVEL_REQUIREMENT");
  }

  const [{ data: globalAttempts }, { data: userAttempts }] = await Promise.all([
    userClient.from("boss_attempts").select("damage").eq("boss_id", boss.id),
    userClient.from("boss_attempts").select("damage").eq("boss_id", boss.id).eq("user_id", userId),
  ]);
  const totalDamage = (globalAttempts ?? []).reduce((sum, row) => sum + Number(row.damage ?? 0), 0);
  const userDamage = (userAttempts ?? []).reduce((sum, row) => sum + Number(row.damage ?? 0), 0);
  const remainingHp = Math.max(0, boss.max_hp - totalDamage);

  return {
    boss,
    bossProgress: {
      bossId: boss.id,
      maxHp: boss.max_hp,
      totalDamage,
      remainingHp,
      defeated: remainingHp <= 0,
      userDamage,
    },
  };
}

export async function attemptBossBattle(args: {
  userClient: SupabaseClientLike;
  userId: string;
  bossId: string;
  activityId?: string;
  questCompletionId?: string;
}) {
  const { userClient, userId, bossId, activityId, questCompletionId } = args;
  const { data: boss, error: bossError } = await userClient
    .from("bosses")
    .select("id, name, max_hp, xp_reward")
    .eq("id", bossId)
    .single();
  if (bossError || !boss) throw new ApiError(404, "Boss not found.", "BOSS_NOT_FOUND");

  const { data: stats, error: statsError } = await userClient
    .from("user_stats")
    .select("level, strength, stamina, knowledge, social, focus, total_xp, bosses_defeated")
    .eq("user_id", userId)
    .single();
  if (statsError || !stats) throw new ApiError(404, "User stats not found.", "STATS_NOT_FOUND");

  let activityStat: "strength" | "stamina" | "knowledge" | "social" | "focus" | undefined;
  if (activityId) {
    const { data: activity } = await userClient.from("activities").select("stat_key").eq("id", activityId).single();
    activityStat = activity?.stat_key;
  }

  const [{ data: globalAttempts }, { data: userAttempts }] = await Promise.all([
    userClient.from("boss_attempts").select("damage").eq("boss_id", bossId),
    userClient.from("boss_attempts").select("damage").eq("boss_id", bossId).eq("user_id", userId),
  ]);
  const totalDamageBefore = (globalAttempts ?? []).reduce((sum, row) => sum + Number(row.damage ?? 0), 0);
  const userDamageBefore = (userAttempts ?? []).reduce((sum, row) => sum + Number(row.damage ?? 0), 0);
  const hpRemainingBefore = Math.max(0, boss.max_hp - totalDamageBefore);
  if (hpRemainingBefore <= 0) {
    throw new ApiError(409, "Boss already defeated.", "BOSS_ALREADY_DEFEATED");
  }

  let questXpBonus = 0;
  if (questCompletionId) {
    const { data: completion, error: completionError } = await userClient
      .from("quest_completions")
      .select("id, xp_awarded")
      .eq("id", questCompletionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (completionError) throw new ApiError(400, completionError.message, "QUEST_BONUS_LOOKUP_FAILED");
    if (!completion) throw new ApiError(404, "Quest completion not found for bonus damage.", "QUEST_BONUS_NOT_FOUND");
    questXpBonus = Math.floor(Number(completion.xp_awarded ?? 0) / 20);
  }

  const damageResult = calculateBossDamage({
    level: stats.level,
    stats: {
      strength: stats.strength,
      stamina: stats.stamina,
      knowledge: stats.knowledge,
      social: stats.social,
      focus: stats.focus,
    },
    activityStat,
  });

  const boostedDamage = damageResult.damage + questXpBonus;
  const appliedDamage = Math.min(hpRemainingBefore, boostedDamage);
  const hpRemainingAfter = Math.max(0, hpRemainingBefore - appliedDamage);
  const wasKillingBlow = hpRemainingAfter === 0;

  const { data: attempt, error: attemptError } = await userClient
    .from("boss_attempts")
    .insert({
      boss_id: bossId,
      user_id: userId,
      activity_id: activityId ?? null,
      damage: appliedDamage,
      was_killing_blow: wasKillingBlow,
    })
    .select("*")
    .single();
  if (attemptError) throw new ApiError(400, attemptError.message, "BOSS_ATTEMPT_FAILED");

  let xpResult: Awaited<ReturnType<typeof addXpInternal>> | null = null;
  let loot: { itemId: string; rarity: string } | null = null;
  let rewardEarned = false;
  if (wasKillingBlow) {
    const { data: existingReward } = await userClient
      .from("xp_logs")
      .select("id")
      .eq("user_id", userId)
      .eq("source_type", "boss")
      .eq("source_id", bossId)
      .maybeSingle();

    if (!existingReward) {
      assertSafeXpGrant("boss", boss.xp_reward);
      xpResult = await addXpInternal({
        userClient,
        userId,
        amount: boss.xp_reward,
        sourceType: "boss",
        sourceId: bossId,
        note: `Defeated ${boss.name}`,
      });
      rewardEarned = true;

      const lootRoll = rollLootDrop();
      if (lootRoll.dropped) {
        const { data: lootItem } = await userClient
          .from("items")
          .select("id, rarity")
          .eq("rarity", lootRoll.itemRarity)
          .eq("is_active", true)
          .limit(1);
        if (lootItem && lootItem.length > 0) {
          const itemId = lootItem[Math.floor(Math.random() * lootItem.length)].id;
          await addItemToInventory({ userClient, userId, itemId, quantity: 1 });
          loot = { itemId, rarity: lootRoll.itemRarity };
        }
      }

      const nextBossesDefeated = Number(stats.bosses_defeated ?? 0) + 1;
      await userClient.from("user_stats").update({ bosses_defeated: nextBossesDefeated }).eq("user_id", userId);
    }
  }

  const totalDamageAfter = totalDamageBefore + appliedDamage;
  const userDamageTotal = userDamageBefore + appliedDamage;
  const player = await getPlayerProgressSnapshot(userClient, userId);

  return {
    attempt,
    damage: appliedDamage,
    quest_xp_bonus_damage: questXpBonus,
    wasCritical: damageResult.wasCritical,
    bossProgress: {
      bossId: boss.id,
      maxHp: boss.max_hp,
      totalDamage: totalDamageAfter,
      remainingHp: hpRemainingAfter,
      defeated: wasKillingBlow,
      userDamage: userDamageTotal,
    },
    rewards: {
      earned: rewardEarned,
      xp: xpResult,
      loot,
    },
    player,
  };
}

export async function fetchActiveBosses(userClient: SupabaseClientLike, userId: string) {
  const [{ data: bosses, error: bossesError }, { data: stats, error: statsError }] = await Promise.all([
    userClient
      .from("bosses")
      .select("id, name, description, max_hp, xp_reward, min_level, is_active, created_at")
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    userClient.from("user_stats").select("level").eq("user_id", userId).single(),
  ]);
  if (bossesError) throw new ApiError(400, bossesError.message, "BOSSES_FETCH_FAILED");
  if (statsError || !stats) throw new ApiError(404, "User stats not found.", "STATS_NOT_FOUND");

  const bossIds = (bosses ?? []).map((boss: any) => boss.id);
  const [globalAttemptsByBoss, userAttemptsByBoss] = await Promise.all([
    bossIds.length > 0 ? userClient.from("boss_attempts").select("boss_id, damage").in("boss_id", bossIds) : Promise.resolve({ data: [] as any[] }),
    bossIds.length > 0
      ? userClient.from("boss_attempts").select("boss_id, damage").in("boss_id", bossIds).eq("user_id", userId)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const globalDamageMap = new Map<string, number>();
  for (const row of globalAttemptsByBoss.data ?? []) {
    globalDamageMap.set((row as any).boss_id, (globalDamageMap.get((row as any).boss_id) ?? 0) + Number((row as any).damage ?? 0));
  }
  const userDamageMap = new Map<string, number>();
  for (const row of userAttemptsByBoss.data ?? []) {
    userDamageMap.set((row as any).boss_id, (userDamageMap.get((row as any).boss_id) ?? 0) + Number((row as any).damage ?? 0));
  }

  return (bosses ?? []).map((boss: any) => {
    const totalDamage = globalDamageMap.get(boss.id) ?? 0;
    const remainingHp = Math.max(0, Number(boss.max_hp) - totalDamage);
    return {
      id: boss.id,
      name: boss.name,
      description: boss.description,
      xp_reward: boss.xp_reward,
      min_level: boss.min_level,
      can_join: Number(stats.level) >= Number(boss.min_level),
      bossProgress: {
        maxHp: boss.max_hp,
        totalDamage,
        remainingHp,
        defeated: remainingHp <= 0,
        userDamage: userDamageMap.get(boss.id) ?? 0,
      },
    };
  });
}

export async function addItemToInventory(args: {
  userClient: SupabaseClientLike;
  userId: string;
  itemId: string;
  quantity: number;
}) {
  const { userClient, userId, itemId, quantity } = args;

  const { data: existing } = await userClient
    .from("user_inventory")
    .select("quantity")
    .eq("user_id", userId)
    .eq("item_id", itemId)
    .maybeSingle();

  if (!existing) {
    const { error } = await userClient.from("user_inventory").insert({
      user_id: userId,
      item_id: itemId,
      quantity,
    });
    if (error) throw new ApiError(400, error.message, "INVENTORY_ADD_FAILED");
    return { itemId, quantity };
  }

  const nextQuantity = Number(existing.quantity ?? 0) + quantity;
  const { error } = await userClient
    .from("user_inventory")
    .update({ quantity: nextQuantity })
    .eq("user_id", userId)
    .eq("item_id", itemId);
  if (error) throw new ApiError(400, error.message, "INVENTORY_UPDATE_FAILED");
  return { itemId, quantity: nextQuantity };
}

export async function fetchUserInventory(userClient: SupabaseClientLike, userId: string) {
  const { data, error } = await userClient
    .from("user_inventory")
    .select("item_id, quantity, acquired_at, updated_at, items(id, slug, name, description, item_type, rarity, icon_url)")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw new ApiError(400, error.message, "INVENTORY_FETCH_FAILED");

  return (data ?? []).map((row: any) => ({
    item_id: row.item_id,
    quantity: row.quantity,
    acquired_at: row.acquired_at,
    updated_at: row.updated_at,
    item: Array.isArray(row.items) ? row.items[0] ?? null : row.items ?? null,
  }));
}

export async function fetchLeaderboards(userClient: SupabaseClientLike) {
  const [{ data: players, error: playersError }, { data: guilds, error: guildsError }, { data: achievements, error: achievementsError }] =
    await Promise.all([
      userClient
        .from("user_stats")
        .select("user_id, level, total_xp, profiles(username, display_name, avatar_url)")
        .order("total_xp", { ascending: false })
        .limit(50),
      userClient
        .from("guilds")
        .select("id, name, logo_url, total_xp, member_count")
        .order("total_xp", { ascending: false })
        .limit(25),
      userClient
        .from("quest_completions")
        .select("user_id, quest_id, created_at, profiles(username, display_name)")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

  if (playersError) throw new ApiError(400, playersError.message, "PLAYERS_LEADERBOARD_FAILED");
  if (guildsError) throw new ApiError(400, guildsError.message, "GUILDS_LEADERBOARD_FAILED");
  if (achievementsError) throw new ApiError(400, achievementsError.message, "ACHIEVEMENTS_FETCH_FAILED");

  return {
    players: (players ?? []).map((player, index) => ({
      rank: index + 1,
      ...player,
    })),
    guilds: (guilds ?? []).map((guild, index) => ({
      rank: index + 1,
      ...guild,
    })),
    achievements: achievements ?? [],
  };
}

async function addXpInternal(args: AddXpArgs) {
  const { userClient, userId, amount, sourceType, sourceId, questCompletionId, activityId, note } = args;
  assertSafeXpGrant(sourceType, amount);
  const { data: stats, error: statsError } = await userClient
    .from("user_stats")
    .select("total_xp")
    .eq("user_id", userId)
    .single();
  if (statsError || !stats) throw new ApiError(404, "User stats not found.", "STATS_NOT_FOUND");

  const nextTotalXp = Number(stats.total_xp ?? 0) + amount;
  const levelInfo = calculateLevelProgression(nextTotalXp);

  const { error: updateStatsError } = await userClient
    .from("user_stats")
    .update({ total_xp: nextTotalXp, level: levelInfo.level })
    .eq("user_id", userId);
  if (updateStatsError) throw new ApiError(400, updateStatsError.message, "XP_APPLY_FAILED");

  const { data: log, error: logError } = await userClient
    .from("xp_logs")
    .insert({
      user_id: userId,
      source_type: sourceType === "streak_bonus" ? "bonus" : sourceType,
      source_id: sourceId ?? null,
      activity_id: activityId ?? null,
      quest_completion_id: questCompletionId ?? null,
      xp_amount: amount,
      note: note ?? null,
    })
    .select("*")
    .single();
  if (logError) throw new ApiError(400, logError.message, "XP_LOG_FAILED");

  return { xpLog: log, progression: levelInfo };
}

async function updatePlayerStreakOnQuest(userClient: SupabaseClientLike, userId: string) {
  const { data: profile, error: profileError } = await userClient
    .from("profiles")
    .select("streak_days, last_activity_date")
    .eq("id", userId)
    .single();
  if (profileError || !profile) {
    throw new ApiError(404, "Profile not found for streak update.", "PROFILE_NOT_FOUND");
  }

  const streakUpdate = updateStreak(profile.last_activity_date);
  let nextStreakDays = Number(profile.streak_days ?? 0);
  if (streakUpdate.streakDays === "increment") nextStreakDays += 1;
  else if (typeof streakUpdate.streakDays === "number") nextStreakDays = streakUpdate.streakDays;

  const { error: updateError } = await userClient
    .from("profiles")
    .update({
      streak_days: nextStreakDays,
      last_activity_date: streakUpdate.lastActivityDate,
    })
    .eq("id", userId);
  if (updateError) {
    throw new ApiError(400, updateError.message, "STREAK_UPDATE_FAILED");
  }

  return {
    streakDays: nextStreakDays,
    lastActivityDate: streakUpdate.lastActivityDate,
  };
}

async function getPlayerProgressSnapshot(userClient: SupabaseClientLike, userId: string): Promise<PlayerProgressSnapshot> {
  const [{ data: profile, error: profileError }, { data: stats, error: statsError }] = await Promise.all([
    userClient.from("profiles").select("id, streak_days, last_activity_date").eq("id", userId).single(),
    userClient.from("user_stats").select("*").eq("user_id", userId).single(),
  ]);

  if (profileError || !profile) throw new ApiError(404, "Profile not found.", "PROFILE_NOT_FOUND");
  if (statsError || !stats) throw new ApiError(404, "User stats not found.", "STATS_NOT_FOUND");

  return {
    profile,
    stats,
    progression: calculateLevelProgression(Number(stats.total_xp ?? 0)),
  };
}

async function syncPostCounts(adminClient: SupabaseClientLike, postId: string) {
  const [{ count: likesCount }, { count: commentsCount }] = await Promise.all([
    adminClient.from("likes").select("*", { count: "exact", head: true }).eq("post_id", postId),
    adminClient.from("comments").select("*", { count: "exact", head: true }).eq("post_id", postId),
  ]);

  await adminClient
    .from("posts")
    .update({
      likes_count: likesCount ?? 0,
      comments_count: commentsCount ?? 0,
    })
    .eq("id", postId);
}

