import { ApiError, fail, ok } from "@/lib/server/http";
import {
  addPartnerFavorite,
  listPartnerFavorites,
  removePartnerFavorite,
  type PartnerFavoritesResponse,
} from "@/lib/server/partnerFavorites";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

const PARTNER_ID = /^[a-z0-9-]{1,80}$/;

function parsePartnerId(value: unknown): string {
  if (typeof value !== "string" || !PARTNER_ID.test(value)) {
    throw new ApiError(400, "Invalid partner.", "INVALID_PARTNER_ID");
  }
  return value;
}

export async function GET(request: Request) {
  try {
    const { user, userClient } = await requireAuthUser(request);
    const partnerIds = await listPartnerFavorites(userClient, user.id);
    return ok<PartnerFavoritesResponse>({ partnerIds });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, userClient } = await requireAuthUser(request);
    enforceRateLimit({ userId: user.id, routeKey: "partners:favorites:write", limit: 40, windowMs: 60_000 });
    let body: { partnerId?: unknown } | null = null;
    try {
      body = (await request.json()) as { partnerId?: unknown } | null;
    } catch {
      body = null;
    }
    const partnerId = parsePartnerId(body?.partnerId);
    await addPartnerFavorite(userClient, user.id, partnerId);
    return ok<PartnerFavoritesResponse>({ partnerIds: await listPartnerFavorites(userClient, user.id) });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { user, userClient } = await requireAuthUser(request);
    enforceRateLimit({ userId: user.id, routeKey: "partners:favorites:write", limit: 40, windowMs: 60_000 });
    const partnerId = parsePartnerId(new URL(request.url).searchParams.get("partnerId"));
    await removePartnerFavorite(userClient, user.id, partnerId);
    return ok<PartnerFavoritesResponse>({ partnerIds: await listPartnerFavorites(userClient, user.id) });
  } catch (error) {
    return fail(error);
  }
}
