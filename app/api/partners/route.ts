import { fail, ok } from "@/lib/server/http";
import { requireAuthUser } from "@/lib/server/supabase";
import type { PartnersResponse } from "@/lib/partners/types";

export async function GET(request: Request) {
  try {
    await requireAuthUser(request);
    // No partner tables exist yet. When they do, read active rows via the user-scoped
    // client (RLS: read-only, active + in-window) and map them with `mapPartnerRow`.
    const body: PartnersResponse = { partners: [] };
    return ok(body);
  } catch (error) {
    return fail(error);
  }
}
