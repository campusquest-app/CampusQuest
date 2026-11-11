/**
 * Rules for admin push announcements.
 * Planning never contacts Apple and never includes device tokens.
 */

export type BroadcastAudience = "opted_in" | "verified_students" | "local_business" | "user";
export type BroadcastMode = "test" | "audience";
export type BroadcastCategory = "announcements" | "perks";

export type BroadcastDestination =
  | { kind: "campus_feed" }
  | { kind: "local_businesses" }
  | { kind: "events" }
  | { kind: "student_perks" }
  | { kind: "post"; postId: string }
  | { kind: "event"; eventId: string };

export type BroadcastDraft = {
  mode: BroadcastMode;
  audience: BroadcastAudience;
  userId?: string | null;
  title: string;
  body: string;
  category: BroadcastCategory;
  destination: BroadcastDestination;
  confirm: string;
};

export type RecipientSnapshot = {
  userId: string;
  role: string;
  verified: boolean;
  pushEnabled: boolean;
  announcementsEnabled: boolean;
  perksEnabled: boolean;
  hasIosDevice: boolean;
};

export type PublicPostTarget = {
  isAnonymous: boolean;
  visibility: string;
  feed: string;
};

export type PlannedRecipient = {
  userId: string;
  inApp: boolean;
  push: boolean;
};

export type BroadcastPlan = {
  recipients: PlannedRecipient[];
  inAppCount: number;
  pushCount: number;
  skipped: Record<string, number>;
};

const TITLE_MAX = 80;
const BODY_MAX = 180;

export function normalizeBroadcastCopy(title: string, body: string): { title: string; body: string } {
  return {
    title: title.trim().slice(0, TITLE_MAX),
    body: body.trim().slice(0, BODY_MAX),
  };
}

export function validateBroadcastDraft(draft: BroadcastDraft): string | null {
  const copy = normalizeBroadcastCopy(draft.title, draft.body);
  if (!copy.title) return "Add a notification title.";
  if (!copy.body) return "Add a notification message.";
  if (draft.mode === "test") {
    if (draft.audience !== "user" || !draft.userId) {
      return "A test notification can only go to the one user you selected.";
    }
    if (draft.confirm !== "TEST") return "Confirm the test before planning it.";
  } else if (draft.mode === "audience") {
    if (draft.audience === "user" && !draft.userId) return "Choose the user for this notification.";
    if (draft.confirm !== "SEND") return "Confirm the audience before planning it.";
  } else {
    return "Choose how this notification should be planned.";
  }
  if (draft.destination.kind === "post" && !draft.destination.postId) return "Choose a public post.";
  if (draft.destination.kind === "event" && !draft.destination.eventId) return "Choose an event.";
  return null;
}

/** Anonymous posts cannot be a tap destination. The author is not part of this check. */
export function assertShareablePost(post: PublicPostTarget): string | null {
  if (post.isAnonymous) return "Anonymous posts cannot be notification destinations.";
  if (post.visibility !== "public") return "Only a public post can be a notification destination.";
  if (!post.feed) return "That post has no feed destination.";
  return null;
}

export function destinationAllowedForRole(
  role: string,
  destination: BroadcastDestination,
  postFeed?: string | null,
): boolean {
  if (role !== "local_business") return true;
  if (destination.kind === "local_businesses" || destination.kind === "student_perks") return true;
  if (destination.kind === "post") return postFeed === "local_businesses";
  return false;
}

function audienceIncludes(recipient: RecipientSnapshot, draft: BroadcastDraft): boolean {
  if (draft.audience === "user") return recipient.userId === draft.userId;
  if (draft.audience === "verified_students") return recipient.role === "student" && recipient.verified;
  if (draft.audience === "local_business") return recipient.role === "local_business";
  return true;
}

function categoryAllows(recipient: RecipientSnapshot, category: BroadcastCategory): boolean {
  if (category === "perks") return recipient.perksEnabled;
  return recipient.announcementsEnabled;
}

export function planBroadcast(
  draft: BroadcastDraft,
  recipients: readonly RecipientSnapshot[],
  postFeed?: string | null,
): BroadcastPlan {
  const invalid = validateBroadcastDraft(draft);
  if (invalid) throw new Error(invalid);

  const skipped: Record<string, number> = {};
  const planned: PlannedRecipient[] = [];
  const bump = (reason: string) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
  };

  for (const recipient of recipients) {
    if (draft.mode === "test" && recipient.userId !== draft.userId) {
      bump("outside_test_user");
      continue;
    }
    if (!audienceIncludes(recipient, draft)) {
      bump("outside_audience");
      continue;
    }
    if (!categoryAllows(recipient, draft.category)) {
      bump(draft.category === "perks" ? "perks_opt_out" : "announcements_off");
      continue;
    }
    if (!destinationAllowedForRole(recipient.role, draft.destination, postFeed)) {
      bump("destination_forbidden");
      continue;
    }
    const push = recipient.pushEnabled && recipient.hasIosDevice;
    planned.push({ userId: recipient.userId, inApp: true, push });
    if (!push) bump("push_unavailable");
  }

  return {
    recipients: planned,
    inAppCount: planned.length,
    pushCount: planned.filter((item) => item.push).length,
    skipped,
  };
}

export function broadcastContentKey(draft: BroadcastDraft): string {
  const copy = normalizeBroadcastCopy(draft.title, draft.body);
  const destination =
    draft.destination.kind === "post"
      ? `post:${draft.destination.postId}`
      : draft.destination.kind === "event"
        ? `event:${draft.destination.eventId}`
        : draft.destination.kind;
  return [
    draft.mode,
    draft.audience,
    draft.userId ?? "",
    draft.category,
    destination,
    copy.title,
    copy.body,
  ].join("\n");
}

/** A repeat of the same plan must not create another in-app row. */
export function unsentRecipients(
  plan: BroadcastPlan,
  alreadyNotified: ReadonlySet<string>,
): PlannedRecipient[] {
  return plan.recipients.filter((recipient) => !alreadyNotified.has(recipient.userId));
}

export function notificationLink(
  destination: BroadcastDestination,
  broadcastId: string,
): { relatedEntityType: string; relatedEntityId: string } {
  if (destination.kind === "post") {
    return { relatedEntityType: "quad_post", relatedEntityId: destination.postId };
  }
  if (destination.kind === "event") {
    return { relatedEntityType: "event", relatedEntityId: destination.eventId };
  }
  return { relatedEntityType: destination.kind, relatedEntityId: broadcastId };
}

export type PushDeviceTarget = {
  userId: string;
  deviceId: string;
  token: string;
  environment: "development" | "production";
};

export type PushAttempt = {
  userId: string;
  deviceId: string;
  outcome: "accepted" | "rejected" | "invalid_token" | "not_configured";
  apnsId: string | null;
  status: number;
  reason: string | null;
};

export type PushSendResult =
  | { ok: true; apnsId: string }
  | { ok: false; status: number; reason: string; invalidToken: boolean };

function attemptKey(userId: string, deviceId: string) {
  return `${userId}:${deviceId}`;
}

/**
 * Sends only to planned recipients. A test plan cannot reach any other user.
 * The returned attempts never include device tokens.
 * Apple accepting a request is recorded as "accepted", which is not delivery.
 */
export async function dispatchBroadcastPushes(args: {
  mode: BroadcastMode;
  testUserId?: string | null;
  recipients: readonly PlannedRecipient[];
  devices: readonly PushDeviceTarget[];
  alreadyAttempted: ReadonlySet<string>;
  configured: boolean;
  sender: (device: PushDeviceTarget) => Promise<PushSendResult>;
}): Promise<{ attempts: PushAttempt[]; appleContacted: boolean; accepted: number; failed: number }> {
  const pushUsers = new Set(args.recipients.filter((recipient) => recipient.push).map((recipient) => recipient.userId));
  const attempts: PushAttempt[] = [];
  let appleContacted = false;

  if (!args.configured) {
    for (const userId of Array.from(pushUsers)) {
      if (args.mode === "test" && userId !== args.testUserId) continue;
      attempts.push({
        userId,
        deviceId: "",
        outcome: "not_configured",
        apnsId: null,
        status: 0,
        reason: "APNS_NOT_CONFIGURED",
      });
    }
    return { attempts, appleContacted: false, accepted: 0, failed: attempts.length };
  }

  for (const device of args.devices) {
    if (!pushUsers.has(device.userId)) continue;
    if (args.mode === "test" && device.userId !== args.testUserId) continue;
    if (args.alreadyAttempted.has(attemptKey(device.userId, device.deviceId))) continue;
    appleContacted = true;
    try {
      const result = await args.sender(device);
      if (result.ok) {
        attempts.push({
          userId: device.userId,
          deviceId: device.deviceId,
          outcome: "accepted",
          apnsId: result.apnsId,
          status: 200,
          reason: null,
        });
        continue;
      }
      attempts.push({
        userId: device.userId,
        deviceId: device.deviceId,
        outcome: result.invalidToken ? "invalid_token" : "rejected",
        apnsId: null,
        status: result.status,
        reason: result.reason,
      });
    } catch (error) {
      attempts.push({
        userId: device.userId,
        deviceId: device.deviceId,
        outcome: "rejected",
        apnsId: null,
        status: 0,
        reason: error instanceof Error ? error.message : "APNS_REQUEST_ERROR",
      });
    }
  }

  const accepted = attempts.filter((attempt) => attempt.outcome === "accepted").length;
  const failed = attempts.length - accepted;
  return { attempts, appleContacted, accepted, failed };
}

export function apnsDataForDestination(destination: BroadcastDestination): Record<string, string> {
  const data: Record<string, string> = {
    type: "campus_announcement",
    destination: destination.kind,
  };
  if (destination.kind === "post") {
    data.post_id = destination.postId;
    data.related_entity_type = "quad_post";
    data.related_entity_id = destination.postId;
  }
  if (destination.kind === "event") {
    data.event_id = destination.eventId;
    data.related_entity_type = "event";
    data.related_entity_id = destination.eventId;
  }
  return data;
}

export type DeviceRegistration = {
  token: string;
  userId: string;
  enabled: boolean;
};

/** Token uniqueness is global. A new login replaces the previous owner of that token. */
export function registerDeviceToken(
  devices: readonly DeviceRegistration[],
  token: string,
  userId: string,
): DeviceRegistration[] {
  const next = devices.filter((device) => device.token !== token);
  next.push({ token, userId, enabled: true });
  return next;
}

export function disableDeviceTokens(
  devices: readonly DeviceRegistration[],
  userId: string,
  token?: string | null,
): DeviceRegistration[] {
  return devices.map((device) => {
    if (device.userId !== userId) return device;
    if (token && device.token !== token) return device;
    return { ...device, enabled: false };
  });
}

export function enabledTokensForUser(devices: readonly DeviceRegistration[], userId: string): string[] {
  return devices.filter((device) => device.userId === userId && device.enabled).map((device) => device.token);
}

/** iOS permission is requested once. A denial must not prompt again. */
export function osPermissionStep(current: "prompt" | "granted" | "denied"): "register" | "request" | "stop" {
  if (current === "granted") return "register";
  if (current === "denied") return "stop";
  return "request";
}
