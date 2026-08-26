"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ScreenDataState } from "@/components/ui/ScreenDataState";
import { MarketListingCard } from "@/components/market/MarketListingCard";
import { MarketSellComposer } from "@/components/market/MarketSellComposer";
import { MarketBusinessSheet } from "@/components/market/MarketBusinessSheet";
import { MarketOfferSheet } from "@/components/market/MarketOfferSheet";
import { MarketReportSheet } from "@/components/market/MarketReportSheet";
import {
  MARKETPLACE_FEED_FILTERS,
  MARKETPLACE_FILTER_LABELS,
  type MarketplaceFeedFilter,
} from "@/lib/marketplace/policy";
import type { MarketplaceBusiness, MarketplaceListing, MarketplaceOffer } from "@/lib/marketplace/types";
import {
  fetchMarketplaceListingOffers,
  fetchMarketplaceListings,
  fetchMyStudentBusinesses,
  messageMarketplaceSellerRequest,
  toggleMarketplaceFavoriteRequest,
  updateMarketplaceListingRequest,
} from "@/lib/client/marketplaceClient";
import { postAuthed } from "@/lib/client/dashboardApi";
import { isMissingSessionError } from "@/lib/client/dashboardApi";
import { openVerificationOnboarding } from "@/lib/client/identityStore";

export function TheMarketFeed({
  viewerId,
  sellOpen,
  onSellOpenChange,
  refreshKey = 0,
  onMessageSeller,
  onSessionMissing,
}: {
  viewerId: string;
  sellOpen: boolean;
  onSellOpenChange: (open: boolean) => void;
  refreshKey?: number;
  onMessageSeller: (seller: MarketplaceListing["seller"]) => void;
  onSessionMissing?: () => void;
}) {
  const [filter, setFilter] = useState<MarketplaceFeedFilter>("for_you");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [businesses, setBusinesses] = useState<MarketplaceBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<MarketplaceListing | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [offerListing, setOfferListing] = useState<MarketplaceListing | null>(null);
  const [offerMode, setOfferMode] = useState<"create" | "manage">("create");
  const [offers, setOffers] = useState<MarketplaceOffer[]>([]);

  useEffect(() => {
    const tid = window.setTimeout(() => setDebouncedQuery(query.trim()), 220);
    return () => window.clearTimeout(tid);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextListings, nextBusinesses] = await Promise.all([
        fetchMarketplaceListings({ filter, q: debouncedQuery || undefined }),
        fetchMyStudentBusinesses(),
      ]);
      setListings(nextListings);
      setBusinesses(nextBusinesses);
    } catch (err) {
      if (isMissingSessionError(err)) {
        onSessionMissing?.();
        return;
      }
      setError("Could not load The Market right now.");
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, filter, onSessionMissing]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (!notice) return undefined;
    const tid = window.setTimeout(() => setNotice(null), 2800);
    return () => window.clearTimeout(tid);
  }, [notice]);

  const empty = !loading && !error && listings.length === 0;

  const header = useMemo(
    () => (
      <div className="cq-market-header">
        <h2 className="cq-market-title">The Market</h2>
        <p className="cq-market-subtitle">Buy, sell, and discover student-owned businesses at URI.</p>
        <label className="cq-market-search">
          <Search className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          <input
            type="search"
            enterKeyHint="search"
            placeholder="Search The Market"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
          />
        </label>
        <div className="cq-market-rail" role="tablist" aria-label="Market categories">
          {MARKETPLACE_FEED_FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={filter === item}
              className={`cq-market-chip${filter === item ? " cq-market-chip--active" : ""}`}
              onClick={() => setFilter(item)}
            >
              {MARKETPLACE_FILTER_LABELS[item]}
            </button>
          ))}
        </div>
      </div>
    ),
    [filter, query],
  );

  async function shareListing(listing: MarketplaceListing) {
    const text = `${listing.title} on CampusQuest The Market`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: listing.title, text });
        return;
      }
    } catch {
      /* user cancelled */
    }
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Listing copied.");
    } catch {
      setNotice("Could not share this listing.");
    }
  }

  return (
    <div className="cq-quad-feed-stream cq-market-feed">
      {header}
      {notice ? <p className="cq-market-notice">{notice}</p> : null}
      {loading ? (
        <ScreenDataState variant="loading" message="Loading The Market…" compact />
      ) : error ? (
        <ScreenDataState variant="error" message={error} detail="Check your connection and try again." onRetry={() => void load()} />
      ) : empty ? (
        <ScreenDataState
          variant="empty"
          message="The Market is opening."
          detail="Buy, sell, and discover what URI students are building."
          action={
            <>
              <button type="button" className="cq-market-btn cq-market-btn--primary" onClick={() => onSellOpenChange(true)}>
                Sell Something
              </button>
              <button type="button" className="cq-market-btn cq-market-btn--secondary" onClick={() => openVerificationOnboarding("student_business")}>
                Start a Student Business
              </button>
            </>
          }
        />
      ) : (
        listings.map((listing) => (
          <MarketListingCard
            key={listing.id}
            listing={listing}
            viewerId={viewerId}
            onFavorite={() => {
              void toggleMarketplaceFavoriteRequest(listing.id).then((result) => {
                setListings((prev) =>
                  prev.map((row) =>
                    row.id === listing.id
                      ? { ...row, favorited: result.favorited, favoriteCount: row.favoriteCount + (result.favorited ? 1 : -1) }
                      : row,
                  ),
                );
              });
            }}
            onMessage={() => {
              void messageMarketplaceSellerRequest(listing.id)
                .then((result) => onMessageSeller(result.seller))
                .catch((err) => setNotice(err instanceof Error ? err.message : "Could not message seller."));
            }}
            onOffer={() => {
              setOfferMode("create");
              setOfferListing(listing);
            }}
            onViewShop={listing.businessId ? () => setShopId(listing.businessId) : undefined}
            onShare={() => void shareListing(listing)}
            onReport={() => setReportId(listing.id)}
            onBlock={() => {
              void postAuthed("/api/social/blocks", { userId: listing.sellerId })
                .then(() => {
                  setListings((prev) => prev.filter((row) => row.sellerId !== listing.sellerId));
                  setNotice("Seller blocked.");
                })
                .catch((err) => setNotice(err instanceof Error ? err.message : "Could not block seller."));
            }}
            onEdit={() => {
              setEditing(listing);
              onSellOpenChange(true);
            }}
            onMarkSold={() => {
              void updateMarketplaceListingRequest(listing.id, { status: "sold" })
                .then(() => void load())
                .catch((err) => setNotice(err instanceof Error ? err.message : "Could not mark sold."));
            }}
            onRemove={() => {
              void updateMarketplaceListingRequest(listing.id, { status: "removed" })
                .then(() => void load())
                .catch((err) => setNotice(err instanceof Error ? err.message : "Could not remove listing."));
            }}
            onViewOffers={
              listing.isOwner
                ? () => {
                    setOfferMode("manage");
                    setOfferListing(listing);
                    void fetchMarketplaceListingOffers(listing.id).then(setOffers).catch(() => setOffers([]));
                  }
                : undefined
            }
          />
        ))
      )}

      {empty ? null : (
        <div className="cq-market-start-row">
          <button type="button" className="cq-market-link" onClick={() => openVerificationOnboarding("student_business")}>
            Start a Student Business
          </button>
        </div>
      )}

      {sellOpen ? (
        <MarketSellComposer
          businesses={businesses}
          editing={editing}
          onClose={() => {
            setEditing(null);
            onSellOpenChange(false);
          }}
          onPublished={() => void load()}
        />
      ) : null}
      {shopId ? (
        <MarketBusinessSheet
          businessId={shopId}
          viewerId={viewerId}
          onClose={() => setShopId(null)}
          onMessage={(listing) => {
            void messageMarketplaceSellerRequest(listing.id).then((result) => onMessageSeller(result.seller));
          }}
          onListingAction={() => void load()}
        />
      ) : null}
      {offerListing ? (
        <MarketOfferSheet
          listing={offerListing}
          mode={offerMode}
          offers={offers}
          onClose={() => setOfferListing(null)}
          onChanged={() => void load()}
          onError={setNotice}
        />
      ) : null}
      {reportId ? (
        <MarketReportSheet
          listingId={reportId}
          onClose={() => setReportId(null)}
          onSubmitted={() => setNotice("Thanks — we received your report.")}
          onError={setNotice}
        />
      ) : null}
    </div>
  );
}
