import { z } from "zod";
import {
  MARKETPLACE_BUSINESS_OFFERINGS,
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_CONDITIONS,
  MARKETPLACE_DESCRIPTION_MAX,
  MARKETPLACE_FEED_FILTERS,
  MARKETPLACE_LISTING_KINDS,
  MARKETPLACE_MAX_PHOTOS,
  MARKETPLACE_MEETUP_AREAS,
  MARKETPLACE_PRICE_MAX_DOLLARS,
  MARKETPLACE_REPORT_REASON_VALUES,
  MARKETPLACE_TITLE_MAX,
} from "@/lib/marketplace/policy";

const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,24}$/, "Handle must be 3-24 characters (a-z, 0-9, _).");

export const marketplaceFeedQuerySchema = z.object({
  filter: z.enum(MARKETPLACE_FEED_FILTERS).optional(),
  q: z.string().trim().max(80).optional(),
  businessId: z.string().uuid().optional(),
  mine: z.enum(["1", "true"]).optional(),
});

export const createMarketplaceListingSchema = z.object({
  listingKind: z.enum(MARKETPLACE_LISTING_KINDS),
  title: z.string().trim().min(3).max(MARKETPLACE_TITLE_MAX),
  description: z.string().trim().max(MARKETPLACE_DESCRIPTION_MAX).optional().default(""),
  priceDollars: z.number().min(0).max(MARKETPLACE_PRICE_MAX_DOLLARS),
  startingPrice: z.boolean().optional().default(false),
  category: z.enum(MARKETPLACE_CATEGORIES),
  condition: z.enum(MARKETPLACE_CONDITIONS).nullable().optional(),
  meetupArea: z.enum(MARKETPLACE_MEETUP_AREAS),
  availabilityNote: z.string().trim().max(200).nullable().optional(),
  businessId: z.string().uuid().nullable().optional(),
  photoUrls: z.array(z.string().url()).min(1).max(MARKETPLACE_MAX_PHOTOS),
});

export const patchMarketplaceListingSchema = createMarketplaceListingSchema
  .partial()
  .extend({
    status: z.enum(["active", "sold", "removed"]).optional(),
    photoUrls: z.array(z.string().url()).min(1).max(MARKETPLACE_MAX_PHOTOS).optional(),
  });

export const createMarketplaceOfferSchema = z.object({
  amountDollars: z.number().min(0.01).max(MARKETPLACE_PRICE_MAX_DOLLARS),
});

export const respondMarketplaceOfferSchema = z.object({
  action: z.enum(["accept", "decline"]),
});

export const reportMarketplaceListingSchema = z.object({
  reason: z.enum(MARKETPLACE_REPORT_REASON_VALUES),
  details: z.string().trim().max(2000).optional(),
});

export const createStudentBusinessSchema = z.object({
  name: z.string().trim().min(2).max(80),
  handle: handleSchema,
  category: z.enum(MARKETPLACE_CATEGORIES),
  offering: z.enum(MARKETPLACE_BUSINESS_OFFERINGS),
  bio: z.string().trim().max(400).optional().default(""),
  logoUrl: z
    .preprocess((value) => (value === "" || value === undefined ? null : value), z.string().url().nullable())
    .optional(),
  instagramUrl: z
    .preprocess((value) => (value === "" || value === undefined ? null : value), z.string().url().nullable())
    .optional(),
  websiteUrl: z
    .preprocess((value) => (value === "" || value === undefined ? null : value), z.string().url().nullable())
    .optional(),
  confirmStudentOwned: z.literal(true),
});
