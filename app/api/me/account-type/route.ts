import { enrichProfileRowForApiClient } from "@/lib/identityWeeklyBudget";
import { roleLabel } from "@/lib/roles";
import { resolveAccountTypeUpdate } from "@/lib/server/accountType";
import { fail, ok, ApiError } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { createAdminClient, requireAuthUser } from "@/lib/server/supabase";

function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42703" || /column .* does not exist/i.test(error.message ?? "");
}

const MIGRATION_PENDING_ERROR = new ApiError(
  503,
  "Account types are not available yet. Please try again shortly.",
  "ACCOUNT_TYPE_MIGRATION_PENDING",
);

/**
 * Sets the caller's account type (student / faculty_staff only).
 * Guard rules live in lib/server/accountType.ts; all writes use the
 * service-role client because a DB trigger blocks client-context
 * profiles.role changes entirely.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "me:account-type", limit: 10, windowMs: 60_000 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const admin = createAdminClient();
    const { data: existing, error: loadError } = await admin
      .from("profiles")
      .select("id, role, is_test_user, qa_selected_role")
      .eq("id", auth.user.id)
      .maybeSingle();

    if (loadError) {
      if (isMissingColumnError(loadError)) throw MIGRATION_PENDING_ERROR;
      throw new ApiError(400, loadError.message, "ACCOUNT_TYPE_LOAD_FAILED");
    }
    if (!existing) {
      throw new ApiError(404, "Profile not found.", "PROFILE_NOT_FOUND");
    }

    const decision = resolveAccountTypeUpdate(existing, body.role);
    if (decision.kind === "invalid_role") {
      throw new ApiError(400, "Choose either Student or Faculty / Staff.", "INVALID_ACCOUNT_TYPE");
    }
    if (decision.kind === "admin_locked") {
      throw new ApiError(
        403,
        "Administrator accounts cannot change their account type here.",
        "ADMIN_ROLE_LOCKED",
      );
    }

    const { data: updated, error: updateError } = await admin
      .from("profiles")
      .update(decision.patch)
      .eq("id", auth.user.id)
      .select("*")
      .single();

    if (updateError || !updated) {
      if (isMissingColumnError(updateError)) throw MIGRATION_PENDING_ERROR;
      console.error("[cq][role] account type save failed", {
        userId: auth.user.id,
        code: updateError?.code,
        message: updateError?.message,
      });
      throw new ApiError(400, "Could not save your account type. Please try again.", "ACCOUNT_TYPE_SAVE_FAILED");
    }

    console.log("[cq][role] account type saved", {
      userId: auth.user.id,
      patch: Object.keys(decision.patch),
      qaAccount: decision.qaAccount,
    });

    return ok({
      profile: enrichProfileRowForApiClient(updated as unknown as Record<string, unknown>, auth.user.email),
      role: decision.effectiveRole,
      selectedRole: body.role,
      roleLabel: roleLabel(decision.effectiveRole),
    });
  } catch (error) {
    return fail(error);
  }
}
