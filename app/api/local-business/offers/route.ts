import { z } from "zod";
import { normalizeOfferDraft } from "@/lib/localBusiness/offers";
import { activeOfferCount } from "@/lib/localBusiness/profile";
import { isFreeLocalBusinessListing } from "@/lib/partners/partnerStatus";
import { ApiError, fail, ok } from "@/lib/server/http";
import { assertCanEditPartner, loadMergedPartner } from "@/lib/server/localBusinessAccount";
import { enforceRateLimit } from "@/lib/server/security";
import { createAdminClient, requireAuthUser } from "@/lib/server/supabase";
import { readJson } from "@/lib/server/validation";

const patchSchema = z.object({
  partnerId: z.string().trim().min(1).max(80),
  offerTitle: z.string().trim().max(140).nullable(),
  discountValue: z.string().trim().max(40).nullable(),
  offerDescription: z.string().trim().max(500).nullable().optional(),
  redemptionInstructions: z.string().trim().max(400).nullable(),
  rewardPaused: z.boolean(),
  startsAt: z.string().trim().max(40).nullable(),
  endsAt: z.string().trim().max(40).nullable(),
});

export async function PATCH(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "local-business:offer", limit: 30, windowMs: 60_000 });
    const input = await readJson(request, patchSchema);
    const draft = normalizeOfferDraft({
      ...input,
      startsAt: input.startsAt ? input.startsAt.slice(0, 10) : null,
      endsAt: input.endsAt ? input.endsAt.slice(0, 10) : null,
    });
    if (!draft.ok) throw new ApiError(400, draft.message, "BUSINESS_OFFER_INVALID");

    await assertCanEditPartner({ userClient: auth.userClient, user: auth.user, partnerId: input.partnerId });
    const current = await loadMergedPartner(input.partnerId);
    if (!current) throw new ApiError(404, "Business not found.", "BUSINESS_NOT_FOUND");
    if (isFreeLocalBusinessListing(current.partner)) {
      throw new ApiError(403, "This listing cannot publish a student offer.", "BUSINESS_OFFER_FORBIDDEN");
    }

    const admin = createAdminClient();
    const { error } = await admin.from("partner_profile_overrides").upsert(
      {
        partner_id: input.partnerId,
        offer_managed: true,
        offer_title: draft.offer.offerTitle,
        discount_value: draft.offer.discountValue,
        offer_description: draft.offer.offerDescription,
        redemption_instructions: draft.offer.redemptionInstructions,
        reward_paused: draft.offer.rewardPaused,
        starts_at: draft.offer.startsAt,
        ends_at: draft.offer.endsAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "partner_id" },
    );
    if (error) throw new ApiError(400, "Could not save this offer.", "BUSINESS_OFFER_SAVE_FAILED");

    const saved = await loadMergedPartner(input.partnerId);
    return ok({
      saved: true,
      offer: draft.offer,
      activeOffers: saved ? activeOfferCount(saved.partner) : 0,
    });
  } catch (error) {
    return fail(error);
  }
}
