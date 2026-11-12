import { describe, expect, it } from "vitest";
import { offerDateInputValue, offerDraftFromPartner, normalizeOfferDraft } from "@/lib/localBusiness/offers";
import { findPartnerById } from "@/lib/partners/partnerDirectory";

describe("business offer drafts", () => {
  it("prefills Daisy's live offer", () => {
    const daisy = findPartnerById("daisys-chicken-ice-cream")!;
    expect(offerDraftFromPartner(daisy)).toMatchObject({
      discountValue: "20% OFF",
      offerTitle: "Go on a quest for 20% OFF at Daisy’s",
      redemptionInstructions: "Show your CampusQuest account at checkout.",
      rewardPaused: false,
      startsAt: null,
      endsAt: null,
    });
  });

  it("keeps a failed save's text by rejecting it without changing the input", () => {
    const entered = {
      offerTitle: "Weekend cones",
      discountValue: "",
      redemptionInstructions: "Show the app.",
      rewardPaused: false,
      startsAt: "2026-12-02",
      endsAt: "2026-12-01",
    };
    expect(normalizeOfferDraft(entered).ok).toBe(false);
    expect(entered.offerTitle).toBe("Weekend cones");
  });

  it("saves the same offer fields students see", () => {
    const result = normalizeOfferDraft({
      offerTitle: "  Free cone  ",
      discountValue: " Free cone ",
      redemptionInstructions: " Show your account. ",
      rewardPaused: true,
      startsAt: "2026-11-01",
      endsAt: "2026-11-30",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.offer.offerTitle).toBe("Free cone");
    expect(result.offer.discountValue).toBe("Free cone");
    expect(result.offer.redemptionInstructions).toBe("Show your account.");
    expect(result.offer.rewardPaused).toBe(true);
    expect(offerDateInputValue(result.offer.startsAt)).toBe("2026-11-01");
    expect(offerDateInputValue(result.offer.endsAt)).toBe("2026-11-30");
  });
});
