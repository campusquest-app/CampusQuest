import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";

export async function logAdminAuditAction(args: {
  actionType: string;
  targetUserId?: string | null;
  adminUserId?: string | null;
  adminEmail?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  const { actionType, targetUserId, adminUserId, adminEmail, reason, metadata } = args;
  const { error } = await admin.from("admin_audit_logs").insert({
    action_type: actionType,
    target_user_id: targetUserId ?? null,
    admin_user_id: adminUserId ?? null,
    admin_email: adminEmail ?? null,
    reason: reason ?? null,
    metadata: metadata ?? {},
  });
  if (error) {
    throw new ApiError(400, error.message, "AUDIT_LOG_WRITE_FAILED");
  }
}
