import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { logNotificationInfo } from "@/lib/server/notificationDebug";
import { sendConnectionRequest } from "@/lib/server/messaging";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { connectionRequestSchema, readJson } from "@/lib/server/validation";

export async function handleSendConnectionRequestPost(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "social:connections:request",
      limit: 8,
      windowMs: 60_000,
      message: "You're doing that too often. Please try again later.",
      code: "ABUSE_RATE_LIMITED",
    });
    const input = await readJson(request, connectionRequestSchema);
    logNotificationInfo("friend-request:api", {
      senderUserId: auth.user.id,
      targetUsername: input.username,
    });
    const result = await sendConnectionRequest({
      userClient: auth.userClient,
      userId: auth.user.id,
      targetUsername: input.username,
    });
    logNotificationInfo("friend-request:api-success", {
      senderUserId: auth.user.id,
      recipientUserId: result.addressee_id,
      targetUsername: input.username,
      friendRequestId: result.id,
      notificationId: result.notificationId,
      notificationUserId: result.addressee_id,
      outcome: result.outcome,
    });
    const responseStatus =
      result.outcome === "created"
        ? "sent"
        : result.outcome === "already_connected"
          ? "connected"
          : result.outcome;
    return ok(
      {
        status: responseStatus,
        message: result.message,
        connection: {
          id: result.id,
          requesterId: result.requester_id,
          addresseeId: result.addressee_id,
          status: result.status,
          createdAt: result.created_at,
        },
        notification: result.notificationId
          ? {
              id: result.notificationId,
              userId: result.addressee_id,
            }
          : null,
      },
      result.outcome === "created" ? 201 : 200,
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
