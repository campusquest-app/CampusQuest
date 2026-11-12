"use client";

import { useState, type FormEvent } from "react";
import { patchAuthed } from "@/lib/client/dashboardApi";
import { offerDateInputValue, type ManagedOffer } from "@/lib/localBusiness/offers";

type SavedOffer = {
  saved: boolean;
  offer: ManagedOffer;
  activeOffers: number;
};

export function OfferEditor({
  partnerId,
  initial,
  onCancel,
  onSaved,
}: {
  partnerId: string;
  initial: ManagedOffer;
  onCancel: () => void;
  onSaved: (saved: SavedOffer) => void;
}) {
  const [offerTitle, setOfferTitle] = useState(initial.offerTitle ?? "");
  const [discountValue, setDiscountValue] = useState(initial.discountValue ?? "");
  const [redemptionInstructions, setRedemptionInstructions] = useState(initial.redemptionInstructions ?? "");
  const [startsAt, setStartsAt] = useState(offerDateInputValue(initial.startsAt));
  const [endsAt, setEndsAt] = useState(offerDateInputValue(initial.endsAt));
  const [active, setActive] = useState(!initial.rewardPaused);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = await patchAuthed<SavedOffer, Record<string, unknown>>("/api/local-business/offers", {
        partnerId,
        offerTitle: offerTitle.trim() || null,
        discountValue: discountValue.trim() || null,
        offerDescription: initial.offerDescription,
        redemptionInstructions: redemptionInstructions.trim() || null,
        rewardPaused: !active,
        startsAt: startsAt || null,
        endsAt: endsAt || null,
      });
      onSaved(saved);
    } catch (saveError) {
      setError(saveError instanceof Error && saveError.message ? saveError.message : "Could not save this offer.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="mt-4 space-y-3 rounded-3xl border border-white/10 p-4" onSubmit={(event) => void save(event)}>
      <h2 className="text-lg font-bold">Edit Offer</h2>
      <label className="block text-sm">
        Offer title
        <input className="mt-1 w-full rounded-2xl bg-white/10 p-3" value={offerTitle} maxLength={140} onChange={(event) => setOfferTitle(event.target.value)} />
      </label>
      <label className="block text-sm">
        Discount
        <input className="mt-1 w-full rounded-2xl bg-white/10 p-3" value={discountValue} maxLength={40} onChange={(event) => setDiscountValue(event.target.value)} />
      </label>
      <label className="block text-sm">
        Redemption instructions
        <textarea className="mt-1 w-full rounded-2xl bg-white/10 p-3" value={redemptionInstructions} maxLength={400} onChange={(event) => setRedemptionInstructions(event.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm">
          Starts
          <input type="date" className="mt-1 w-full rounded-2xl bg-white/10 p-3" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
        </label>
        <label className="text-sm">
          Ends
          <input type="date" className="mt-1 w-full rounded-2xl bg-white/10 p-3" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
        Active
      </label>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="rounded-full bg-uri-keaney px-4 py-2 text-sm font-bold">
          {saving ? "Saving…" : "Save offer"}
        </button>
        <button type="button" className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
