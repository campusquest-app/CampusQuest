import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";
import { createNotification } from "@/lib/server/notifications";
import { getAcceptedFriendUserIds } from "@/lib/server/friendProfileAccess";
import { deliverApprovedUserTag } from "@/lib/server/tagDeliveryService";
import {
  MAX_MENTIONS_PER_CAPTION,
  MAX_PHOTO_TAGS_PER_MEDIA,
  MAX_STRUCTURED_TAGS_PER_POST,
  clamp01,
  dedupeTagRefs,
  isTagEntityType,
  type CaptionMentionDraft,
  type ComposerTagSelection,
  type PhotoTagDraft,
  type TagEntityType,
  type TagStatus,
} from "@/lib/postTags";

type Admin = ReturnType<typeof createAdminClient>;

async function entityExists(admin: Admin, entityType: TagEntityType, entityId: string): Promise<boolean> {
  if (entityType === "user") {
    const { data } = await admin.from("profiles").select("id").eq("id", entityId).maybeSingle();
    return Boolean(data?.id);
  }
  if (entityType === "organization") {
    const { data } = await admin
      .from("student_organizations")
      .select("id")
      .eq("id", entityId)
      .eq("is_approved", true)
      .maybeSingle();
    return Boolean(data?.id);
  }
  if (entityType === "event") {
    const { data } = await admin
      .from("campus_events")
      .select("id")
      .eq("id", entityId)
      .eq("is_cancelled", false)
      .maybeSingle();
    return Boolean(data?.id);
  }
  const { data } = await admin
    .from("external_events")
    .select("id")
    .eq("id", entityId)
    .eq("is_active", true)
    .maybeSingle();
  return Boolean(data?.id);
}

async function areBlocked(admin: Admin, a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  const { data } = await admin
    .from("blocked_users")
    .select("id")
    .or(
      `and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`,
    )
    .limit(1);
  return (data?.length ?? 0) > 0;
}

async function getTagPrefs(admin: Admin, userId: string) {
  const { data } = await admin.from("tag_preferences").select("*").eq("user_id", userId).maybeSingle();
  return {
    allow_tags_from: (data?.allow_tags_from as string) ?? "everyone",
    allow_mentions_from: (data?.allow_mentions_from as string) ?? "everyone",
    manually_approve_tags: data?.manually_approve_tags === true,
  };
}

async function resolveUserTagStatus(args: {
  admin: Admin;
  authorId: string;
  targetUserId: string;
  kind: "tag" | "mention";
}): Promise<TagStatus | "blocked"> {
  const { admin, authorId, targetUserId, kind } = args;
  if (await areBlocked(admin, authorId, targetUserId)) return "blocked";
  if (authorId === targetUserId) return "approved";
  const prefs = await getTagPrefs(admin, targetUserId);
  const allowFrom = kind === "mention" ? prefs.allow_mentions_from : prefs.allow_tags_from;
  if (allowFrom === "nobody") return "rejected";
  if (allowFrom === "following") {
    const friends = await getAcceptedFriendUserIds({ userClient: admin, userId: targetUserId });
    if (!friends.includes(authorId)) return "rejected";
  }
  if (kind === "tag" && prefs.manually_approve_tags) return "pending";
  return "approved";
}

export type PersistTagsInput = {
  postId: string;
  authorId: string;
  authorUsername: string;
  composerTags?: ComposerTagSelection[];
  photoTags?: PhotoTagDraft[];
  mentions?: CaptionMentionDraft[];
};

type PendingTagInsert = {
  post_id: string;
  entity_type: TagEntityType;
  entity_id: string;
  tag_source: "composer" | "photo";
  media_key: string | null;
  position_x: number | null;
  position_y: number | null;
  status: TagStatus;
  created_by: string;
};

function existingKey(row: {
  entity_type: string;
  entity_id: string;
  tag_source: string;
  media_key?: string | null;
}): string {
  if (row.tag_source === "photo") {
    return `photo:${row.media_key ?? "primary"}:${row.entity_type}:${row.entity_id}`;
  }
  return `${row.tag_source}:${row.entity_type}:${row.entity_id}`;
}

export async function persistPostTagsAndMentions(input: PersistTagsInput): Promise<void> {
  const admin = createAdminClient();
  const composerTags = dedupeTagRefs(input.composerTags ?? []).slice(0, MAX_STRUCTURED_TAGS_PER_POST);
  const photoTags = (input.photoTags ?? []).slice(0, MAX_PHOTO_TAGS_PER_MEDIA * 5);
  const mentions = (input.mentions ?? []).slice(0, MAX_MENTIONS_PER_CAPTION);

  const photoByMedia = new Map<string, number>();
  for (const pt of photoTags) {
    const key = pt.mediaKey || "primary";
    photoByMedia.set(key, (photoByMedia.get(key) ?? 0) + 1);
    if ((photoByMedia.get(key) ?? 0) > MAX_PHOTO_TAGS_PER_MEDIA) {
      throw new ApiError(400, "Too many photo tags on one image.", "PHOTO_TAG_LIMIT");
    }
  }

  // Skip tags that already exist on this post so edits only deliver newly added ones.
  const { data: existingRows } = await admin
    .from("post_tags")
    .select("entity_type, entity_id, tag_source, media_key")
    .eq("post_id", input.postId)
    .is("removed_at", null);
  const alreadyTagged = new Set((existingRows ?? []).map((row) => existingKey(row as never)));

  const tagRows: PendingTagInsert[] = [];

  for (const tag of composerTags) {
    if (!isTagEntityType(tag.entityType)) continue;
    const key = existingKey({
      entity_type: tag.entityType,
      entity_id: tag.entityId,
      tag_source: "composer",
    });
    if (alreadyTagged.has(key)) continue;
    if (!(await entityExists(admin, tag.entityType, tag.entityId))) {
      throw new ApiError(400, "One of the tagged entities is unavailable.", "TAG_ENTITY_INVALID");
    }
    let status: TagStatus = "approved";
    if (tag.entityType === "user") {
      const resolved = await resolveUserTagStatus({
        admin,
        authorId: input.authorId,
        targetUserId: tag.entityId,
        kind: "tag",
      });
      if (resolved === "blocked" || resolved === "rejected") continue;
      status = resolved;
    }
    tagRows.push({
      post_id: input.postId,
      entity_type: tag.entityType,
      entity_id: tag.entityId,
      tag_source: "composer",
      media_key: null,
      position_x: null,
      position_y: null,
      status,
      created_by: input.authorId,
    });
    alreadyTagged.add(key);
  }

  for (const tag of photoTags) {
    if (!isTagEntityType(tag.entityType)) continue;
    const key = existingKey({
      entity_type: tag.entityType,
      entity_id: tag.entityId,
      tag_source: "photo",
      media_key: tag.mediaKey || "primary",
    });
    if (alreadyTagged.has(key)) continue;
    if (!(await entityExists(admin, tag.entityType, tag.entityId))) continue;
    let status: TagStatus = "approved";
    if (tag.entityType === "user") {
      const resolved = await resolveUserTagStatus({
        admin,
        authorId: input.authorId,
        targetUserId: tag.entityId,
        kind: "tag",
      });
      if (resolved === "blocked" || resolved === "rejected") continue;
      status = resolved;
    }
    tagRows.push({
      post_id: input.postId,
      entity_type: tag.entityType,
      entity_id: tag.entityId,
      tag_source: "photo",
      media_key: tag.mediaKey || "primary",
      position_x: clamp01(tag.positionX),
      position_y: clamp01(tag.positionY),
      status,
      created_by: input.authorId,
    });
    alreadyTagged.add(key);
  }

  const notifiedMentions = new Set<string>();
  const mentionRows: Record<string, unknown>[] = [];
  for (const m of mentions) {
    if (!isTagEntityType(m.entityType)) continue;
    if (!(await entityExists(admin, m.entityType, m.entityId))) continue;
    if (m.entityType === "user") {
      const resolved = await resolveUserTagStatus({
        admin,
        authorId: input.authorId,
        targetUserId: m.entityId,
        kind: "mention",
      });
      if (resolved === "blocked" || resolved === "rejected") continue;
      const mentionKey = `mention:${m.entityId}`;
      if (!notifiedMentions.has(mentionKey) && m.entityId !== input.authorId) {
        notifiedMentions.add(mentionKey);
        try {
          await createNotification({
            userId: m.entityId,
            type: "quad_post_mention",
            title: "You were mentioned",
            body: `${input.authorUsername} mentioned you in a post.`,
            relatedEntityType: "quad_post",
            relatedEntityId: input.postId,
            actorId: input.authorId,
          });
        } catch {
          // Mention notifs must not roll back the post.
        }
      }
    }
    mentionRows.push({
      post_id: input.postId,
      entity_type: m.entityType,
      entity_id: m.entityId,
      display_text: m.displayText.slice(0, 80),
      start_index: Math.max(0, Math.floor(m.startIndex)),
      end_index: Math.max(0, Math.floor(m.endIndex)),
    });
  }

  let insertedTags: Array<{
    id: string;
    entity_type: TagEntityType;
    entity_id: string;
    status: TagStatus;
    displayLabel?: string;
  }> = [];

  if (tagRows.length) {
    const { data, error } = await admin
      .from("post_tags")
      .insert(tagRows)
      .select("id, entity_type, entity_id, status");
    if (error) throw new ApiError(400, error.message, "POST_TAGS_INSERT_FAILED");
    insertedTags = (data ?? []) as typeof insertedTags;
  }
  if (mentionRows.length) {
    const { error } = await admin.from("post_mentions").insert(mentionRows);
    if (error) throw new ApiError(400, error.message, "POST_MENTIONS_INSERT_FAILED");
  }

  // Deliver after tags are saved. Personal DMs only for user tags.
  for (const tag of insertedTags) {
    if (tag.entity_type === "user") {
      if (tag.status !== "approved" && tag.status !== "pending") continue;
      try {
        await deliverApprovedUserTag({
          tagId: tag.id,
          postId: input.postId,
          authorId: input.authorId,
          authorUsername: input.authorUsername,
          recipientUserId: tag.entity_id,
          status: tag.status,
        });
      } catch (error) {
        console.warn("[cq][tag-delivery] user tag delivery failed", {
          tagId: tag.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      continue;
    }

    // Org / event / external_event — steward notifications only, no personal DMs.
    const composer = composerTags.find(
      (c) => c.entityType === tag.entity_type && c.entityId === tag.entity_id,
    );
    const photo = photoTags.find(
      (c) => c.entityType === tag.entity_type && c.entityId === tag.entity_id,
    );
    await notifyEntityStewards({
      admin,
      entityType: tag.entity_type,
      entityId: tag.entity_id,
      authorId: input.authorId,
      authorUsername: input.authorUsername,
      postId: input.postId,
      displayLabel: composer?.displayLabel ?? photo?.displayLabel ?? "an entity",
    });
  }
}

/**
 * After a tagged user approves a pending tag, send the standard notification + DM.
 */
export async function deliverOnTagApproved(args: {
  tagId: string;
  postId: string;
  authorId: string;
  authorUsername: string;
  recipientUserId: string;
}): Promise<void> {
  await deliverApprovedUserTag({
    tagId: args.tagId,
    postId: args.postId,
    authorId: args.authorId,
    authorUsername: args.authorUsername,
    recipientUserId: args.recipientUserId,
    status: "approved",
  });
}

export type ListedPostTag = {
  id: string;
  post_id: string;
  entity_type: TagEntityType;
  entity_id: string;
  tag_source: string;
  media_key: string | null;
  position_x: number | null;
  position_y: number | null;
  status: string;
};

export async function listApprovedTagsForPosts(postIds: string[]): Promise<Map<string, ListedPostTag[]>> {
  const map = new Map<string, ListedPostTag[]>();
  if (!postIds.length) return map;
  const admin = createAdminClient();
  const { data } = await admin
    .from("post_tags")
    .select("id, post_id, entity_type, entity_id, tag_source, media_key, position_x, position_y, status")
    .in("post_id", postIds)
    .is("removed_at", null)
    .eq("status", "approved");
  for (const row of (data ?? []) as ListedPostTag[]) {
    const list = map.get(row.post_id) ?? [];
    list.push(row);
    map.set(row.post_id, list);
  }
  return map;
}

export async function listMentionsForPosts(
  postIds: string[],
): Promise<Map<string, Record<string, unknown>[]>> {
  const map = new Map<string, Record<string, unknown>[]>();
  if (!postIds.length) return map;
  const admin = createAdminClient();
  const { data } = await admin.from("post_mentions").select("*").in("post_id", postIds);
  for (const row of data ?? []) {
    const list = map.get(row.post_id as string) ?? [];
    list.push(row as Record<string, unknown>);
    map.set(row.post_id as string, list);
  }
  return map;
}

async function notifyEntityStewards(args: {
  admin: Admin;
  entityType: TagEntityType;
  entityId: string;
  authorId: string;
  authorUsername: string;
  postId: string;
  displayLabel: string;
}) {
  const recipients = new Set<string>();
  if (args.entityType === "organization") {
    const { data } = await args.admin
      .from("organization_members")
      .select("user_id, org_role, status")
      .eq("organization_id", args.entityId)
      .eq("status", "approved")
      .in("org_role", ["owner", "admin"]);
    for (const row of data ?? []) {
      if (row.user_id) recipients.add(row.user_id as string);
    }
  } else if (args.entityType === "event") {
    const { data } = await args.admin
      .from("campus_events")
      .select("created_by, host_user_id, title")
      .eq("id", args.entityId)
      .maybeSingle();
    if (data?.created_by) recipients.add(data.created_by as string);
    if (data?.host_user_id) recipients.add(data.host_user_id as string);
  }
  const label = args.displayLabel || "an entity";
  for (const userId of Array.from(recipients)) {
    if (userId === args.authorId) continue;
    try {
      await createNotification({
        userId,
        type: "quad_post_tag",
        title: "Entity tagged",
        body: `${args.authorUsername} tagged ${label} in a post.`,
        relatedEntityType: "quad_post",
        relatedEntityId: args.postId,
        actorId: args.authorId,
      });
    } catch {
      // Steward notifs must not break tag persistence.
    }
  }
}

export type ApiPostTag = {
  id: string;
  entityType: TagEntityType;
  entityId: string;
  tagSource: string;
  mediaKey: string | null;
  positionX: number | null;
  positionY: number | null;
  displayLabel: string;
  status: string;
};

export type ApiPostMention = {
  entityType: TagEntityType;
  entityId: string;
  displayText: string;
  startIndex: number;
  endIndex: number;
};

/** Attach approved tags + mentions (with display labels) onto post API rows. */
export async function enrichQuadPostsWithTagsAndMentions<T extends { id: string }>(
  posts: T[],
): Promise<
  Array<
    T & {
      tags?: ApiPostTag[];
      mentions?: ApiPostMention[];
    }
  >
> {
  if (!posts.length) return posts;
  const postIds = posts.map((p) => p.id);
  const [tagMap, mentionMap] = await Promise.all([
    listApprovedTagsForPosts(postIds),
    listMentionsForPosts(postIds),
  ]);

  const userIds = new Set<string>();
  const orgIds = new Set<string>();
  const eventIds = new Set<string>();
  const externalEventIds = new Set<string>();

  for (const tags of Array.from(tagMap.values())) {
    for (const t of tags) {
      if (t.entity_type === "user") userIds.add(t.entity_id);
      else if (t.entity_type === "organization") orgIds.add(t.entity_id);
      else if (t.entity_type === "event") eventIds.add(t.entity_id);
      else externalEventIds.add(t.entity_id);
    }
  }
  for (const mentions of Array.from(mentionMap.values())) {
    for (const m of mentions) {
      const et = m.entity_type as TagEntityType;
      const eid = m.entity_id as string;
      if (et === "user") userIds.add(eid);
      else if (et === "organization") orgIds.add(eid);
      else if (et === "event") eventIds.add(eid);
      else externalEventIds.add(eid);
    }
  }

  const admin = createAdminClient();
  const [users, orgs, events, externalEvents] = await Promise.all([
    userIds.size
      ? admin.from("profiles").select("id, username, display_name").in("id", Array.from(userIds))
      : Promise.resolve({ data: [] as { id: string; username: string | null; display_name: string | null }[] }),
    orgIds.size
      ? admin.from("student_organizations").select("id, name, mention_slug").in("id", Array.from(orgIds))
      : Promise.resolve({ data: [] as { id: string; name: string | null; mention_slug: string | null }[] }),
    eventIds.size
      ? admin
          .from("campus_events")
          .select("id, title, mention_slug, is_cancelled, ends_at")
          .in("id", Array.from(eventIds))
      : Promise.resolve({
          data: [] as {
            id: string;
            title: string | null;
            mention_slug: string | null;
            is_cancelled: boolean | null;
            ends_at: string | null;
          }[],
        }),
    externalEventIds.size
      ? admin
          .from("external_events")
          .select("id, title, mention_slug, is_active")
          .in("id", Array.from(externalEventIds))
      : Promise.resolve({
          data: [] as { id: string; title: string | null; mention_slug: string | null; is_active: boolean | null }[],
        }),
  ]);

  const labelFor = (entityType: TagEntityType, entityId: string): string => {
    if (entityType === "user") {
      const u = (users.data ?? []).find((r) => r.id === entityId);
      const username = (u?.username ?? "").trim();
      return username ? `@${username}` : (u?.display_name ?? "Student");
    }
    if (entityType === "organization") {
      const o = (orgs.data ?? []).find((r) => r.id === entityId);
      return (o?.name ?? "Organization").trim() || "Organization";
    }
    if (entityType === "event") {
      const e = (events.data ?? []).find((r) => r.id === entityId);
      let title = (e?.title ?? "Event").trim() || "Event";
      if (e?.is_cancelled) title = `${title} (cancelled)`;
      else if (e?.ends_at && Date.parse(e.ends_at) < Date.now()) title = `${title} (ended)`;
      return title;
    }
    const e = (externalEvents.data ?? []).find((r) => r.id === entityId);
    let title = (e?.title ?? "Event").trim() || "Event";
    if (e && e.is_active === false) title = `${title} (ended)`;
    return title;
  };

  return posts.map((post) => {
    const tags = (tagMap.get(post.id) ?? []).map((t) => ({
      id: t.id,
      entityType: t.entity_type,
      entityId: t.entity_id,
      tagSource: t.tag_source,
      mediaKey: t.media_key,
      positionX: t.position_x,
      positionY: t.position_y,
      displayLabel: labelFor(t.entity_type, t.entity_id),
      status: t.status,
    }));
    const mentions = (mentionMap.get(post.id) ?? []).map((m) => ({
      entityType: m.entity_type as TagEntityType,
      entityId: m.entity_id as string,
      displayText: String(m.display_text ?? ""),
      startIndex: Number(m.start_index ?? 0),
      endIndex: Number(m.end_index ?? 0),
    }));
    return { ...post, tags, mentions };
  });
}
