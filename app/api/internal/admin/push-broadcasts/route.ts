import { ZodError, z } from "zod";
import {
  apnsDataForDestination,
  assertShareablePost,
  normalizeBroadcastCopy,
  planBroadcast,
  validateBroadcastDraft,
  type BroadcastDraft,
} from "@/lib/push/adminBroadcast";
import { beginBroadcast, deliverBroadcast, loadBroadcastRecipients } from "@/lib/server/adminPushBroadcast";
import { isApnsConfigured } from "@/lib/server/apnsProvider";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { createAdminClient } from "@/lib/server/supabase";
import { formatZodError } from "@/lib/server/zodErrors";
import { readJson } from "@/lib/server/validation";

const destinationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("campus_feed") }),
  z.object({ kind: z.literal("local_businesses") }),
  z.object({ kind: z.literal("events") }),
  z.object({ kind: z.literal("student_perks") }),
  z.object({ kind: z.literal("post"), postId: z.string().uuid() }),
  z.object({ kind: z.literal("event"), eventId: z.string().uuid() }),
]);

const bodySchema = z.object({
  idempotencyKey: z.string().uuid(),
  mode: z.enum(["test", "audience"]),
  audience: z.enum(["opted_in", "verified_students", "local_business", "user"]),
  userId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(180),
  category: z.enum(["announcements", "perks"]),
  destination: destinationSchema,
  confirm: z.string().trim().max(12),
});

/**
 * Signed-in admin identity and that account's iPhones.
 * Device tokens are never selected or returned.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireAdminUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "admin:push-broadcast:get",
      limit: 30,
      windowMs: 60_000,
    });
    const admin = createAdminClient();
    const profile = await admin
      .from("profiles")
      .select("id, username, display_name")
      .eq("id", auth.user.id)
      .maybeSingle();
    const devicesResult = await admin
      .from("push_devices")
      .select("id, platform, environment, enabled, last_seen_at, permission_status")
      .eq("user_id", auth.user.id)
      .order("last_seen_at", { ascending: false });
    const legacyDevices = devicesResult.error
      ? await admin
          .from("push_devices")
          .select("id, platform, environment, enabled, last_seen_at")
          .eq("user_id", auth.user.id)
          .order("last_seen_at", { ascending: false })
      : null;
    const deviceRows = (devicesResult.error ? legacyDevices?.data : devicesResult.data) ?? [];
    const production = (process.env.APNS_PRODUCTION ?? "true").toLowerCase() !== "false";
    return ok({
      apns: {
        configured: isApnsConfigured(),
        production,
        keyIdMatches: process.env.APNS_KEY_ID?.trim() === "34Q7U6QWCT",
        teamIdMatches: process.env.APNS_TEAM_ID?.trim() === "484VK346B4",
        bundleIdMatches: (process.env.APNS_BUNDLE_ID?.trim() || "com.nicklockhart.campusquest") === "com.nicklockhart.campusquest",
      },
      account: {
        userId: auth.user.id,
        username: profile.data?.username ?? null,
        displayName: profile.data?.display_name ?? null,
      },
      devices: deviceRows.map((row) => ({
        id: row.id as string,
        platform: row.platform as string,
        environment: row.environment as string,
        enabled: row.enabled === true,
        lastSeenAt: row.last_seen_at as string,
        permissionStatus: "permission_status" in row ? ((row.permission_status as string | null) ?? null) : null,
      })),
    });
  } catch (error) {
    return fail(error);
  }
}

/**
 * Admin-only announcement send. A test is limited to one user.
 * Apple acceptance is reported separately from delivery.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAdminUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "admin:push-broadcast",
      limit: 8,
      windowMs: 10 * 60_000,
    });
    const input = await readJson(request, bodySchema);
    const copy = normalizeBroadcastCopy(input.title, input.body);
    const draft: BroadcastDraft = {
      mode: input.mode,
      audience: input.audience,
      userId: input.userId ?? null,
      title: copy.title,
      body: copy.body,
      category: input.category,
      destination: input.destination,
      confirm: input.confirm,
    };
    const problem = validateBroadcastDraft(draft);
    if (problem) throw new ApiError(400, problem, "PUSH_BROADCAST_INVALID");

    const postFeed = await loadPostFeed(draft);
    const recipients = await loadBroadcastRecipients(draft.audience === "user" ? draft.userId : null);
    const plan = planBroadcast(draft, recipients, postFeed);
    const started = await beginBroadcast({
      adminId: auth.user.id,
      idempotencyKey: input.idempotencyKey,
      draft,
      plan,
    });
    const alreadyFinished = started.duplicate && started.status !== "sending";
    const stored = alreadyFinished
      ? started
      : await deliverBroadcast({
          broadcast: { ...started, duplicate: alreadyFinished },
          draft,
          plan,
        });

    return ok({
      broadcastId: stored.id,
      status: stored.status,
      duplicate: stored.duplicate,
      appleContacted: stored.appleContacted,
      inAppCount: stored.inAppCount,
      pushCount: stored.pushCount,
      acceptedCount: stored.acceptedCount,
      failedCount: stored.failedCount,
      skipped: stored.skipped,
      destination: apnsDataForDestination(draft.destination),
      message: broadcastResultMessage(stored),
    });
  } catch (error) {
    if (error instanceof ZodError) return fail(new ApiError(400, formatZodError(error), "VALIDATION_ERROR"));
    return fail(error);
  }
}

function broadcastResultMessage(stored: {
  duplicate: boolean;
  status: string;
  appleContacted: boolean;
  acceptedCount: number;
  failedCount: number;
}): string {
  if (stored.duplicate) {
    return "This notification was already submitted. It was not sent again.";
  }
  if (!stored.appleContacted && stored.failedCount > 0) {
    return "Apple was not contacted. The server is missing APNs credentials, or every request failed before Apple accepted it.";
  }
  if (stored.appleContacted) {
    return `Apple accepted ${stored.acceptedCount} request(s) and rejected ${stored.failedCount}. Acceptance does not mean a phone displayed the notification.`;
  }
  return "No APNs request was made. Eligible people still received the in-app notification when the audience included them.";
}

async function loadPostFeed(draft: BroadcastDraft): Promise<string | null> {
  if (draft.destination.kind === "event") {
    const admin = createAdminClient();
    const campus = await admin.from("campus_events").select("id").eq("id", draft.destination.eventId).maybeSingle();
    if (campus.data?.id) return null;
    const external = await admin.from("external_events").select("id").eq("id", draft.destination.eventId).maybeSingle();
    if (external.data?.id) return null;
    throw new ApiError(404, "That event could not be found.", "PUSH_DESTINATION_NOT_FOUND");
  }
  if (draft.destination.kind !== "post") return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("quad_posts")
    .select("id, visibility, is_anonymous, feed_destination")
    .eq("id", draft.destination.postId)
    .maybeSingle();
  if (error) throw new ApiError(400, error.message, "PUSH_DESTINATION_LOOKUP_FAILED");
  if (!data) throw new ApiError(404, "That post could not be found.", "PUSH_DESTINATION_NOT_FOUND");
  const problem = assertShareablePost({
    isAnonymous: data.is_anonymous === true,
    visibility: String(data.visibility ?? ""),
    feed: String(data.feed_destination ?? ""),
  });
  if (problem) throw new ApiError(400, problem, "PUSH_DESTINATION_FORBIDDEN");
  return String(data.feed_destination ?? "");
}
