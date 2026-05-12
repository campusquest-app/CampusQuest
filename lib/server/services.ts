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
import { assertSafeMinutes, assertSafeXpGrant } from "@/lib/server/security";

type SupabaseClientLike = ReturnType<typeof createAdminClient>;

type AddXpArgs = {
  userClient: SupabaseClientLike;
  userId: string;
  amount: number;
  sourceType: "activity" | "quest" | "boss" | "guild" | "manual" | "streak_bonus";
  sourceId?: string;
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
  const { userClient, userId, amount, sourceType, sourceId, activityId, note } = args;
  assertSafeXpGrant(sourceType, amount);
  return addXpInternal({
    userClient,
    userId,
    amount,
    sourceType,
    sourceId,
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
    .select("id, target_count, xp_reward")
    .eq("id", userQuest.quest_id)
    .single();
  if (questError || !quest) throw new ApiError(404, "Quest not found.", "QUEST_NOT_FOUND");

  if (userQuest.progress_count < quest.target_count) {
    throw new ApiError(409, "Quest progress is not complete yet.", "QUEST_INCOMPLETE");
  }

  if (userQuest.status === "claimed") {
    throw new ApiError(409, "Quest already claimed.", "QUEST_ALREADY_CLAIMED");
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
    note: "Quest completion reward",
  });

  const { data: currentStats } = await userClient
    .from("user_stats")
    .select("quests_completed")
    .eq("user_id", userId)
    .single();
  const nextQuestCount = Number(currentStats?.quests_completed ?? 0) + 1;
  const { error: statsError } = await userClient
    .from("user_stats")
    .update({ quests_completed: nextQuestCount })
    .eq("user_id", userId);
  if (statsError) throw new ApiError(400, statsError.message, "STATS_QUEST_INCREMENT_FAILED");

  return { completion, xp };
}

export async function createProofUpload(args: {
  userClient: SupabaseClientLike;
  userId: string;
  extension: "jpg" | "jpeg" | "png" | "webp";
  contentType: "image/jpeg" | "image/png" | "image/webp";
}) {
  const { userClient, userId, extension, contentType } = args;
  const adminClient = createAdminClient();
  const fileName = `${crypto.randomUUID()}.${extension}`;
  const storagePath = `${userId}/${fileName}`;

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
      storage_path: storagePath,
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

export async function createPost(args: {
  userClient: SupabaseClientLike;
  userId: string;
  body: string;
  imageUrl?: string;
}) {
  const { userClient, userId, body, imageUrl } = args;
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

  const { data: attemptAgg } = await userClient
    .from("boss_attempts")
    .select("damage")
    .eq("boss_id", boss.id)
    .eq("user_id", userId);
  const dealt = (attemptAgg ?? []).reduce((sum, row) => sum + Number(row.damage ?? 0), 0);
  const remainingHp = Math.max(0, boss.max_hp - dealt);

  return { boss, remainingHp, dealt };
}

export async function attemptBossBattle(args: {
  userClient: SupabaseClientLike;
  userId: string;
  bossId: string;
  activityId?: string;
}) {
  const { userClient, userId, bossId, activityId } = args;
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

  const { data: existingAttempts } = await userClient
    .from("boss_attempts")
    .select("damage")
    .eq("boss_id", bossId)
    .eq("user_id", userId);
  const totalDamageBefore = (existingAttempts ?? []).reduce((sum, row) => sum + Number(row.damage ?? 0), 0);
  const hpRemainingBefore = Math.max(0, boss.max_hp - totalDamageBefore);
  if (hpRemainingBefore <= 0) {
    throw new ApiError(409, "Boss already defeated.", "BOSS_ALREADY_DEFEATED");
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

  const appliedDamage = Math.min(hpRemainingBefore, damageResult.damage);
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
  if (wasKillingBlow) {
    assertSafeXpGrant("boss", boss.xp_reward);
    xpResult = await addXpInternal({
      userClient,
      userId,
      amount: boss.xp_reward,
      sourceType: "boss",
      sourceId: bossId,
      note: `Defeated ${boss.name}`,
    });

    const lootRoll = rollLootDrop();
    if (lootRoll.dropped) {
      const { data: lootItem } = await userClient
        .from("items")
        .select("id, rarity")
        .eq("rarity", lootRoll.itemRarity)
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

  return {
    attempt,
    damage: appliedDamage,
    wasCritical: damageResult.wasCritical,
    hpRemainingAfter,
    defeated: wasKillingBlow,
    xpResult,
    loot,
  };
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
    players: players ?? [],
    guilds: guilds ?? [],
    achievements: achievements ?? [],
  };
}

async function addXpInternal(args: AddXpArgs) {
  const { userClient, userId, amount, sourceType, sourceId, activityId, note } = args;
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
      source_type: sourceType,
      source_id: sourceId ?? null,
      activity_id: activityId ?? null,
      xp_amount: amount,
      note: note ?? null,
    })
    .select("*")
    .single();
  if (logError) throw new ApiError(400, logError.message, "XP_LOG_FAILED");

  return { xpLog: log, progression: levelInfo };
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

