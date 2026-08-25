"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useRegisterImmersiveScreen } from "@/lib/client/nestedImmersiveScreen";
import { MARKETPLACE_CATEGORY_LABELS } from "@/lib/marketplace/policy";
import type { MarketplaceBusiness, MarketplaceListing } from "@/lib/marketplace/types";
import { fetchMarketplaceListings, fetchStudentBusiness, toggleStudentBusinessFollowRequest } from "@/lib/client/marketplaceClient";
import { MarketListingCard } from "@/components/market/MarketListingCard";

type BizTab = "shop" | "posts" | "events" | "about";

export function MarketBusinessSheet({
  businessId,
  viewerId,
  onClose,
  onMessage,
  onListingAction,
}: {
  businessId: string;
  viewerId: string;
  onClose: () => void;
  onMessage: (listing: MarketplaceListing) => void;
  onListingAction: () => void;
}) {
  useRegisterImmersiveScreen(true);
  const [tab, setTab] = useState<BizTab>("shop");
  const [business, setBusiness] = useState<MarketplaceBusiness | null>(null);
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchStudentBusiness(businessId),
      fetchMarketplaceListings({ businessId }),
    ]).then(([nextBusiness, nextListings]) => {
      if (cancelled) return;
      setBusiness(nextBusiness);
      setListings(nextListings);
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "Could not load this shop.");
    });
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const shop = listings.filter((row) => row.listingKind !== "business_post");
  const posts = listings.filter((row) => row.listingKind === "business_post");

  return (
    <div className="cq-composer-overlay" role="dialog" aria-modal="true" aria-label="Student business">
      <div className="cq-composer-shell cq-market-composer">
        <div className="cq-create-sheet-head">
          <h2 className="cq-create-sheet-title">
            {business?.name ?? "Student Business"}
            {business?.verificationStatus === "verified" ? <span className="cq-market-verified">✓</span> : null}
          </h2>
          <button type="button" className="cq-create-sheet-close" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="cq-market-sheet-copy">Student-Owned at URI</p>
        {business?.bio ? <p className="cq-market-card-copy">{business.bio}</p> : null}
        {error ? <p className="cq-market-error">{error}</p> : null}
        <div className="cq-market-card-actions">
          <button
            type="button"
            className="cq-market-btn cq-market-btn--secondary"
            onClick={() => {
              if (!business) return;
              void toggleStudentBusinessFollowRequest(business.id).then((result) => {
                setBusiness({ ...business, followed: result.followed });
              });
            }}
          >
            {business?.followed ? "Following" : "Follow"}
          </button>
          {shop[0] || posts[0] ? (
            <button type="button" className="cq-market-btn cq-market-btn--primary" onClick={() => onMessage((shop[0] ?? posts[0])!)}>
              Message
            </button>
          ) : null}
        </div>
        <div className="cq-market-biz-tabs" role="tablist" aria-label="Business profile">
          {(["shop", "posts", "events", "about"] as const).map((item) => (
            <button key={item} type="button" role="tab" aria-selected={tab === item} className={`cq-market-chip${tab === item ? " cq-market-chip--active" : ""}`} onClick={() => setTab(item)}>
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>
        {tab === "shop" ? (
          shop.length === 0 ? <p className="cq-market-sheet-copy">No products or services yet.</p> : shop.map((listing) => (
            <MarketListingCard
              key={listing.id}
              listing={listing}
              viewerId={viewerId}
              onFavorite={onListingAction}
              onMessage={() => onMessage(listing)}
              onOffer={onListingAction}
              onShare={onListingAction}
              onReport={onListingAction}
              onBlock={onListingAction}
              onEdit={onListingAction}
              onMarkSold={onListingAction}
              onRemove={onListingAction}
            />
          ))
        ) : null}
        {tab === "posts" ? (
          posts.length === 0 ? <p className="cq-market-sheet-copy">No business posts yet.</p> : posts.map((listing) => (
            <MarketListingCard
              key={listing.id}
              listing={listing}
              viewerId={viewerId}
              onFavorite={onListingAction}
              onMessage={() => onMessage(listing)}
              onOffer={onListingAction}
              onShare={onListingAction}
              onReport={onListingAction}
              onBlock={onListingAction}
              onEdit={onListingAction}
              onMarkSold={onListingAction}
              onRemove={onListingAction}
            />
          ))
        ) : null}
        {tab === "events" ? <p className="cq-market-sheet-copy">No pop-ups yet.</p> : null}
        {tab === "about" && business ? (
          <div className="cq-market-form">
            <p className="cq-market-card-copy">{business.bio || "No description yet."}</p>
            <p className="cq-market-card-meta">{MARKETPLACE_CATEGORY_LABELS[business.category]}</p>
            {business.instagramUrl ? <a className="cq-market-link" href={business.instagramUrl} target="_blank" rel="noreferrer">Instagram</a> : null}
            {business.websiteUrl ? <a className="cq-market-link" href={business.websiteUrl} target="_blank" rel="noreferrer">Website</a> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
