import { fail, ok } from "@/lib/server/http";
import { requireAuthUser } from "@/lib/server/supabase";
import { enforceRateLimit } from "@/lib/server/security";
import { loadLocalBusinessActor, loadMergedPartner } from "@/lib/server/localBusinessAccount";
import { activeOfferCount } from "@/lib/localBusiness/profile";
import { createAdminClient } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "local-business:me", limit: 60, windowMs: 60_000 });
    const actor = await loadLocalBusinessActor(auth.userClient, auth.user.id);
    if (!actor.restricted) return ok({ account: null });
    const businesses = [];
    for (const membership of actor.memberships) {
      if (membership.revoked) continue;
      const merged = await loadMergedPartner(membership.partnerId);
      if (!merged) continue;
      const manageable = membership.approved && !actor.revoked;
      businesses.push({
        partnerId: membership.partnerId,
        name: merged.partner.name,
        logoUrl: merged.partner.logoUrl,
        username: merged.override?.username ?? null,
        approved: membership.approved,
        canPost: manageable,
        canEdit: manageable,
        activeOffers: activeOfferCount(merged.partner),
      });
    }
    return ok({
      account: {
        mustResetPassword: actor.mustResetPassword,
        revoked: actor.revoked,
        businesses,
      },
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "local-business:password", limit: 8, windowMs: 60_000 });
    const actor = await loadLocalBusinessActor(auth.userClient, auth.user.id);
    if (!actor.restricted) {
      return ok({ updated: false });
    }
    const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
    const password = typeof body?.password === "string" ? body.password : "";
    const { passwordMeetsRequirements } = await import("@/lib/passwordRequirements");
    if (!passwordMeetsRequirements(password)) {
      const { ApiError } = await import("@/lib/server/http");
      throw new ApiError(400, "Choose a password that meets every requirement.", "PASSWORD_REQUIREMENTS");
    }
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(auth.user.id, { password });
    if (error) {
      const { ApiError } = await import("@/lib/server/http");
      throw new ApiError(400, "Could not update the password.", "PASSWORD_UPDATE_FAILED");
    }
    await admin
      .from("local_business_accounts")
      .update({ must_reset_password: false, updated_at: new Date().toISOString() })
      .eq("user_id", auth.user.id);
    return ok({ updated: true });
  } catch (error) {
    return fail(error);
  }
}
