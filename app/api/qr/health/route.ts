import { ok, fail } from "@/lib/server/http";
import { createAdminClient, requireAuthUser } from "@/lib/server/supabase";

/** GET — dev/diagnostic: verify qr_codes table and GYM seed (authenticated). */
export async function GET(request: Request) {
  try {
    await requireAuthUser(request);
    const admin = createAdminClient();
    const { data: gym, error } = await admin
      .from("qr_codes")
      .select("code, title, xp_reward, is_active, activity_name, type")
      .eq("code", "GYM")
      .maybeSingle();

    if (error) {
      const msg = error.message ?? "";
      const tablesMissing = /(schema cache|Could not find the table)/i.test(msg) && /qr_codes/i.test(msg);
      return ok({
        tablesReady: !tablesMissing,
        gym: null,
        lookupError: msg,
        code: error.code ?? null,
      });
    }

    return ok({
      tablesReady: true,
      gym: gym ?? null,
      lookupError: null,
    });
  } catch (error) {
    return fail(error);
  }
}
