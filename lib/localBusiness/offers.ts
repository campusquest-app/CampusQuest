import type { Partner } from "@/lib/partners/types";

export type ManagedOffer = {
  offerTitle: string | null;
  discountValue: string | null;
  offerDescription: string | null;
  redemptionInstructions: string | null;
  rewardPaused: boolean;
  startsAt: string | null;
  endsAt: string | null;
};

export type OfferDraftInput = {
  offerTitle?: string | null;
  discountValue?: string | null;
  offerDescription?: string | null;
  redemptionInstructions?: string | null;
  rewardPaused?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
};

const TITLE_MAX = 140;
const DISCOUNT_MAX = 40;
const DETAILS_MAX = 500;
const REDEMPTION_MAX = 400;

function blankToNull(value: string | null | undefined, max: number): { value: string | null; error?: string } {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return { value: null };
  if (trimmed.length > max) return { value: null, error: "That offer field is too long." };
  return { value: trimmed };
}

/** Calendar date from a stored timestamp. Empty when the offer has no date. */
export function offerDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match?.[1] ?? "";
}

function timestampFromDate(value: string | null | undefined, bound: "start" | "end"): { value: string | null; error?: string } {
  const date = (value ?? "").trim();
  if (!date) return { value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { value: null, error: "Use a valid start and end date." };
  const stamp = bound === "start" ? `${date}T00:00:00.000Z` : `${date}T23:59:59.999Z`;
  if (!Number.isFinite(Date.parse(stamp))) return { value: null, error: "Use a valid start and end date." };
  return { value: stamp };
}

/** The form starts from the offer students currently see. */
export function offerDraftFromPartner(partner: Pick<Partner, "offerTitle" | "discountValue" | "offerDescription" | "redemptionInstructions" | "rewardPaused" | "startsAt" | "endsAt">): ManagedOffer {
  return {
    offerTitle: partner.offerTitle,
    discountValue: partner.discountValue,
    offerDescription: partner.offerDescription,
    redemptionInstructions: partner.redemptionInstructions,
    rewardPaused: partner.rewardPaused,
    startsAt: partner.startsAt,
    endsAt: partner.endsAt,
  };
}

export function normalizeOfferDraft(input: OfferDraftInput): { ok: true; offer: ManagedOffer } | { ok: false; message: string } {
  const offerTitle = blankToNull(input.offerTitle, TITLE_MAX);
  const discountValue = blankToNull(input.discountValue, DISCOUNT_MAX);
  const offerDescription = blankToNull(input.offerDescription, DETAILS_MAX);
  const redemptionInstructions = blankToNull(input.redemptionInstructions, REDEMPTION_MAX);
  const startsAt = timestampFromDate(input.startsAt, "start");
  const endsAt = timestampFromDate(input.endsAt, "end");
  const invalid = [offerTitle, discountValue, offerDescription, redemptionInstructions, startsAt, endsAt].find((field) => field.error);
  if (invalid?.error) return { ok: false, message: invalid.error };
  if (!offerTitle.value && !discountValue.value) {
    return { ok: false, message: "Add an offer title or a discount." };
  }
  if (startsAt.value && endsAt.value && Date.parse(startsAt.value) >= Date.parse(endsAt.value)) {
    return { ok: false, message: "The offer must end after it starts." };
  }
  return {
    ok: true,
    offer: {
      offerTitle: offerTitle.value,
      discountValue: discountValue.value,
      offerDescription: offerDescription.value,
      redemptionInstructions: redemptionInstructions.value,
      rewardPaused: input.rewardPaused === true,
      startsAt: startsAt.value,
      endsAt: endsAt.value,
    },
  };
}
