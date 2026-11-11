import { createHash } from "crypto";
import type { BroadcastDraft, BroadcastPlan, PushDeviceTarget, RecipientSnapshot } from "@/lib/push/adminBroadcast";
import {
  apnsDataForDestination,
  broadcastContentKey,
  dispatchBroadcastPushes,
  notificationLink,
  unsentRecipients,
} from "@/lib/push/adminBroadcast";
import { isApnsConfigured, sendApnsAlertResolvingEnvironment } from "@/lib/server/apnsProvider";
import { ApiError } from "@/lib/server/http";
import { disablePushDeviceByToken } from "@/lib/server/pushDevices";
import { createAdminClient } from "@/lib/server/supabase";

export type StoredBroadcast = {
  id: string;
  status: string;
  appleContacted: boolean;
  duplicate: boolean;
  inAppCount: number;
  pushCount: number;
  acceptedCount: number;
  failedCount: number;
  skipped: Record<string, number>;
  inAppWritten: boolean;
};

function contentHash(draft: BroadcastDraft): string {
  return createHash("sha256").update(broadcastContentKey(draft)).digest("hex");
}

function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  const message = error?.message ?? "";
  return error?.code === "42P01" || error?.code === "42703" || /push_broadcasts/i.test(message);
}

function mapStored(row: Record<string, unknown>, duplicate: boolean): StoredBroadcast {
  return {
    id: String(row.id),
    status: String(row.status),
    appleContacted: row.apple_contacted === true,
    duplicate,
    inAppCount: Number(row.in_app_count ?? 0),
    pushCount: Number(row.push_count ?? 0),
    acceptedCount: Number(row.accepted_count ?? 0),
    failedCount: Number(row.failed_count ?? 0),
    skipped: (row.skipped ?? {}) as Record<string, number>,
    inAppWritten: row.in_app_written === true,
  };
}

const BROADCAST_SELECT =
  "id, status, apple_contacted, content_key, in_app_count, push_count, accepted_count, failed_count, skipped, in_app_written";

export async function beginBroadcast(args: {
  adminId: string;
  idempotencyKey: string;
  draft: BroadcastDraft;
  plan: BroadcastPlan;
}): Promise<StoredBroadcast> {
  const admin = createAdminClient();
  const hash = contentHash(args.draft);
  const { data: existing, error: existingError } = await admin
    .from("push_broadcasts")
    .select(BROADCAST_SELECT)
    .eq("idempotency_key", args.idempotencyKey)
    .maybeSingle();

  if (existingError) {
    if (isMissingRelation(existingError)) {
      throw new ApiError(
        503,
        "Push announcement storage is not available until the push broadcast migration is applied.",
        "PUSH_BROADCAST_STORAGE_UNAVAILABLE",
      );
    }
    throw new ApiError(400, existingError.message, "PUSH_BROADCAST_LOOKUP_FAILED");
  }

  if (existing) {
    if (existing.content_key !== hash) {
      throw new ApiError(
        409,
        "That send was already used for a different notification.",
        "PUSH_BROADCAST_IDEMPOTENCY_CONFLICT",
      );
    }
    return mapStored(existing as Record<string, unknown>, true);
  }

  const { data, error } = await admin
    .from("push_broadcasts")
    .insert({
      created_by: args.adminId,
      idempotency_key: args.idempotencyKey,
      content_key: hash,
      mode: args.draft.mode,
      audience: args.draft.audience,
      audience_user_id: args.draft.userId ?? null,
      category: args.draft.category,
      title: args.draft.title.trim().slice(0, 80),
      body: args.draft.body.trim().slice(0, 180),
      destination: args.draft.destination,
      status: "sending",
      in_app_count: args.plan.inAppCount,
      push_count: args.plan.pushCount,
      in_app_written: false,
      accepted_count: 0,
      failed_count: 0,
      skipped: args.plan.skipped,
      apple_contacted: false,
    })
    .select(BROADCAST_SELECT)
    .single();

  if (error || !data) {
    if (isMissingRelation(error)) {
      throw new ApiError(
        503,
        "Push announcement storage is not available until the push broadcast migration is applied.",
        "PUSH_BROADCAST_STORAGE_UNAVAILABLE",
      );
    }
    throw new ApiError(400, error?.message ?? "Could not record the announcement plan.", "PUSH_BROADCAST_RECORD_FAILED");
  }

  return mapStored(data as Record<string, unknown>, false);
}

export async function deliverBroadcast(args: {
  broadcast: StoredBroadcast;
  draft: BroadcastDraft;
  plan: BroadcastPlan;
}): Promise<StoredBroadcast> {
  if (args.broadcast.duplicate && (args.broadcast.status === "completed" || args.broadcast.status === "failed")) {
    return args.broadcast;
  }
  const admin = createAdminClient();
  const link = notificationLink(args.draft.destination, args.broadcast.id);
  let inAppWritten = args.broadcast.inAppWritten;

  if (!inAppWritten) {
    const { data: existingRows } = await admin
      .from("notifications")
      .select("user_id")
      .eq("source_broadcast_id", args.broadcast.id);
    const already = new Set((existingRows ?? []).map((row) => String(row.user_id)));
    const pending = unsentRecipients(args.plan, already);
    if (pending.length > 0) {
      const rows = pending.map((recipient) => ({
        user_id: recipient.userId,
        type: "campus_announcement",
        title: args.draft.title.trim().slice(0, 80),
        body: args.draft.body.trim().slice(0, 180),
        related_entity_type: link.relatedEntityType,
        related_entity_id: link.relatedEntityId,
        source_broadcast_id: args.broadcast.id,
        actor_id: null,
      }));
      const { error } = await admin.from("notifications").insert(rows);
      if (error && error.code !== "23505") {
        if (isMissingRelation(error)) {
          throw new ApiError(
            503,
            "Push announcement storage is not available until the push broadcast migration is applied.",
            "PUSH_BROADCAST_STORAGE_UNAVAILABLE",
          );
        }
        throw new ApiError(400, error.message, "PUSH_BROADCAST_INBOX_FAILED");
      }
    }
    inAppWritten = true;
    await admin.from("push_broadcasts").update({ in_app_written: true }).eq("id", args.broadcast.id);
  }

  const pushUserIds = args.plan.recipients.filter((recipient) => recipient.push).map((recipient) => recipient.userId);
  const devices = await loadIosDevices(pushUserIds);
  const { data: priorAttempts } = await admin
    .from("push_broadcast_attempts")
    .select("user_id, device_id")
    .eq("broadcast_id", args.broadcast.id);
  const alreadyAttempted = new Set(
    (priorAttempts ?? []).map((row) => `${String(row.user_id)}:${row.device_id ? String(row.device_id) : ""}`),
  );
  const data = apnsDataForDestination(args.draft.destination);
  data.notification_id = args.broadcast.id;
  const dispatch = await dispatchBroadcastPushes({
    mode: args.draft.mode,
    testUserId: args.draft.userId,
    recipients: args.plan.recipients,
    devices,
    alreadyAttempted,
    configured: isApnsConfigured(),
    sender: async (device) => {
      const result = await sendApnsAlertResolvingEnvironment({
        deviceToken: device.token,
        title: args.draft.title,
        body: args.draft.body,
        data,
        environment: device.environment,
      });
      if (result.ok && result.environment !== device.environment) {
        await admin
          .from("push_devices")
          .update({ environment: result.environment, updated_at: new Date().toISOString() })
          .eq("id", device.deviceId);
      }
      return result;
    },
  });

  if (dispatch.attempts.length > 0) {
    const attemptRows = dispatch.attempts.map((attempt) => ({
      broadcast_id: args.broadcast.id,
      user_id: attempt.userId,
      device_id: attempt.deviceId || null,
      outcome: attempt.outcome,
      apns_status: attempt.status || null,
      apns_reason: attempt.reason,
      apns_id: attempt.apnsId,
    }));
    const { error } = await admin.from("push_broadcast_attempts").insert(attemptRows);
    if (error && error.code !== "23505" && !isMissingRelation(error)) {
      throw new ApiError(400, error.message, "PUSH_BROADCAST_ATTEMPT_LOG_FAILED");
    }
    for (const attempt of dispatch.attempts) {
      if (attempt.outcome !== "invalid_token") continue;
      const device = devices.find((item) => item.deviceId === attempt.deviceId);
      if (device) await disablePushDeviceByToken(device.token).catch(() => undefined);
    }
  }

  const acceptedCount = args.broadcast.acceptedCount + dispatch.accepted;
  const failedCount = args.broadcast.failedCount + dispatch.failed;
  const status = dispatch.appleContacted || dispatch.attempts.length === 0 ? "completed" : "failed";
  const { data: finished, error: finishError } = await admin
    .from("push_broadcasts")
    .update({
      status,
      in_app_written: inAppWritten,
      accepted_count: acceptedCount,
      failed_count: failedCount,
      apple_contacted: args.broadcast.appleContacted || dispatch.appleContacted,
    })
    .eq("id", args.broadcast.id)
    .select(BROADCAST_SELECT)
    .single();
  if (finishError || !finished) {
    throw new ApiError(400, finishError?.message ?? "Could not finish the announcement.", "PUSH_BROADCAST_FINISH_FAILED");
  }
  return mapStored(finished as Record<string, unknown>, args.broadcast.duplicate);
}

async function loadIosDevices(userIds: string[]): Promise<PushDeviceTarget[]> {
  if (userIds.length === 0) return [];
  const admin = createAdminClient();
  const devices: PushDeviceTarget[] = [];
  for (let index = 0; index < userIds.length; index += 200) {
    const slice = userIds.slice(index, index + 200);
    const { data, error } = await admin
      .from("push_devices")
      .select("id, user_id, device_token, environment")
      .in("user_id", slice)
      .eq("enabled", true)
      .eq("platform", "ios");
    if (error) {
      if (error.code === "42P01") return devices;
      throw new ApiError(400, error.message, "PUSH_DEVICE_LOOKUP_FAILED");
    }
    for (const row of data ?? []) {
      const token = String(row.device_token ?? "");
      if (!token) continue;
      devices.push({
        userId: String(row.user_id),
        deviceId: String(row.id),
        token,
        environment: row.environment === "development" ? "development" : "production",
      });
    }
  }
  return devices;
}

type ProfileRow = {
  id: string;
  role: string | null;
  campus_email_verified_at: string | null;
};

export async function loadBroadcastRecipients(audienceUserId?: string | null): Promise<RecipientSnapshot[]> {
  const admin = createAdminClient();
  const profiles: ProfileRow[] = [];
  if (audienceUserId) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, role, campus_email_verified_at")
      .eq("id", audienceUserId)
      .maybeSingle();
    if (error) throw new ApiError(400, error.message, "PUSH_AUDIENCE_LOOKUP_FAILED");
    if (!data) throw new ApiError(404, "That user could not be found.", "PUSH_AUDIENCE_USER_NOT_FOUND");
    profiles.push(data as ProfileRow);
  } else {
    const pageSize = 1000;
    for (let page = 0; page < 50; page += 1) {
      const from = page * pageSize;
      const { data, error } = await admin
        .from("profiles")
        .select("id, role, campus_email_verified_at")
        .range(from, from + pageSize - 1);
      if (error) throw new ApiError(400, error.message, "PUSH_AUDIENCE_LOOKUP_FAILED");
      const rows = (data ?? []) as ProfileRow[];
      profiles.push(...rows);
      if (rows.length < pageSize) break;
    }
  }

  const ids = profiles.map((profile) => profile.id);
  const settingsByUser = new Map<string, { push: boolean; announcements: boolean; perks: boolean }>();
  const deviceUsers = new Set<string>();
  if (ids.length > 0) {
    const settingsSelect = audienceUserId
      ? admin.from("user_push_settings").select("user_id, push_enabled, announcements_enabled, perks_enabled").eq("user_id", audienceUserId)
      : admin.from("user_push_settings").select("user_id, push_enabled, announcements_enabled, perks_enabled");
    const settingsResult = await settingsSelect;
    if (settingsResult.error && !/announcements_enabled|perks_enabled|42703/.test(settingsResult.error.message ?? "")) {
      throw new ApiError(400, settingsResult.error.message, "PUSH_SETTINGS_LOOKUP_FAILED");
    }
    const settingsRows = settingsResult.error
      ? ((
          await admin.from("user_push_settings").select("user_id, push_enabled")
        ).data ?? [])
      : (settingsResult.data ?? []);
    for (const row of settingsRows as Array<Record<string, unknown>>) {
      settingsByUser.set(String(row.user_id), {
        push: row.push_enabled !== false,
        announcements: row.announcements_enabled !== false,
        perks: row.perks_enabled === true,
      });
    }

    let deviceQuery = admin.from("push_devices").select("user_id").eq("enabled", true).eq("platform", "ios");
    if (audienceUserId) deviceQuery = deviceQuery.eq("user_id", audienceUserId);
    const { data: devices, error: deviceError } = await deviceQuery;
    if (deviceError && deviceError.code !== "42P01") {
      throw new ApiError(400, deviceError.message, "PUSH_DEVICE_LOOKUP_FAILED");
    }
    for (const row of devices ?? []) deviceUsers.add(String(row.user_id));
  }

  return profiles.map((profile) => {
    const settings = settingsByUser.get(profile.id);
    return {
      userId: profile.id,
      role: profile.role ?? "student",
      verified: Boolean(profile.campus_email_verified_at),
      pushEnabled: settings?.push ?? true,
      announcementsEnabled: settings?.announcements ?? true,
      perksEnabled: settings?.perks ?? false,
      hasIosDevice: deviceUsers.has(profile.id),
    };
  });
}
