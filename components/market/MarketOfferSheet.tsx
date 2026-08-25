"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { centsToPriceLabel } from "@/lib/marketplace/policy";
import type { MarketplaceListing, MarketplaceOffer } from "@/lib/marketplace/types";
import { createMarketplaceOfferRequest, respondMarketplaceOfferRequest } from "@/lib/client/marketplaceClient";

export function MarketOfferSheet({
  listing,
  mode,
  offers = [],
  onClose,
  onChanged,
  onError,
}: {
  listing: MarketplaceListing;
  mode: "create" | "manage";
  offers?: MarketplaceOffer[];
  onClose: () => void;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitOffer() {
    const dollars = Number(amount);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      onError("Enter a dollar amount.");
      return;
    }
    setBusy(true);
    try {
      await createMarketplaceOfferRequest(listing.id, dollars);
      onChanged();
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not send offer.");
    } finally {
      setBusy(false);
    }
  }

  async function respond(offerId: string, action: "accept" | "decline") {
    setBusy(true);
    try {
      await respondMarketplaceOfferRequest(offerId, action);
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not update offer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cq-create-sheet-overlay" role="dialog" aria-modal="true" aria-label={mode === "create" ? "Make offer" : "Listing offers"} onClick={onClose}>
      <div className="cq-create-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="cq-create-sheet-grip" aria-hidden />
        <div className="cq-create-sheet-head">
          <h2 className="cq-create-sheet-title">{mode === "create" ? "Make Offer" : "Offers"}</h2>
          <button type="button" className="cq-create-sheet-close" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="cq-market-sheet-copy">
          {listing.title} · {centsToPriceLabel(listing.priceCents, listing.startingPrice)}
        </p>
        {mode === "create" ? (
          <>
            <label className="cq-market-label" htmlFor="cq-market-offer-amount">Your offer</label>
            <div className="cq-market-offer-row">
              <span aria-hidden>$</span>
              <input
                id="cq-market-offer-amount"
                className="cq-market-input"
                inputMode="decimal"
                placeholder="28"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <p className="cq-market-sheet-note">CampusQuest does not process payments. If accepted, you and the seller arrange payment and meetup yourselves.</p>
            <button type="button" className="cq-market-btn cq-market-btn--primary cq-market-btn--block" disabled={busy} onClick={() => void submitOffer()}>
              {busy ? "Sending…" : "Send offer"}
            </button>
          </>
        ) : (
          <ul className="cq-market-offer-list">
            {offers.length === 0 ? <li className="cq-market-sheet-copy">No offers yet.</li> : null}
            {offers.map((offer) => (
              <li key={offer.id} className="cq-market-offer-item">
                <p>
                  @{offer.buyerUsername} offered {centsToPriceLabel(offer.amountCents)} for {listing.title}
                </p>
                <p className="cq-market-card-meta">{offer.status}</p>
                {offer.status === "pending" ? (
                  <div className="cq-market-card-actions">
                    <button type="button" className="cq-market-btn cq-market-btn--primary" disabled={busy} onClick={() => void respond(offer.id, "accept")}>
                      Accept
                    </button>
                    <button type="button" className="cq-market-btn cq-market-btn--secondary" disabled={busy} onClick={() => void respond(offer.id, "decline")}>
                      Decline
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
