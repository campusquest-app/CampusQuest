import { ZodError, z } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { enforceRateLimit } from "@/lib/server/security";
import { passwordFieldSchema, readJson } from "@/lib/server/validation";
import { formatZodError } from "@/lib/server/zodErrors";
import { provisionLocalBusinessAccount, type LocalBusinessAssignmentInput } from "@/lib/server/localBusinessProvision";
import { createAdminClient } from "@/lib/server/supabase";

const assignmentSchema = z.object({
  partnerId: z.string().trim().min(1).max(80),
  username: z.string().trim().min(3).max(24),
  approved: z.boolean().optional(),
});

/**
 * chosenPassword is operator-typed. Never log the raw ZodError (it can carry
 * the password). Always require confirmPasswordChange when a password is set
 * so existing logins are not reset by accident.
 */
const provisionSchema = z
  .object({
    email: z.string().trim().email(),
    accountUsername: z.string().trim().min(3).max(24).optional(),
    partnerId: z.string().trim().min(1).max(80).optional(),
    username: z.string().trim().min(3).max(24).optional(),
    approved: z.boolean().optional(),
    chosenPassword: passwordFieldSchema.optional(),
    confirmPasswordChange: z.literal(true).optional(),
    businesses: z.array(assignmentSchema).min(1).max(20).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.chosenPassword !== undefined && data.confirmPasswordChange !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Confirm that you intend to set or reset this login password.",
        path: ["confirmPasswordChange"],
      });
    }
  });

const revokeSchema = z.object({
  userId: z.string().uuid(),
  partnerId: z.string().trim().min(1).max(80).optional(),
});

function failValidation(error: unknown) {
  if (error instanceof ZodError) {
    // Convert before fail() so the Zod payload (which may include chosenPassword) is never logged.
    return fail(new ApiError(400, formatZodError(error), "VALIDATION_ERROR"));
  }
  return fail(error);
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "admin:local-business:provision", limit: 10, windowMs: 60_000 });
    const input = await readJson(request, provisionSchema);
    const businesses: LocalBusinessAssignmentInput[] = input.businesses?.length
      ? input.businesses
      : input.partnerId && input.username
        ? [{ partnerId: input.partnerId, username: input.username, approved: input.approved }]
        : [];
    if (businesses.length === 0) {
      throw new ApiError(400, "Assign at least one business.", "LOCAL_BUSINESS_PROVISION_INVALID");
    }
    const created = await provisionLocalBusinessAccount({
      email: input.email,
      businesses,
      createdBy: auth.user.id,
      accountUsername: input.accountUsername,
      chosenPassword: input.chosenPassword,
    });
    return ok(created, created.created ? 201 : 200);
  } catch (error) {
    return failValidation(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAdminUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "admin:local-business:revoke", limit: 10, windowMs: 60_000 });
    const input = await readJson(request, revokeSchema);
    const admin = createAdminClient();
    const now = new Date().toISOString();
    if (input.partnerId) {
      const { data, error } = await admin
        .from("local_business_memberships")
        .update({ revoked_at: now, updated_at: now })
        .eq("user_id", input.userId)
        .eq("partner_id", input.partnerId)
        .is("revoked_at", null)
        .select("user_id, partner_id")
        .maybeSingle();
      if (error) throw new ApiError(400, "Could not revoke business access.", "LOCAL_BUSINESS_REVOKE_FAILED");
      if (!data) throw new ApiError(404, "No active business assignment was found.", "LOCAL_BUSINESS_NOT_FOUND");
      return ok({ revoked: true, userId: data.user_id, partnerId: data.partner_id, loginDisabled: false });
    }
    const { error } = await admin
      .from("local_business_memberships")
      .update({ revoked_at: now, updated_at: now })
      .eq("user_id", input.userId)
      .is("revoked_at", null);
    if (error) throw new ApiError(400, "Could not revoke business access.", "LOCAL_BUSINESS_REVOKE_FAILED");
    const { error: accountError } = await admin
      .from("local_business_accounts")
      .update({ revoked_at: now, updated_at: now })
      .eq("user_id", input.userId);
    if (accountError) throw new ApiError(400, "Could not revoke business access.", "LOCAL_BUSINESS_REVOKE_FAILED");
    const banned = await admin.auth.admin.updateUserById(input.userId, { ban_duration: "876000h" });
    if (banned.error) {
      throw new ApiError(400, "Business posting was revoked, but the login could not be disabled.", "LOCAL_BUSINESS_BAN_FAILED");
    }
    return ok({ revoked: true, userId: input.userId, loginDisabled: true });
  } catch (error) {
    return failValidation(error);
  }
}
