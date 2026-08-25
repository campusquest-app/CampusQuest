import type {
  MarketplaceCategory,
  MarketplaceCondition,
  MarketplaceListingKind,
  MarketplaceListingStatus,
  MarketplaceMeetupArea,
  MarketplaceOfferStatus,
} from "@/lib/marketplace/policy";
import type { QuadCarouselMediaDto } from "@/lib/quadMedia";

export type MarketplaceSeller = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  campusVerified: boolean;
};

export type MarketplaceBusinessSummary = {
  id: string;
  name: string;
  handle: string;
  logoUrl: string | null;
  category: MarketplaceCategory;
  verificationStatus: "unverified" | "verified";
  status: "active" | "inactive";
};

export type MarketplaceListing = {
  id: string;
  sellerId: string;
  businessId: string | null;
  listingKind: MarketplaceListingKind;
  title: string;
  description: string;
  priceCents: number;
  startingPrice: boolean;
  category: MarketplaceCategory;
  condition: MarketplaceCondition | null;
  meetupArea: MarketplaceMeetupArea;
  availabilityNote: string | null;
  status: MarketplaceListingStatus;
  soldAt: string | null;
  favoriteCount: number;
  favorited: boolean;
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
  seller: MarketplaceSeller;
  business: MarketplaceBusinessSummary | null;
  media: QuadCarouselMediaDto[];
};

export type MarketplaceOffer = {
  id: string;
  listingId: string;
  listingTitle: string;
  buyerId: string;
  buyerUsername: string;
  amountCents: number;
  status: MarketplaceOfferStatus;
  createdAt: string;
};

export type MarketplaceBusiness = MarketplaceBusinessSummary & {
  ownerId: string;
  bio: string;
  offering: "products" | "services" | "both";
  instagramUrl: string | null;
  websiteUrl: string | null;
  followed: boolean;
  isManager: boolean;
  createdAt: string;
};
