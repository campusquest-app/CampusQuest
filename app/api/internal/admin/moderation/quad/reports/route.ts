import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { enforceRateLimit } from "@/lib/server/security";
import {
  deleteReportedQuadPostSchema,
  readJson,
  resolveQuadPostReportSchema,
} from "@/lib/server/validation";

function moderationKey() {
  const key = process.env.MESSAGE_MODERATION_API_KEY;
  if (!key) {
    throw new ApiError(500, "Moderation key is not configured.", "MODERATION_KEY_MISSING");
  }
  return key;
}

async function forwardModerationRequest(request: Request, init: RequestInit) {
  const url = new URL("/api/moderation/quad/reports", request.url);
  url.search = new URL(request.url).search;
  const response = await fetch(url.toString(), {
    ...init,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({} as { data?: unknown; error?: { message?: string; code?: string } }));
  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.error?.message ?? "Moderation request failed.",
      payload?.error?.code ?? "MODERATION_REQUEST_FAILED",
    );
  }
  return payload?.data;
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdminUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "internal:moderation:quad:reports:get", limit: 30, windowMs: 60_000 });
    const data = await forwardModerationRequest(request, {
      method: "GET",
      headers: {
        "x-message-moderation-key": moderationKey(),
        "x-admin-email": auth.normalizedEmail,
      },
    });
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "internal:moderation:quad:reports:post", limit: 20, windowMs: 60_000 });
    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    if (action === "delete-post") {
      const input = await readJson(request, deleteReportedQuadPostSchema);
      const data = await forwardModerationRequest(request, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-message-moderation-key": moderationKey(),
          "x-admin-email": auth.normalizedEmail,
        },
        body: JSON.stringify({
          ...input,
          reviewerUserId: auth.user.id,
          reviewerEmail: auth.normalizedEmail,
        }),
      });
      return ok(data);
    }

    const input = await readJson(request, resolveQuadPostReportSchema);
    const data = await forwardModerationRequest(request, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-message-moderation-key": moderationKey(),
        "x-admin-email": auth.normalizedEmail,
      },
      body: JSON.stringify({
        ...input,
        reviewerUserId: auth.user.id,
        reviewerEmail: auth.normalizedEmail,
      }),
    });
    return ok(data);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
