"use client";

import { fetchAuthed, patchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import { uploadImageBlob } from "@/lib/client/uploadImageWithProgress";
import type { MarketplaceFeedFilter } from "@/lib/marketplace/policy";
import type { MarketplaceBusiness, MarketplaceListing, MarketplaceOffer } from "@/lib/marketplace/types";
import type { MarketplaceListingKind, MarketplaceCategory, MarketplaceCondition, MarketplaceMeetupArea } from "@/lib/marketplace/policy";
import type { MarketplaceReportReason } from "@/lib/marketplace/policy";

export type MarketplaceListingInput = {
  listingKind: MarketplaceListingKind;
  title: string;
  description: string;
  priceDollars: number;
  startingPrice?: boolean;
  category: MarketplaceCategory;
  condition?: MarketplaceCondition | null;
  meetupArea: MarketplaceMeetupArea;
  availabilityNote?: string | null;
  businessId?: string | null;
  photoUrls: string[];
};

export async function fetchMarketplaceListings(args?: {
  filter?: MarketplaceFeedFilter;
  q?: string;
  businessId?: string;
  mine?: boolean;
}): Promise<MarketplaceListing[]> {
  const qs = new URLSearchParams();
  if (args?.filter) qs.set("filter", args.filter);
  if (args?.q) qs.set("q", args.q);
  if (args?.businessId) qs.set("businessId", args.businessId);
  if (args?.mine) qs.set("mine", "1");
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const data = await fetchAuthed<{ listings: MarketplaceListing[] }>(`/api/marketplace/listings${suffix}`);
  return data.listings;
}

export async function fetchMarketplaceListing(listingId: string): Promise<MarketplaceListing> {
  const data = await fetchAuthed<{ listing: MarketplaceListing }>(`/api/marketplace/listings/${listingId}`);
  return data.listing;
}

export async function createMarketplaceListingRequest(input: MarketplaceListingInput): Promise<MarketplaceListing> {
  const data = await postAuthed<{ listing: MarketplaceListing }, MarketplaceListingInput>(
    "/api/marketplace/listings",
    input,
  );
  return data.listing;
}

export async function updateMarketplaceListingRequest(
  listingId: string,
  input: Partial<MarketplaceListingInput> & { status?: "active" | "sold" | "removed" },
): Promise<MarketplaceListing> {
  const data = await patchAuthed<{ listing: MarketplaceListing }, typeof input>(
    `/api/marketplace/listings/${listingId}`,
    input,
  );
  return data.listing;
}

export async function toggleMarketplaceFavoriteRequest(listingId: string): Promise<{ favorited: boolean }> {
  return postAuthed<{ favorited: boolean }, Record<string, never>>(`/api/marketplace/listings/${listingId}/favorite`, {});
}

export async function createMarketplaceOfferRequest(listingId: string, amountDollars: number): Promise<MarketplaceOffer> {
  const data = await postAuthed<{ offer: MarketplaceOffer }, { amountDollars: number }>(
    `/api/marketplace/listings/${listingId}/offers`,
    { amountDollars },
  );
  return data.offer;
}

export async function fetchMarketplaceListingOffers(listingId: string): Promise<MarketplaceOffer[]> {
  const data = await fetchAuthed<{ offers: MarketplaceOffer[] }>(`/api/marketplace/listings/${listingId}/offers`);
  return data.offers;
}

export async function respondMarketplaceOfferRequest(
  offerId: string,
  action: "accept" | "decline",
): Promise<MarketplaceOffer> {
  const data = await postAuthed<{ offer: MarketplaceOffer }, { action: "accept" | "decline" }>(
    `/api/marketplace/offers/${offerId}/respond`,
    { action },
  );
  return data.offer;
}

export async function messageMarketplaceSellerRequest(listingId: string): Promise<{
  conversationId: string;
  seller: MarketplaceListing["seller"];
}> {
  return postAuthed<{ conversationId: string; seller: MarketplaceListing["seller"] }, Record<string, never>>(
    `/api/marketplace/listings/${listingId}/message`,
    {},
  );
}

export async function reportMarketplaceListingRequest(
  listingId: string,
  payload: { reason: MarketplaceReportReason; details?: string },
): Promise<void> {
  await postAuthed(`/api/marketplace/listings/${listingId}/report`, payload);
}

export async function fetchMyStudentBusinesses(): Promise<MarketplaceBusiness[]> {
  const data = await fetchAuthed<{ businesses: MarketplaceBusiness[] }>("/api/marketplace/businesses");
  return data.businesses;
}

export async function fetchStudentBusiness(businessId: string): Promise<MarketplaceBusiness> {
  const data = await fetchAuthed<{ business: MarketplaceBusiness }>(`/api/marketplace/businesses/${businessId}`);
  return data.business;
}

export async function createStudentBusinessRequest(input: {
  name: string;
  handle: string;
  category: MarketplaceCategory;
  offering: "products" | "services" | "both";
  bio: string;
  logoUrl?: string | null;
  instagramUrl?: string | null;
  websiteUrl?: string | null;
  confirmStudentOwned: true;
}): Promise<MarketplaceBusiness> {
  const data = await postAuthed<{ business: MarketplaceBusiness }, typeof input>("/api/marketplace/businesses", input);
  return data.business;
}

export async function toggleStudentBusinessFollowRequest(businessId: string): Promise<{ followed: boolean }> {
  return postAuthed<{ followed: boolean }, Record<string, never>>(`/api/marketplace/businesses/${businessId}/follow`, {});
}

export async function uploadMarketplaceImage(file: Blob, fileName: string): Promise<string> {
  const data = await uploadImageBlob<{ url: string }>({
    path: "/api/marketplace/listings/media",
    blob: file,
    fileName,
    fieldName: "file",
  });
  if (!data.url?.trim()) {
    throw new Error("Photo upload returned an empty URL.");
  }
  return data.url.trim();
}
