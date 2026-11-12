import { z } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { requireAuthUser, createAdminClient } from "@/lib/server/supabase";
import { enforceRateLimit } from "@/lib/server/security";
import { readJson } from "@/lib/server/validation";
import {
  actorManagesPartner,
  assertCanEditPartner,
  loadLocalBusinessActor,
  loadMergedPartner,
} from "@/lib/server/localBusinessAccount";
import { activeOfferCount } from "@/lib/localBusiness/profile";
import { parsePartnerHours } from "@/lib/partners/partnerHours";
import { fetchProfileRole, userHasPlatformAdminAccess } from "@/lib/server/permissions";

const patchSchema = z.object({
  partnerId: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  websiteUrl: z.string().trim().max(300).nullable().optional(),
  contactEmail: z.string().trim().email().nullable().optional(),
  contactPhone: z.string().trim().max(40).nullable().optional(),
  username: z.string().trim().min(3).max(24).optional(),
  logoUrl: z.string().trim().max(500).nullable().optional(),
  coverImageUrl: z.string().trim().max(500).nullable().optional(),
  photos: z.array(z.string().trim().max(500)).max(8).optional(),
  hours: z.unknown().nullable().optional(),
});

async function countsFor(partnerId: string) {
  const admin = createAdminClient();
  const [followers, posts, engagement] = await Promise.all([
    admin.from("partner_favorites").select("user_id", { count: "exact", head: true }).eq("partner_id", partnerId),
    admin
      .from("quad_posts")
      .select("id, nod_count", { count: "exact" })
      .eq("business_partner_id", partnerId)
      .eq("feed_destination", "local_businesses")
      .eq("is_anonymous", false),
    admin
      .from("partner_engagement_events")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", partnerId)
      .eq("event_type", "business_view"),
  ]);

  const postRows = (posts.data ?? []) as { nod_count?: number | null }[];
  const postCount = typeof posts.count === "number" ? posts.count : postRows.length;
  const engagementAvailable = !posts.error;
  const businessViewsAvailable = !engagement.error;
  return {
    posts: postCount,
    followers: followers.error ? null : followers.count ?? 0,
    postEngagement: engagementAvailable
      ? postRows.reduce((sum, row) => sum + Math.max(0, Number(row.nod_count ?? 0)), 0)
      : null,
    businessViews: businessViewsAvailable ? engagement.count ?? 0 : null,
  };
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "local-business:profile", limit: 60, windowMs: 60_000 });
    const partnerId = new URL(request.url).searchParams.get("partnerId")?.trim() ?? "";
    const merged = await loadMergedPartner(partnerId);
    if (!merged) throw new ApiError(404, "Business not found.", "BUSINESS_NOT_FOUND");

    const actor = await loadLocalBusinessActor(auth.userClient, auth.user.id);
    const role = await fetchProfileRole(auth.userClient, auth.user.id, { email: auth.user.email });
    const canEdit = userHasPlatformAdminAccess(auth.user, role) || actorManagesPartner(actor, partnerId);
    const admin = createAdminClient();
    const { data: approvedRow } = await admin
      .from("local_business_memberships")
      .select("partner_id")
      .eq("partner_id", partnerId)
      .eq("approved", true)
      .is("revoked_at", null)
      .limit(1)
      .maybeSingle();
    const approved = Boolean(approvedRow);
    const stats = await countsFor(partnerId);
    const publicStats = canEdit
      ? stats
      : { ...stats, postEngagement: null, businessViews: null };
    const partner = merged.partner;
    return ok({
      partner: {
        id: partner.id,
        name: partner.name,
        slug: partner.slug,
        description: partner.description,
        address: partner.address,
        logoUrl: partner.logoUrl,
        coverImageUrl: partner.coverImageUrl,
        websiteUrl: partner.websiteUrl,
        hours: partner.hours,
        categories: partner.categories,
        discountValue: partner.discountValue,
        offerTitle: partner.offerTitle,
        offerDescription: partner.offerDescription,
        redemptionInstructions: partner.redemptionInstructions,
        rewardPaused: partner.rewardPaused,
        startsAt: partner.startsAt,
        endsAt: partner.endsAt,
        listingType: partner.listingType,
        username: merged.override?.username ?? null,
      },
      contactEmail: merged.override?.contactEmail ?? null,
      contactPhone: merged.override?.contactPhone ?? null,
      photos: merged.override?.photos ?? [],
      approved,
      canEdit,
      activeOffers: activeOfferCount(partner),
      stats: publicStats,
    });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "local-business:profile:patch", limit: 30, windowMs: 60_000 });
    const input = await readJson(request, patchSchema);
    await assertCanEditPartner({ userClient: auth.userClient, user: auth.user, partnerId: input.partnerId });
    const hours = input.hours === undefined ? undefined : input.hours === null ? null : parsePartnerHours(input.hours);
    if (input.hours != null && input.hours !== undefined && !hours) {
      throw new ApiError(400, "Those hours could not be saved.", "BUSINESS_HOURS_INVALID");
    }
    const admin = createAdminClient();
    const patch: Record<string, unknown> = { partner_id: input.partnerId, updated_at: new Date().toISOString() };
    if (input.description !== undefined) patch.description = input.description;
    if (input.websiteUrl !== undefined) patch.website_url = input.websiteUrl;
    if (input.contactEmail !== undefined) patch.contact_email = input.contactEmail;
    if (input.contactPhone !== undefined) patch.contact_phone = input.contactPhone;
    if (input.logoUrl !== undefined) patch.logo_url = input.logoUrl;
    if (input.coverImageUrl !== undefined) patch.cover_image_url = input.coverImageUrl;
    if (input.photos !== undefined) patch.photos = input.photos;
    if (input.username !== undefined) {
      const { normalizeBusinessUsername, localBusinessAssignmentError } = await import("@/lib/localBusiness/access");
      const usernameError = localBusinessAssignmentError({ partnerId: input.partnerId, username: input.username });
      if (usernameError) throw new ApiError(400, usernameError, "BUSINESS_USERNAME_INVALID");
      const username = normalizeBusinessUsername(input.username);
      const { data: taken } = await admin.from("partner_profile_overrides").select("partner_id").eq("username", username).maybeSingle();
      if (taken && taken.partner_id !== input.partnerId) {
        throw new ApiError(409, "That username is already taken.", "USERNAME_TAKEN");
      }
      patch.username = username;
    }
    if (hours !== undefined) patch.hours = hours;
    const { error } = await admin.from("partner_profile_overrides").upsert(patch);
    if (error) throw new ApiError(400, "Could not save the business profile.", "BUSINESS_PROFILE_SAVE_FAILED");
    return ok({ saved: true });
  } catch (error) {
    return fail(error);
  }
}
