import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";

export type PushPlatform = "ios" | "android" | "web";
export type PushEnvironment = "development" | "production";

export type PushDeviceRow = {
  id: string;
  user_id: string;
  platform: PushPlatform;
  device_token: string;
  device_id: string | null;
  app_version: string | null;
  environment: PushEnvironment;
  enabled: boolean;
  last_seen_at: string;
};

/** Register or reassign a device token to the authenticated user (token unique globally). */
export async function upsertPushDevice(args: {
  userId: string;
  platform: PushPlatform;
  deviceToken: string;
  deviceId?: string | null;
  appVersion?: string | null;
  environment?: PushEnvironment;
}): Promise<PushDeviceRow> {
  const token = args.deviceToken.trim();
  if (!token || token.length < 16 || token.length > 512) {
    throw new ApiError(400, "Invalid device token.", "PUSH_TOKEN_INVALID");
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const environment = args.environment ?? "production";

  // If token exists for another user, reassign (device switched accounts).
  const { data, error } = await admin
    .from("push_devices")
    .upsert(
      {
        user_id: args.userId,
        platform: args.platform,
        device_token: token,
        device_id: args.deviceId?.trim() || null,
        app_version: args.appVersion?.trim() || null,
        environment,
        enabled: true,
        last_seen_at: now,
        updated_at: now,
      },
      { onConflict: "device_token" },
    )
    .select("id, user_id, platform, device_token, device_id, app_version, environment, enabled, last_seen_at")
    .single();

  if (error || !data) {
    throw new ApiError(400, error?.message ?? "Could not register device.", "PUSH_DEVICE_REGISTER_FAILED");
  }
  return data as PushDeviceRow;
}

/** Disable this device token for the user (logout / preference). */
export async function disablePushDeviceForUser(args: {
  userId: string;
  deviceToken?: string | null;
  deviceId?: string | null;
}): Promise<number> {
  const admin = createAdminClient();
  let query = admin
    .from("push_devices")
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq("user_id", args.userId)
    .eq("enabled", true);

  if (args.deviceToken?.trim()) {
    query = query.eq("device_token", args.deviceToken.trim());
  } else if (args.deviceId?.trim()) {
    query = query.eq("device_id", args.deviceId.trim());
  } else {
    // No token/device id → disable all of this user's devices (account switch / full logout).
  }

  const { data, error } = await query.select("id");
  if (error) {
    throw new ApiError(400, error.message, "PUSH_DEVICE_DISABLE_FAILED");
  }
  return data?.length ?? 0;
}

export async function listEnabledPushDevicesForUser(userId: string): Promise<PushDeviceRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("push_devices")
    .select("id, user_id, platform, device_token, device_id, app_version, environment, enabled, last_seen_at")
    .eq("user_id", userId)
    .eq("enabled", true);
  if (error) {
    throw new ApiError(400, error.message, "PUSH_DEVICE_LIST_FAILED");
  }
  return (data ?? []) as PushDeviceRow[];
}

export async function disablePushDeviceByToken(deviceToken: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("push_devices")
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq("device_token", deviceToken);
}

export type UserPushSettings = {
  pushEnabled: boolean;
  messagesEnabled: boolean;
  socialEnabled: boolean;
  eventsEnabled: boolean;
};

export async function getUserPushSettings(userId: string): Promise<UserPushSettings> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_push_settings")
    .select("push_enabled, messages_enabled, social_enabled, events_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    pushEnabled: data?.push_enabled !== false,
    messagesEnabled: data?.messages_enabled !== false,
    socialEnabled: data?.social_enabled !== false,
    eventsEnabled: data?.events_enabled !== false,
  };
}

export async function upsertUserPushSettings(
  userId: string,
  patch: Partial<UserPushSettings>,
): Promise<UserPushSettings> {
  const current = await getUserPushSettings(userId);
  const next = {
    push_enabled: patch.pushEnabled ?? current.pushEnabled,
    messages_enabled: patch.messagesEnabled ?? current.messagesEnabled,
    social_enabled: patch.socialEnabled ?? current.socialEnabled,
    events_enabled: patch.eventsEnabled ?? current.eventsEnabled,
    updated_at: new Date().toISOString(),
  };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_push_settings")
    .upsert({ user_id: userId, ...next }, { onConflict: "user_id" })
    .select("push_enabled, messages_enabled, social_enabled, events_enabled")
    .single();
  if (error || !data) {
    throw new ApiError(400, error?.message ?? "Could not save push settings.", "PUSH_SETTINGS_SAVE_FAILED");
  }
  return {
    pushEnabled: data.push_enabled !== false,
    messagesEnabled: data.messages_enabled !== false,
    socialEnabled: data.social_enabled !== false,
    eventsEnabled: data.events_enabled !== false,
  };
}
