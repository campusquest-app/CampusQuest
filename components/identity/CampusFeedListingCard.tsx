"use client";

import { useState } from "react";
import { MarketListingCard } from "@/components/market/MarketListingCard";
import { MarketOfferSheet } from "@/components/market/MarketOfferSheet";
import { MarketReportSheet } from "@/components/market/MarketReportSheet";
import type { MarketplaceListing } from "@/lib/marketplace/types";
import {
  messageMarketplaceSellerRequest,
  toggleMarketplaceFavoriteRequest,
} from "@/lib/client/marketplaceClient";

export function CampusFeedListingCard({
  listing,
  viewerId,
  onMessageSeller,
}: {
  listing: MarketplaceListing;
  viewerId: string;
  onMessageSeller?: (seller: MarketplaceListing["seller"]) => void;
}) {
  const [current, setCurrent] = useState(listing);
  const [offerOpen, setOfferOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="cq-campus-market-embed">
      <p className="cq-campus-market-kicker">The Market</p>
      {notice ? <p className="px-3 pb-2 text-xs text-white/60">{notice}</p> : null}
      <MarketListingCard
        listing={current}
        viewerId={viewerId}
        onFavorite={() => {
          void toggleMarketplaceFavoriteRequest(current.id).then((result) => {
            setCurrent((prev) => ({
              ...prev,
              favorited: result.favorited,
              favoriteCount: prev.favoriteCount + (result.favorited ? 1 : -1),
            }));
          });
        }}
        onMessage={() => {
          void messageMarketplaceSellerRequest(current.id)
            .then((result) => onMessageSeller?.(result.seller))
            .catch((err) => setNotice(err instanceof Error ? err.message : "Could not message seller."));
        }}
        onOffer={() => setOfferOpen(true)}
        onShare={() => {
          const url = typeof window !== "undefined" ? window.location.origin : "";
          void navigator.clipboard?.writeText(`${url}/?tab=quad`).catch(() => undefined);
          setNotice("Link copied.");
        }}
        onReport={() => setReportOpen(true)}
        onBlock={() => setNotice("Open The Market to block a seller.")}
        onEdit={() => undefined}
        onMarkSold={() => undefined}
        onRemove={() => undefined}
      />
      {offerOpen ? (
        <MarketOfferSheet
          listing={current}
          mode="create"
          offers={[]}
          onClose={() => setOfferOpen(false)}
          onChanged={() => setNotice("Offer sent.")}
          onError={(message) => setNotice(message)}
        />
      ) : null}
      {reportOpen ? (
        <MarketReportSheet
          listingId={current.id}
          onClose={() => setReportOpen(false)}
          onSubmitted={() => setNotice("Report submitted.")}
          onError={(message) => setNotice(message)}
        />
      ) : null}
    </div>
  );
}
