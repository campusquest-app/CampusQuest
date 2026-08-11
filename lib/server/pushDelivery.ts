import {
  buildPushPayload,
  PUSH_ENABLED_NOTIFICATION_TYPES,
  pushCategoryForType,
} from "@/lib/pushNotificationTypes";
import { isApnsConfigured, sendApnsAlert } from "@/lib/server/apnsProvider";
import {
  disablePushDeviceByToken,
  getUserPushSettings,
  listEnabledPushDevicesForUser,
} from "@/lib/server/pushDevices";

type DispatchArgs = {
  notificationId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
};

/**
 * Fire-and-forget native push after an in-app notification is created.
 * Never throws into the caller — delivery failures must not break domain APIs.
 */
export function enqueuePushForNotification(args: DispatchArgs): void {
  void dispatchPushForNotification(args).catch((error) => {
    console.error("[cq:push] dispatch failed", {
      notificationId: args.notificationId,
      userId: args.userId,
      type: args.type,
      message: error instanceof Error ? error.message : "unknown",
    });
  });
}

export async function dispatchPushForNotification(args: DispatchArgs): Promise<{ sent: number; skipped: string }> {
  if (!PUSH_ENABLED_NOTIFICATION_TYPES.has(args.type)) {
    return { sent: 0, skipped: "type_filtered" };
  }
  if (!isApnsConfigured()) {
    return { sent: 0, skipped: "apns_not_configured" };
  }

  const settings = await getUserPushSettings(args.userId);
  if (!settings.pushEnabled) return { sent: 0, skipped: "push_disabled" };

  const category = pushCategoryForType(args.type);
  if (category === "messages" && !settings.messagesEnabled) return { sent: 0, skipped: "messages_disabled" };
  if (category === "social" && !settings.socialEnabled) return { sent: 0, skipped: "social_disabled" };
  if (category === "events" && !settings.eventsEnabled) return { sent: 0, skipped: "events_disabled" };

  const devices = await listEnabledPushDevicesForUser(args.userId);
  const iosDevices = devices.filter((d) => d.platform === "ios");
  if (iosDevices.length === 0) return { sent: 0, skipped: "no_devices" };

  const payload = buildPushPayload({
    type: args.type,
    notificationId: args.notificationId,
    relatedEntityType: args.relatedEntityType,
    relatedEntityId: args.relatedEntityId,
  });

  // APNs custom data must be strings for our simple payload merge.
  const data: Record<string, string> = {
    type: payload.type,
    notification_id: payload.notificationId,
  };
  if (payload.relatedEntityType) data.related_entity_type = payload.relatedEntityType;
  if (payload.relatedEntityId) data.related_entity_id = payload.relatedEntityId;
  if (payload.conversationId) data.conversation_id = payload.conversationId;
  if (payload.postId) data.post_id = payload.postId;
  if (payload.eventId) data.event_id = payload.eventId;

  let sent = 0;
  for (const device of iosDevices) {
    const result = await sendApnsAlert({
      deviceToken: device.device_token,
      title: args.title,
      body: args.body,
      data,
      environment: device.environment,
    });
    if (result.ok) {
      sent += 1;
      continue;
    }
    console.warn("[cq:push] apns failure", {
      userId: args.userId,
      reason: result.reason,
      status: result.status,
      invalidToken: result.invalidToken,
    });
    if (result.invalidToken) {
      await disablePushDeviceByToken(device.device_token).catch(() => undefined);
    }
  }

  return { sent, skipped: sent > 0 ? "ok" : "all_failed" };
}
