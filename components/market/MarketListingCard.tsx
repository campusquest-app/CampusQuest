"use client";

import { useState } from "react";
import { Bookmark, MoreHorizontal, Share2 } from "lucide-react";
import { QuadMediaCarousel } from "@/components/quad/QuadMediaCarousel";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import {
  MARKETPLACE_CATEGORY_LABELS,
  MARKETPLACE_CONDITION_LABELS,
  MARKETPLACE_MEETUP_LABELS,
  centsToPriceLabel,
  listingSupportsOffers,
} from "@/lib/marketplace/policy";
import type { MarketplaceListing } from "@/lib/marketplace/types";

export function MarketListingCard({
  listing,
  viewerId,
  onFavorite,
  onMessage,
  onOffer,
  onViewShop,
  onShare,
  onReport,
  onBlock,
  onEdit,
  onMarkSold,
  onRemove,
  onViewOffers,
}: {
  listing: MarketplaceListing;
  viewerId: string;
  onFavorite: () => void;
  onMessage: () => void;
  onOffer: () => void;
  onViewShop?: () => void;
  onShare: () => void;
  onReport: () => void;
  onBlock: () => void;
  onEdit: () => void;
  onMarkSold: () => void;
  onRemove: () => void;
  onViewOffers?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isBusiness = Boolean(listing.business);
  const sold = listing.status === "sold";
  const canOffer = listingSupportsOffers({
    sellerId: listing.sellerId,
    buyerId: viewerId,
    status: listing.status,
    listingKind: listing.listingKind,
    priceCents: listing.priceCents,
  });
  const price = centsToPriceLabel(listing.priceCents, listing.startingPrice);
  const conditionLabel = listing.condition ? MARKETPLACE_CONDITION_LABELS[listing.condition] : null;

  return (
    <article className={`cq-market-card${isBusiness ? " cq-market-card--business" : ""}${sold ? " cq-market-card--sold" : ""}`}>
      <header className="cq-market-card-header">
        <div className="cq-market-card-identity">
          <div className="cq-market-card-avatar">
            <AvatarDisplay avatar={isBusiness ? listing.business?.logoUrl ?? listing.seller.avatarUrl : listing.seller.avatarUrl} size={36} fitParent showProp={false} />
          </div>
          <div className="cq-market-card-byline">
            {isBusiness ? (
              <>
                <p className="cq-market-card-name">
                  {listing.business?.name}
                  {listing.business?.verificationStatus === "verified" ? <span className="cq-market-verified" aria-label="Verified">✓</span> : null}
                </p>
                <p className="cq-market-card-meta">
                  Student-Owned · {MARKETPLACE_CATEGORY_LABELS[listing.category]}
                </p>
              </>
            ) : (
              <>
                <p className="cq-market-card-name">
                  @{listing.seller.username}
                  {listing.seller.campusVerified ? <span className="cq-market-verified" aria-label="URI student">✓</span> : null}
                </p>
                <p className="cq-market-card-meta">URI student</p>
              </>
            )}
          </div>
        </div>
        <div className="cq-market-card-tools">
          <button type="button" className="cq-market-icon-btn" aria-label={listing.favorited ? "Unsave listing" : "Save listing"} onClick={onFavorite}>
            <Bookmark className="h-5 w-5" strokeWidth={2.1} fill={listing.favorited ? "currentColor" : "none"} />
          </button>
          <button type="button" className="cq-market-icon-btn" aria-label="Share listing" onClick={onShare}>
            <Share2 className="h-5 w-5" strokeWidth={2.1} />
          </button>
          <div className="cq-feed-post-menu-anchor">
            <button type="button" className="cq-market-icon-btn" aria-label="More listing actions" onClick={() => setMenuOpen((open) => !open)}>
              <MoreHorizontal className="h-5 w-5" strokeWidth={2.1} />
            </button>
            {menuOpen ? (
              <div className="cq-feed-post-menu cq-market-menu" role="menu">
                {listing.isOwner ? (
                  <>
                    <button type="button" className="cq-feed-post-menu-item" onClick={() => { setMenuOpen(false); onEdit(); }}>Edit listing</button>
                    {listing.status === "active" ? (
                      <button type="button" className="cq-feed-post-menu-item" onClick={() => { setMenuOpen(false); onMarkSold(); }}>Mark sold</button>
                    ) : null}
                    {onViewOffers ? (
                      <button type="button" className="cq-feed-post-menu-item" onClick={() => { setMenuOpen(false); onViewOffers(); }}>Offers</button>
                    ) : null}
                    <button type="button" className="cq-feed-post-menu-item cq-feed-post-menu-item--danger" onClick={() => { setMenuOpen(false); onRemove(); }}>Remove listing</button>
                  </>
                ) : (
                  <>
                    <button type="button" className="cq-feed-post-menu-item" onClick={() => { setMenuOpen(false); onReport(); }}>Report listing</button>
                    <button type="button" className="cq-feed-post-menu-item cq-feed-post-menu-item--danger" onClick={() => { setMenuOpen(false); onBlock(); }}>Block seller</button>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="cq-market-card-media">
        {listing.media.length > 0 ? (
          <QuadMediaCarousel postId={listing.id} media={listing.media} isFeed />
        ) : (
          <div className="cq-market-card-media-empty">No photo</div>
        )}
        {sold ? <div className="cq-market-sold-badge">SOLD</div> : null}
      </div>

      <div className="cq-market-card-body">
        <h3 className="cq-market-card-title">{listing.title}</h3>
        {isBusiness && listing.description ? (
          <p className="cq-market-card-copy">{listing.description}</p>
        ) : null}
        <p className="cq-market-card-price">{price}</p>
        {!isBusiness ? (
          <p className="cq-market-card-meta">
            {[conditionLabel, MARKETPLACE_CATEGORY_LABELS[listing.category]].filter(Boolean).join(" · ")}
          </p>
        ) : null}
        {!isBusiness && listing.description ? <p className="cq-market-card-copy">{listing.description}</p> : null}
        <p className="cq-market-card-meet">📍 {MARKETPLACE_MEETUP_LABELS[listing.meetupArea]}</p>
        {listing.availabilityNote ? <p className="cq-market-card-copy">{listing.availabilityNote}</p> : null}

        <div className="cq-market-card-actions">
          {isBusiness && onViewShop ? (
            <button type="button" className="cq-market-btn cq-market-btn--secondary" onClick={onViewShop}>
              View Shop
            </button>
          ) : null}
          {!listing.isOwner ? (
            <button type="button" className="cq-market-btn cq-market-btn--primary" onClick={onMessage}>
              Message
            </button>
          ) : null}
          {canOffer && !listing.isOwner ? (
            <button type="button" className="cq-market-btn cq-market-btn--secondary" onClick={onOffer}>
              Make Offer
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
