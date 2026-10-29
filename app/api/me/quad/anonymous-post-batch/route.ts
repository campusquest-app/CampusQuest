import { ZodError } from "zod";
import { z } from "zod";
import { fail, ok, ApiError } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { createAdminClient, requireAuthUser } from "@/lib/server/supabase";
import { readJson } from "@/lib/server/validation";
import { formatZodError } from "@/lib/server/zodErrors";
import { assertAccountCanSocialize } from "@/lib/server/accountSafety";
import { assertAnonymousNoticeAccepted } from "@/lib/server/anonymousPosts";
import { deleteQuadPost } from "@/lib/server/quadPostMutations";
import { getPilotSchoolConfig } from "@/lib/server/pilotMode";
import { requireVerifiedSchoolForCoreAccess } from "@/lib/server/schoolVerification";
import {
  listOwnedBatchReceipts,
  markPublishReceiptDeleted,
} from "@/lib/server/publishReceipts";
import {
  URI_HALLOWEEN_ANON_BATCH_ID,
  URI_HALLOWEEN_ANON_POSTS,
  anonymousBatchHostError,
  classifyAnonymousBatchFailure,
  runAnonymousBatch,
  type AnonymousBatchItem,
} from "@/lib/anonymousPostBatch";
import { POST as createQuadPost } from "@/app/api/quad/posts/route";

const confirmSchema = z.object({
  confirmBatchId: z.literal(URI_HALLOWEEN_ANON_BATCH_ID),
}).strict();

const deleteSchema = z.object({
  batchId: z.literal(URI_HALLOWEEN_ANON_BATCH_ID),
}).strict();

function requestHost(request: Request): string | null {
  return request.headers.get("x-forwarded-host") ?? request.headers.get("host");
}

function assertUriProduction(request: Request) {
  const hostError = anonymousBatchHostError(requestHost(request));
  if (hostError) {
    throw new ApiError(409, hostError, "BATCH_ENVIRONMENT_MISMATCH");
  }
  const pilot = getPilotSchoolConfig();
  if (pilot.schoolDomain !== "uri.edu") {
    throw new ApiError(409, "This server is not the URI campus.", "BATCH_ENVIRONMENT_MISMATCH");
  }
}

async function publishBatchItem(request: Request, item: AnonymousBatchItem) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new ApiError(401, "Missing bearer token.", "UNAUTHORIZED");
  }
  const response = await createQuadPost(
    new Request(new URL("/api/quad/posts", request.url), {
      method: "POST",
      headers: {
        authorization,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        body: item.body,
        anonymous: true,
        visibility: "public",
        feedDestination: "campus",
        postedAsType: "personal",
        publishIdempotencyKey: item.idempotencyKey,
        publishBatchId: URI_HALLOWEEN_ANON_BATCH_ID,
      }),
    }),
  );
  const payload = (await response.json()) as {
    data?: { post?: { id?: string } | null; idempotent?: boolean };
    error?: { message?: string; code?: string };
  };
  if (response.ok && payload.data?.post?.id) {
    return {
      type: "published" as const,
      postId: payload.data.post.id,
      idempotent: payload.data.idempotent === true,
    };
  }
  return classifyAnonymousBatchFailure(
    response.status,
    payload.error?.code ?? "QUAD_POST_CREATE_FAILED",
    payload.error?.message ?? "Could not create post.",
  );
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "quad:anonymous-batch:get", limit: 30, windowMs: 60_000 });
    const items = await listOwnedBatchReceipts({
      userId: auth.user.id,
      batchId: URI_HALLOWEEN_ANON_BATCH_ID,
    });
    return ok({
      batchId: URI_HALLOWEEN_ANON_BATCH_ID,
      items: items.map((item) => ({
        itemKey: item.itemKey,
        postId: item.postId,
        status: item.status,
      })),
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "quad:anonymous-batch:post", limit: 6, windowMs: 60_000 });
    await readJson(request, confirmSchema);
    assertUriProduction(request);
    const school = await requireVerifiedSchoolForCoreAccess({ userClient: auth.userClient, user: auth.user });
    if ((school.schoolDomain ?? "").toLowerCase() !== "uri.edu") {
      throw new ApiError(403, "A verified URI account is required for this Campus Feed batch.", "BATCH_SCHOOL_MISMATCH");
    }
    await assertAccountCanSocialize(auth.userClient, auth.user.id);
    await assertAnonymousNoticeAccepted(auth.user.id);

    const report = await runAnonymousBatch(URI_HALLOWEEN_ANON_POSTS, (item) => publishBatchItem(request, item));
    return ok({
      batchId: report.batchId,
      publishedCount: report.published.length,
      published: report.published,
      alreadyRemoved: report.alreadyRemoved,
      failed: report.failed,
      remaining: report.remaining,
      stopped: report.stopped,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, formatZodError(error), "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "quad:anonymous-batch:delete", limit: 10, windowMs: 60_000 });
    const input = await readJson(request, deleteSchema);
    const receipts = await listOwnedBatchReceipts({ userId: auth.user.id, batchId: input.batchId });
    const deletedPostIds: string[] = [];
    const failed: { itemKey: string; message: string }[] = [];
    for (const receipt of receipts) {
      if (!receipt.postId || receipt.status === "deleted") continue;
      try {
        await deleteQuadPost({
          userClient: auth.userClient,
          adminClient: createAdminClient(),
          postId: receipt.postId,
          userId: auth.user.id,
          isAdmin: false,
        });
        await markPublishReceiptDeleted({
          userId: auth.user.id,
          idempotencyKey: `${input.batchId}:${receipt.itemKey}`,
        });
        deletedPostIds.push(receipt.postId);
      } catch (error) {
        const message = error instanceof ApiError ? error.message : "Could not delete post.";
        if (error instanceof ApiError && (error.status === 404 || error.code === "QUAD_POST_NOT_FOUND")) {
          await markPublishReceiptDeleted({
            userId: auth.user.id,
            idempotencyKey: `${input.batchId}:${receipt.itemKey}`,
          });
          continue;
        }
        failed.push({ itemKey: receipt.itemKey, message });
      }
    }
    return ok({ batchId: input.batchId, deletedPostIds, failed });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, formatZodError(error), "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
