import "server-only";
import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";

export type PublishReceiptClaim = {
  proceed: boolean;
  postId: string | null;
  alreadyRemoved: boolean;
};

function receiptError(error: { code?: string; message?: string } | null, code: string, message: string) {
  if (!error) return;
  throw new ApiError(400, message, error.code === "42P01" ? "PUBLISH_RECEIPT_UNAVAILABLE" : code);
}

export async function beginPublishReceipt(
  args: {
    userId: string;
    idempotencyKey: string;
    batchId: string;
  },
  attempt = 0,
): Promise<PublishReceiptClaim> {
  const admin = createAdminClient();
  const { data: existing, error: readError } = await admin
    .from("quad_publish_receipts")
    .select("post_id, status")
    .eq("user_id", args.userId)
    .eq("idempotency_key", args.idempotencyKey)
    .maybeSingle();
  receiptError(readError, "PUBLISH_RECEIPT_LOOKUP_FAILED", "Could not check this post.");
  if (existing && (existing.status === "published" || existing.status === "deleted")) {
    const postId = existing.post_id ? String(existing.post_id) : null;
    return {
      proceed: false,
      postId,
      alreadyRemoved: existing.status === "deleted" || !postId,
    };
  }
  if (!existing) {
    const { error: insertError } = await admin.from("quad_publish_receipts").insert({
      user_id: args.userId,
      idempotency_key: args.idempotencyKey,
      batch_id: args.batchId,
      status: "creating",
    });
    if (insertError?.code === "23505") {
      if (attempt >= 1) {
        throw new ApiError(409, "This post is already being published.", "PUBLISH_IN_PROGRESS");
      }
      return beginPublishReceipt(args, attempt + 1);
    }
    receiptError(insertError, "PUBLISH_RECEIPT_FAILED", "Could not start this post.");
  }
  return { proceed: true, postId: null, alreadyRemoved: false };
}

export async function completePublishReceipt(args: {
  userId: string;
  idempotencyKey: string;
  batchId: string;
  postId: string;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("quad_publish_receipts")
    .update({ post_id: args.postId, status: "published", batch_id: args.batchId })
    .eq("user_id", args.userId)
    .eq("idempotency_key", args.idempotencyKey);
  receiptError(error, "PUBLISH_RECEIPT_FAILED", "Could not record this post.");
}

export async function releasePublishReceipt(args: { userId: string; idempotencyKey: string }): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("quad_publish_receipts")
    .update({ status: "failed", post_id: null })
    .eq("user_id", args.userId)
    .eq("idempotency_key", args.idempotencyKey);
  receiptError(error, "PUBLISH_RECEIPT_FAILED", "Could not release this post.");
}

export async function failPublishReceipt(args: { userId: string; idempotencyKey: string }): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("quad_publish_receipts")
    .update({ status: "failed" })
    .eq("user_id", args.userId)
    .eq("idempotency_key", args.idempotencyKey)
    .eq("status", "creating");
}

export async function listOwnedBatchReceipts(args: { userId: string; batchId: string }): Promise<
  { itemKey: string; postId: string | null; status: string }[]
> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("quad_publish_receipts")
    .select("idempotency_key, post_id, status")
    .eq("user_id", args.userId)
    .eq("batch_id", args.batchId);
  receiptError(error, "PUBLISH_RECEIPT_LOOKUP_FAILED", "Could not load this batch.");
  return (data ?? []).map((row) => {
    const key = String(row.idempotency_key ?? "");
    const itemKey = key.includes(":") ? key.slice(key.lastIndexOf(":") + 1) : key;
    return {
      itemKey,
      postId: row.post_id ? String(row.post_id) : null,
      status: String(row.status ?? ""),
    };
  });
}

export async function markPublishReceiptDeleted(args: {
  userId: string;
  idempotencyKey: string;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("quad_publish_receipts")
    .update({ status: "deleted" })
    .eq("user_id", args.userId)
    .eq("idempotency_key", args.idempotencyKey);
  receiptError(error, "PUBLISH_RECEIPT_FAILED", "Could not record the deletion.");
}
