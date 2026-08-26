import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";
import { assertAccountCanSocialize } from "@/lib/server/accountSafety";
import { createContentReport } from "@/lib/server/contentReports";
import { createNotification } from "@/lib/server/notifications";
import {
  canCreateOffer,
  canManageListing,
  canRespondToOffer,
  centsToPriceLabel,
  dollarsToCents,
  findProhibitedMarketplaceReason,
  listingVisibleInDiscovery,
  mapMarketplaceReportToContentReason,
  marketplaceCategoryForFilter,
  marketplaceListingContextLine,
  validateMarketplaceListingCopy,
  type MarketplaceFeedFilter,
  type MarketplaceListingKind,
  type MarketplaceMeetupArea,
  type MarketplaceCategory,
  type MarketplaceCondition,
} from "@/lib/marketplace/policy";
import type { MarketplaceBusiness, MarketplaceListing, MarketplaceOffer } from "@/lib/marketplace/types";
import type { QuadCarouselMediaDto } from "@/lib/quadMedia";
import { assertMarketplaceListingIdentity } from "@/lib/identity/policy";
import { isCampusEmailVerified } from "@/lib/campusEmailVerification";
import { getOrCreateMarketplaceConversation } from "@/lib/server/messaging";

type UserClient = {
  from: (table: string) => any;
};

function admin() {
  return createAdminClient();
}

async function assertNotBlocked(userClient: UserClient, userId: string, otherUserId: string) {
  const [byMe, byThem] = await Promise.all([
    userClient.from("blocked_users").select("id").eq("blocker_id", userId).eq("blocked_id", otherUserId).maybeSingle(),
    userClient.from("blocked_users").select("id").eq("blocker_id", otherUserId).eq("blocked_id", userId).maybeSingle(),
  ]);
  if (byMe.error || byThem.error) {
    throw new ApiError(400, byMe.error?.message ?? byThem.error?.message ?? "Block check failed.", "BLOCK_CHECK_FAILED");
  }
  if (byMe.data) throw new ApiError(409, "You have blocked this user.", "USER_BLOCKED");
  if (byThem.data) throw new ApiError(403, "You cannot contact this seller.", "BLOCKED_BY_USER");
}

function validateListingCopy(args: { title: string; description: string; availabilityNote?: string | null }) {
  const reason = validateMarketplaceListingCopy(args);
  if (!reason) return;
  throw new ApiError(
    400,
    reason,
    reason.includes("meetup") || reason.includes("room") || reason.includes("address")
      ? "MARKETPLACE_UNSAFE_LOCATION"
      : "MARKETPLACE_PROHIBITED",
  );
}

async function profileMapForIds(userClient: UserClient, ids: string[]) {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const map = new Map<
    string,
    { username: string; display_name: string; avatar_url: string | null; campus_email_verified_at: string | null }
  >();
  if (unique.length === 0) return map;
  const { data } = await userClient
    .from("profiles")
    .select("id, username, display_name, avatar_url, campus_email_verified_at")
    .in("id", unique);
  for (const row of data ?? []) {
    map.set(String(row.id), {
      username: String(row.username ?? "student"),
      display_name: String(row.display_name ?? row.username ?? "Student"),
      avatar_url: (row.avatar_url as string | null) ?? null,
      campus_email_verified_at: (row.campus_email_verified_at as string | null) ?? null,
    });
  }
  return map;
}

async function isBusinessManager(userClient: UserClient, userId: string, businessId: string | null | undefined) {
  if (!businessId) return false;
  const { data } = await userClient
    .from("student_business_members")
    .select("role")
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.role === "owner" || data?.role === "admin";
}

async function getManagedBusiness(userClient: UserClient, userId: string, businessId: string) {
  const manager = await isBusinessManager(userClient, userId, businessId);
  const { data } = await userClient
    .from("student_businesses")
    .select("id, verification_status, status")
    .eq("id", businessId)
    .maybeSingle();
  if (!data) return null;
  return {
    verificationStatus: data.verification_status === "verified" ? ("verified" as const) : ("unverified" as const),
    status: data.status === "inactive" ? ("inactive" as const) : ("active" as const),
    isManager: manager,
  };
}

function mapMedia(rows: Array<Record<string, unknown>> | null | undefined): QuadCarouselMediaDto[] {
  return (rows ?? []).map((row, index) => ({
    id: String(row.id),
    mediaType: row.media_type === "video" ? "video" : "image",
    sortOrder: Number(row.sort_order ?? index),
    url: String(row.url ?? ""),
    thumbnailUrl: typeof row.thumbnail_url === "string" ? row.thumbnail_url : null,
    mimeType: "image/jpeg",
    fileSizeBytes: 0,
    durationSeconds: null,
    width: null,
    height: null,
    hasAudio: false,
    processingStatus: "ready",
  }));
}

function mapListing(
  row: Record<string, unknown>,
  args: {
    viewerId: string;
    favorited: boolean;
    seller?: {
      username: string;
      display_name: string;
      avatar_url: string | null;
      campus_email_verified_at: string | null;
    };
  },
): MarketplaceListing {
  const business = (row.business as Record<string, unknown> | null) ?? null;
  const sellerId = String(row.seller_id);
  const seller = args.seller;
  return {
    id: String(row.id),
    sellerId,
    businessId: (row.business_id as string | null) ?? null,
    listingKind: row.listing_kind as MarketplaceListingKind,
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    priceCents: Number(row.price_cents ?? 0),
    startingPrice: row.starting_price === true,
    category: row.category as MarketplaceCategory,
    condition: (row.condition as MarketplaceCondition | null) ?? null,
    meetupArea: row.meetup_area as MarketplaceMeetupArea,
    availabilityNote: (row.availability_note as string | null) ?? null,
    status: row.status as MarketplaceListing["status"],
    soldAt: (row.sold_at as string | null) ?? null,
    favoriteCount: Number(row.favorite_count ?? 0),
    favorited: args.favorited,
    isOwner: args.viewerId === sellerId,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    seller: {
      id: sellerId,
      username: seller?.username ?? "student",
      displayName: seller?.display_name ?? seller?.username ?? "Student",
      avatarUrl: seller?.avatar_url ?? null,
      campusVerified: isCampusEmailVerified({
        campus_email_verified_at: seller?.campus_email_verified_at ?? null,
      }),
    },
    business: business
      ? {
          id: String(business.id),
          name: String(business.name ?? ""),
          handle: String(business.handle ?? ""),
          logoUrl: (business.logo_url as string | null) ?? null,
          category: business.category as MarketplaceCategory,
          verificationStatus: business.verification_status === "verified" ? "verified" : "unverified",
          status: business.status === "inactive" ? "inactive" : "active",
        }
      : null,
    media: mapMedia(row.media as Array<Record<string, unknown>> | undefined),
  };
}

const LISTING_SELECT =
  "id, seller_id, business_id, listing_kind, title, description, price_cents, starting_price, category, condition, meetup_area, availability_note, status, sold_at, favorite_count, created_at, updated_at, business:student_businesses(id, name, handle, logo_url, category, verification_status, status), media:marketplace_listing_media(id, url, thumbnail_url, media_type, sort_order)";

export async function listMarketplaceListings(args: {
  userClient: UserClient;
  userId: string;
  filter?: MarketplaceFeedFilter;
  query?: string;
  businessId?: string;
  mine?: boolean;
  campusFeed?: boolean;
}): Promise<MarketplaceListing[]> {
  await assertAccountCanSocialize(args.userClient as never, args.userId);
  let q = args.userClient
    .from("marketplace_listings")
    .select(LISTING_SELECT)
    .order("created_at", { ascending: false })
    .limit(args.campusFeed ? 24 : 80);

  if (args.mine) {
    q = q.eq("seller_id", args.userId).neq("status", "removed");
  } else if (args.businessId) {
    q = q.eq("business_id", args.businessId).eq("status", "active");
  } else {
    q = q.eq("status", "active");
    const category = args.filter ? marketplaceCategoryForFilter(args.filter) : null;
    if (category) q = q.eq("category", category);
    if (args.filter === "student_owned") q = q.not("business_id", "is", null);
    if (args.filter === "free") q = q.eq("price_cents", 0);
    if (args.campusFeed) q = q.eq("show_in_campus_feed", true);
  }

  const { data, error } = await q;
  if (error) {
    if (args.campusFeed && /show_in_campus_feed/i.test(error.message ?? "")) {
      return listMarketplaceListings({ ...args, campusFeed: false });
    }
    throw new ApiError(400, error.message, "MARKETPLACE_LIST_FAILED");
  }

  const listingIds = (data ?? []).map((row: { id: string }) => row.id);
  const favoriteIds = new Set<string>();
  if (listingIds.length > 0) {
    const { data: favs } = await args.userClient
      .from("marketplace_favorites")
      .select("listing_id")
      .eq("user_id", args.userId)
      .in("listing_id", listingIds);
    for (const row of favs ?? []) favoriteIds.add(row.listing_id as string);
  }

  const needle = args.query?.trim().toLowerCase() ?? "";
  const sellers = await profileMapForIds(
    args.userClient,
    (data ?? []).map((row: { seller_id: string }) => row.seller_id),
  );
  return (data ?? [])
    .map((row: Record<string, unknown>) =>
      mapListing(row, {
        viewerId: args.userId,
        favorited: favoriteIds.has(String(row.id)),
        seller: sellers.get(String(row.seller_id)),
      }),
    )
    .filter((listing: MarketplaceListing) => {
      if (args.mine) return true;
      if (!listingVisibleInDiscovery({ status: listing.status, soldAt: listing.soldAt })) return false;
      if (!needle) return true;
      return `${listing.title} ${listing.description} ${listing.seller.username} ${listing.business?.name ?? ""}`
        .toLowerCase()
        .includes(needle);
    });
}

export async function getMarketplaceListing(args: {
  userClient: UserClient;
  userId: string;
  listingId: string;
}): Promise<MarketplaceListing> {
  const { data, error } = await args.userClient
    .from("marketplace_listings")
    .select(LISTING_SELECT)
    .eq("id", args.listingId)
    .maybeSingle();
  if (error || !data) throw new ApiError(404, "Listing not found.", "MARKETPLACE_LISTING_NOT_FOUND");
  const { data: fav } = await args.userClient
    .from("marketplace_favorites")
    .select("listing_id")
    .eq("user_id", args.userId)
    .eq("listing_id", args.listingId)
    .maybeSingle();
  const sellers = await profileMapForIds(args.userClient, [String((data as { seller_id: string }).seller_id)]);
  return mapListing(data as Record<string, unknown>, {
    viewerId: args.userId,
    favorited: Boolean(fav),
    seller: sellers.get(String((data as { seller_id: string }).seller_id)),
  });
}

export async function createMarketplaceListing(args: {
  userClient: UserClient;
  userId: string;
  input: {
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
}): Promise<MarketplaceListing> {
  await assertAccountCanSocialize(args.userClient as never, args.userId);
  validateListingCopy(args.input);
  if (args.input.listingKind === "item" && !args.input.condition) {
    throw new ApiError(400, "Choose a condition for this item.", "MARKETPLACE_CONDITION_REQUIRED");
  }
  const businessId = args.input.listingKind === "item" ? null : args.input.businessId ?? null;
  const business = businessId ? await getManagedBusiness(args.userClient, args.userId, businessId) : null;
  const identityGate = assertMarketplaceListingIdentity({
    listingKind: args.input.listingKind,
    business,
  });
  if (!identityGate.ok) {
    throw new ApiError(403, identityGate.message, identityGate.code);
  }

  const priceCents =
    args.input.category === "free" ? 0 : dollarsToCents(args.input.priceDollars);
  const { data, error } = await args.userClient
    .from("marketplace_listings")
    .insert({
      seller_id: args.userId,
      business_id: businessId,
      listing_kind: args.input.listingKind,
      show_in_campus_feed: true,
      title: args.input.title.trim(),
      description: args.input.description.trim(),
      price_cents: priceCents,
      starting_price: args.input.startingPrice === true || args.input.listingKind !== "item",
      category: args.input.category,
      condition: args.input.listingKind === "item" ? args.input.condition : null,
      meetup_area: args.input.meetupArea,
      availability_note: args.input.availabilityNote?.trim() || null,
      status: "active",
    })
    .select("id")
    .single();
  if (error || !data) throw new ApiError(400, error?.message ?? "Could not create listing.", "MARKETPLACE_CREATE_FAILED");

  const mediaRows = args.input.photoUrls.map((url, index) => ({
    listing_id: data.id,
    url,
    thumbnail_url: url,
    media_type: "image",
    sort_order: index,
  }));
  const { error: mediaError } = await args.userClient.from("marketplace_listing_media").insert(mediaRows);
  if (mediaError) throw new ApiError(400, mediaError.message, "MARKETPLACE_MEDIA_FAILED");

  return getMarketplaceListing({ userClient: args.userClient, userId: args.userId, listingId: data.id });
}

export async function updateMarketplaceListing(args: {
  userClient: UserClient;
  userId: string;
  listingId: string;
  input: Partial<{
    title: string;
    description: string;
    priceDollars: number;
    startingPrice: boolean;
    category: MarketplaceCategory;
    condition: MarketplaceCondition | null;
    meetupArea: MarketplaceMeetupArea;
    availabilityNote: string | null;
    status: "active" | "sold" | "removed";
    photoUrls: string[];
  }>;
}): Promise<MarketplaceListing> {
  await assertAccountCanSocialize(args.userClient as never, args.userId);
  const existing = await getMarketplaceListing(args);
  const manager = await isBusinessManager(args.userClient, args.userId, existing.businessId);
  if (!canManageListing({ sellerId: existing.sellerId, businessMember: manager, actorId: args.userId })) {
    throw new ApiError(403, "You can only edit your own listings.", "MARKETPLACE_FORBIDDEN");
  }
  if (args.input.title || args.input.description || args.input.availabilityNote) {
    validateListingCopy({
      title: args.input.title ?? existing.title,
      description: args.input.description ?? existing.description,
      availabilityNote: args.input.availabilityNote ?? existing.availabilityNote,
    });
  }

  const patch: Record<string, unknown> = {};
  if (args.input.title) patch.title = args.input.title.trim();
  if (args.input.description != null) patch.description = args.input.description.trim();
  if (args.input.priceDollars != null) patch.price_cents = dollarsToCents(args.input.priceDollars);
  if (args.input.startingPrice != null) patch.starting_price = args.input.startingPrice;
  if (args.input.category) patch.category = args.input.category;
  if (args.input.condition !== undefined) patch.condition = args.input.condition;
  if (args.input.meetupArea) patch.meetup_area = args.input.meetupArea;
  if (args.input.availabilityNote !== undefined) patch.availability_note = args.input.availabilityNote;
  if (args.input.status === "sold") {
    patch.status = "sold";
    patch.sold_at = new Date().toISOString();
  } else if (args.input.status === "removed") {
    patch.status = "removed";
    patch.removed_at = new Date().toISOString();
  } else if (args.input.status === "active") {
    patch.status = "active";
    patch.sold_at = null;
    patch.removed_at = null;
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await args.userClient.from("marketplace_listings").update(patch).eq("id", args.listingId);
    if (error) throw new ApiError(400, error.message, "MARKETPLACE_UPDATE_FAILED");
  }

  if (args.input.photoUrls) {
    await args.userClient.from("marketplace_listing_media").delete().eq("listing_id", args.listingId);
    const { error: mediaError } = await args.userClient.from("marketplace_listing_media").insert(
      args.input.photoUrls.map((url, index) => ({
        listing_id: args.listingId,
        url,
        thumbnail_url: url,
        media_type: "image",
        sort_order: index,
      })),
    );
    if (mediaError) throw new ApiError(400, mediaError.message, "MARKETPLACE_MEDIA_FAILED");
  }

  return getMarketplaceListing(args);
}

export async function toggleMarketplaceFavorite(args: {
  userClient: UserClient;
  userId: string;
  listingId: string;
}): Promise<{ favorited: boolean }> {
  await assertAccountCanSocialize(args.userClient as never, args.userId);
  const listing = await getMarketplaceListing(args);
  const { data: existing } = await args.userClient
    .from("marketplace_favorites")
    .select("listing_id")
    .eq("user_id", args.userId)
    .eq("listing_id", args.listingId)
    .maybeSingle();
  if (existing) {
    const { error } = await args.userClient
      .from("marketplace_favorites")
      .delete()
      .eq("user_id", args.userId)
      .eq("listing_id", listing.id);
    if (error) throw new ApiError(400, error.message, "MARKETPLACE_FAVORITE_FAILED");
    return { favorited: false };
  }
  const { error } = await args.userClient
    .from("marketplace_favorites")
    .insert({ user_id: args.userId, listing_id: listing.id });
  if (error) throw new ApiError(400, error.message, "MARKETPLACE_FAVORITE_FAILED");
  return { favorited: true };
}

export async function createMarketplaceOffer(args: {
  userClient: UserClient;
  userId: string;
  listingId: string;
  amountDollars: number;
}): Promise<MarketplaceOffer> {
  await assertAccountCanSocialize(args.userClient as never, args.userId);
  const listing = await getMarketplaceListing(args);
  if (!canCreateOffer({ sellerId: listing.sellerId, buyerId: args.userId, status: listing.status })) {
    throw new ApiError(403, "You cannot offer on this listing.", "MARKETPLACE_OFFER_FORBIDDEN");
  }
  await assertNotBlocked(args.userClient, args.userId, listing.sellerId);

  const amountCents = dollarsToCents(args.amountDollars);
  const { data, error } = await args.userClient
    .from("marketplace_offers")
    .insert({
      listing_id: listing.id,
      buyer_id: args.userId,
      amount_cents: amountCents,
      status: "pending",
    })
    .select("id, listing_id, buyer_id, amount_cents, status, created_at")
    .single();
  if (error || !data) {
    if (typeof error?.message === "string" && /duplicate|unique/i.test(error.message)) {
      throw new ApiError(409, "You already have a pending offer on this listing.", "MARKETPLACE_OFFER_EXISTS");
    }
    throw new ApiError(400, error?.message ?? "Could not send offer.", "MARKETPLACE_OFFER_FAILED");
  }

  const { data: buyer } = await args.userClient
    .from("profiles")
    .select("username")
    .eq("id", args.userId)
    .maybeSingle();
  const username = (buyer?.username as string | undefined) ?? "A student";
  try {
    await createNotification({
      userId: listing.sellerId,
      type: "marketplace_offer",
      title: "New Market offer",
      body: `@${username} offered ${centsToPriceLabel(amountCents)} for ${listing.title}`,
      relatedEntityType: "marketplace_listing",
      relatedEntityId: listing.id,
      actorId: args.userId,
    });
  } catch {
    /* offer still saved */
  }

  return {
    id: data.id,
    listingId: listing.id,
    listingTitle: listing.title,
    buyerId: args.userId,
    buyerUsername: username,
    amountCents,
    status: "pending",
    createdAt: data.created_at,
  };
}

export async function respondToMarketplaceOffer(args: {
  userClient: UserClient;
  userId: string;
  offerId: string;
  action: "accept" | "decline";
}): Promise<{ offer: MarketplaceOffer }> {
  await assertAccountCanSocialize(args.userClient as never, args.userId);
  const { data: offer, error } = await args.userClient
    .from("marketplace_offers")
    .select("id, listing_id, buyer_id, amount_cents, status, created_at")
    .eq("id", args.offerId)
    .maybeSingle();
  if (error || !offer) throw new ApiError(404, "Offer not found.", "MARKETPLACE_OFFER_NOT_FOUND");
  if (offer.status !== "pending") {
    throw new ApiError(409, "This offer is no longer pending.", "MARKETPLACE_OFFER_NOT_PENDING");
  }
  const listing = await getMarketplaceListing({
    userClient: args.userClient,
    userId: args.userId,
    listingId: offer.listing_id,
  });
  if (!canRespondToOffer({ sellerId: listing.sellerId, actorId: args.userId })) {
    throw new ApiError(403, "Only the seller can respond to this offer.", "MARKETPLACE_OFFER_FORBIDDEN");
  }

  const nextStatus = args.action === "accept" ? "accepted" : "declined";
  const { error: updateError } = await args.userClient
    .from("marketplace_offers")
    .update({ status: nextStatus, responded_at: new Date().toISOString() })
    .eq("id", args.offerId)
    .eq("status", "pending");
  if (updateError) throw new ApiError(400, updateError.message, "MARKETPLACE_OFFER_UPDATE_FAILED");

  if (args.action === "accept") {
    await args.userClient
      .from("marketplace_listings")
      .update({ status: "pending" })
      .eq("id", listing.id)
      .eq("status", "active");
    await args.userClient
      .from("marketplace_offers")
      .update({ status: "declined", responded_at: new Date().toISOString() })
      .eq("listing_id", listing.id)
      .eq("status", "pending")
      .neq("id", args.offerId);
  }

  try {
    await createNotification({
      userId: offer.buyer_id,
      type: args.action === "accept" ? "marketplace_offer_accepted" : "marketplace_offer_declined",
      title: args.action === "accept" ? "Offer accepted" : "Offer declined",
      body:
        args.action === "accept"
          ? `Your offer of ${centsToPriceLabel(Number(offer.amount_cents))} for ${listing.title} was accepted. Arrange payment and meetup in Messages.`
          : `Your offer for ${listing.title} was declined.`,
      relatedEntityType: "marketplace_listing",
      relatedEntityId: listing.id,
      actorId: args.userId,
    });
  } catch {
    /* ignore */
  }

  const { data: buyer } = await args.userClient
    .from("profiles")
    .select("username")
    .eq("id", offer.buyer_id)
    .maybeSingle();

  return {
    offer: {
      id: offer.id,
      listingId: listing.id,
      listingTitle: listing.title,
      buyerId: offer.buyer_id,
      buyerUsername: (buyer?.username as string | undefined) ?? "student",
      amountCents: Number(offer.amount_cents),
      status: nextStatus,
      createdAt: offer.created_at,
    },
  };
}

export async function listListingOffers(args: {
  userClient: UserClient;
  userId: string;
  listingId: string;
}): Promise<MarketplaceOffer[]> {
  const listing = await getMarketplaceListing(args);
  const manager = await isBusinessManager(args.userClient, args.userId, listing.businessId);
  if (!canManageListing({ sellerId: listing.sellerId, businessMember: manager, actorId: args.userId })) {
    throw new ApiError(403, "Only the seller can view offers.", "MARKETPLACE_OFFER_FORBIDDEN");
  }
  const { data, error } = await args.userClient
    .from("marketplace_offers")
    .select("id, listing_id, buyer_id, amount_cents, status, created_at")
    .eq("listing_id", args.listingId)
    .order("created_at", { ascending: false });
  if (error) throw new ApiError(400, error.message, "MARKETPLACE_OFFERS_FAILED");
  const buyers = await profileMapForIds(
    args.userClient,
    (data ?? []).map((row: { buyer_id: string }) => row.buyer_id),
  );
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    listingId: String(row.listing_id),
    listingTitle: listing.title,
    buyerId: String(row.buyer_id),
    buyerUsername: buyers.get(String(row.buyer_id))?.username ?? "student",
    amountCents: Number(row.amount_cents),
    status: row.status as MarketplaceOffer["status"],
    createdAt: String(row.created_at),
  }));
}

export async function openMarketplaceSellerConversation(args: {
  userClient: UserClient;
  userId: string;
  listingId: string;
}): Promise<{ conversationId: string; seller: MarketplaceListing["seller"] }> {
  await assertAccountCanSocialize(args.userClient as never, args.userId);
  const listing = await getMarketplaceListing(args);
  if (listing.status === "removed") {
    throw new ApiError(404, "This listing is no longer available.", "MARKETPLACE_LISTING_NOT_FOUND");
  }

  const conversation = await getOrCreateMarketplaceConversation({
    userClient: args.userClient as never,
    userId: args.userId,
    otherUserId: listing.sellerId,
  });

  const context = marketplaceListingContextLine(listing.title, listing.priceCents, listing.startingPrice);
  const svc = admin();
  const { data: recent } = await svc
    .from("direct_messages")
    .select("id, metadata")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true })
    .limit(30);
  const alreadyAttached = (recent ?? []).some((row: { metadata?: Record<string, unknown> | null }) => {
    return row.metadata?.marketplaceListingId === listing.id;
  });
  if (!alreadyAttached) {
    await svc.from("direct_messages").insert({
      conversation_id: conversation.id,
      sender_id: args.userId,
      recipient_id: listing.sellerId,
      content: context,
      type: "text",
      metadata: {
        marketplaceListingId: listing.id,
        marketplaceTitle: listing.title,
        marketplacePrice: centsToPriceLabel(listing.priceCents, listing.startingPrice),
      },
    });
  }

  return { conversationId: conversation.id, seller: listing.seller };
}

export async function reportMarketplaceListing(args: {
  userClient: UserClient;
  userId: string;
  listingId: string;
  reason: Parameters<typeof mapMarketplaceReportToContentReason>[0];
  details?: string;
}) {
  const listing = await getMarketplaceListing(args);
  const contentReason = mapMarketplaceReportToContentReason(args.reason);
  return createContentReport({
    userClient: args.userClient,
    reporterId: args.userId,
    targetType: "marketplace_listing",
    targetId: listing.id,
    reportedUserId: listing.sellerId,
    reason: contentReason,
    details: `[The Market: ${args.reason}] ${args.details?.trim() ?? ""}`.trim(),
  });
}

export async function listMyStudentBusinesses(args: {
  userClient: UserClient;
  userId: string;
}): Promise<MarketplaceBusiness[]> {
  const { data, error } = await args.userClient
    .from("student_business_members")
    .select(
      "role, business:student_businesses(id, owner_id, name, handle, logo_url, bio, category, offering, instagram_url, website_url, verification_status, status, created_at)",
    )
    .eq("user_id", args.userId);
  if (error) throw new ApiError(400, error.message, "MARKETPLACE_BUSINESS_LIST_FAILED");
  return (data ?? [])
    .map((row: Record<string, unknown>) => {
      const business = row.business as Record<string, unknown> | null;
      if (!business) return null;
      return mapBusiness(business, { viewerId: args.userId, followed: false, isManager: true });
    })
    .filter(Boolean) as MarketplaceBusiness[];
}

function mapBusiness(
  row: Record<string, unknown>,
  args: { viewerId: string; followed: boolean; isManager: boolean },
): MarketplaceBusiness {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    name: String(row.name ?? ""),
    handle: String(row.handle ?? ""),
    logoUrl: (row.logo_url as string | null) ?? null,
    bio: String(row.bio ?? ""),
    category: row.category as MarketplaceCategory,
    offering: row.offering === "services" || row.offering === "both" ? row.offering : "products",
    instagramUrl: (row.instagram_url as string | null) ?? null,
    websiteUrl: (row.website_url as string | null) ?? null,
    verificationStatus: row.verification_status === "verified" ? "verified" : "unverified",
    status: row.status === "inactive" ? "inactive" : "active",
    followed: args.followed,
    isManager: args.isManager,
    createdAt: String(row.created_at),
  };
}

export async function getStudentBusiness(args: {
  userClient: UserClient;
  userId: string;
  businessId: string;
}): Promise<MarketplaceBusiness> {
  const { data, error } = await args.userClient
    .from("student_businesses")
    .select(
      "id, owner_id, name, handle, logo_url, bio, category, offering, instagram_url, website_url, verification_status, status, created_at",
    )
    .eq("id", args.businessId)
    .maybeSingle();
  if (error || !data) throw new ApiError(404, "Business not found.", "MARKETPLACE_BUSINESS_NOT_FOUND");
  const manager = await isBusinessManager(args.userClient, args.userId, args.businessId);
  const { data: follow } = await args.userClient
    .from("marketplace_business_follows")
    .select("business_id")
    .eq("user_id", args.userId)
    .eq("business_id", args.businessId)
    .maybeSingle();
  return mapBusiness(data as Record<string, unknown>, {
    viewerId: args.userId,
    followed: Boolean(follow),
    isManager: manager,
  });
}

export async function createStudentBusiness(args: {
  userClient: UserClient;
  userId: string;
  input: {
    name: string;
    handle: string;
    category: MarketplaceCategory;
    offering: "products" | "services" | "both";
    bio: string;
    logoUrl?: string | null;
    instagramUrl?: string | null;
    websiteUrl?: string | null;
  };
}): Promise<MarketplaceBusiness> {
  await assertAccountCanSocialize(args.userClient as never, args.userId);
  const { data: profile } = await args.userClient
    .from("profiles")
    .select("campus_email_verified_at")
    .eq("id", args.userId)
    .maybeSingle();
  if (!isCampusEmailVerified({ campus_email_verified_at: profile?.campus_email_verified_at as string | null })) {
    throw new ApiError(403, "Verify your URI email to start a Student Business.", "MARKETPLACE_CAMPUS_REQUIRED");
  }
  const prohibited = findProhibitedMarketplaceReason(`${args.input.name}\n${args.input.bio}`);
  if (prohibited) throw new ApiError(400, prohibited, "MARKETPLACE_PROHIBITED");

  const { data, error } = await args.userClient
    .from("student_businesses")
    .insert({
      owner_id: args.userId,
      name: args.input.name.trim(),
      handle: args.input.handle.trim().toLowerCase(),
      category: args.input.category,
      offering: args.input.offering,
      bio: args.input.bio.trim(),
      logo_url: args.input.logoUrl ?? null,
      instagram_url: args.input.instagramUrl ?? null,
      website_url: args.input.websiteUrl ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    if (typeof error?.message === "string" && /duplicate|unique|handle/i.test(error.message)) {
      throw new ApiError(409, "That business handle is taken.", "MARKETPLACE_HANDLE_TAKEN");
    }
    throw new ApiError(400, error?.message ?? "Could not create business.", "MARKETPLACE_BUSINESS_CREATE_FAILED");
  }

  const { error: memberError } = await args.userClient.from("student_business_members").insert({
    business_id: data.id,
    user_id: args.userId,
    role: "owner",
  });
  if (memberError) throw new ApiError(400, memberError.message, "MARKETPLACE_BUSINESS_MEMBER_FAILED");

  return getStudentBusiness({ userClient: args.userClient, userId: args.userId, businessId: data.id });
}

export async function toggleBusinessFollow(args: {
  userClient: UserClient;
  userId: string;
  businessId: string;
}): Promise<{ followed: boolean }> {
  await getStudentBusiness(args);
  const { data: existing } = await args.userClient
    .from("marketplace_business_follows")
    .select("business_id")
    .eq("user_id", args.userId)
    .eq("business_id", args.businessId)
    .maybeSingle();
  if (existing) {
    await args.userClient
      .from("marketplace_business_follows")
      .delete()
      .eq("user_id", args.userId)
      .eq("business_id", args.businessId);
    return { followed: false };
  }
  const { error } = await args.userClient.from("marketplace_business_follows").insert({
    user_id: args.userId,
    business_id: args.businessId,
  });
  if (error) throw new ApiError(400, error.message, "MARKETPLACE_FOLLOW_FAILED");
  return { followed: true };
}

export async function uploadMarketplaceImage(args: {
  userId: string;
  buffer: Buffer;
  mime: string;
}): Promise<{ url: string }> {
  const mime = args.mime.toLowerCase().replace("image/jpg", "image/jpeg");
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) {
    throw new ApiError(400, "Use a JPEG, PNG, or WebP image.", "IMAGE_FORMAT_UNSUPPORTED");
  }
  if (args.buffer.length === 0 || args.buffer.length > 25 * 1024 * 1024) {
    throw new ApiError(400, "This image file is too large.", "IMAGE_TOO_LARGE");
  }
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const path = `${args.userId}/marketplace/${crypto.randomUUID()}.${ext}`;
  const svc = admin();
  const { error } = await svc.storage.from("quad-post-images").upload(path, args.buffer, {
    contentType: mime,
    upsert: false,
  });
  if (error) throw new ApiError(400, error.message, "MARKETPLACE_UPLOAD_FAILED");
  const { data } = svc.storage.from("quad-post-images").getPublicUrl(path);
  return { url: data.publicUrl };
}
