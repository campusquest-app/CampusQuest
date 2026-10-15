import { definePartner } from "@/lib/partners/partnerDirectory";

/**
 * Fictional partner shown only to App Store review (QA) sessions so reviewers can
 * open a Student Perks pass. Not part of PARTNER_DIRECTORY, so no real-merchant
 * lookup ever resolves it; its passes carry `demo: true`, are watermarked, and
 * never write partner_engagement_events.
 */
export const REVIEW_DEMO_PARTNER = definePartner({
  id: "campusquest-demo-cafe",
  slug: "campusquest-demo-cafe",
  name: "CampusQuest Demo Café (Demo)",
  categories: ["Demo"],
  keywords: ["demo"],
  filterTags: ["coffee"],
  description:
    "Fictional demo business for App Review. Not a real merchant \u2014 this reward cannot be redeemed anywhere.",
  offerType: "standard_offer",
  discountValue: "DEMO",
  offerTitle: "Demo student reward (not redeemable)",
  offerDescription: "Shows how a Student Perks pass works. No business honors this pass.",
  rewardTerms: "Demo only. Not valid for redemption at any business. No value.",
  redemptionInstructions: "Demo pass \u2014 for App Review only.",
  isReviewDemo: true,
});

export function isReviewDemoPartnerId(partnerId: string): boolean {
  return partnerId === REVIEW_DEMO_PARTNER.id;
}
