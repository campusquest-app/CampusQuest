import { requireAdminUser } from "@/lib/server/adminAuth";
import { fail, ok } from "@/lib/server/http";
import {
  fetchRealmMarkerPositions,
  isMissingRealmConfigTableError,
  MARKER_POSITIONS_CONFIG_KEY,
  testRealmMarkerPositionsSave,
} from "@/lib/server/realmMarkerPositions";
import { fetchProfileRole, userHasPlatformAdminAccess } from "@/lib/server/permissions";
import { createAdminClient, requireAuthUser } from "@/lib/server/supabase";

/** GET — dev/diagnostic: table exists, admin status, read check. */
export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    const profileRole = await fetchProfileRole(auth.userClient, auth.user.id, { email: auth.user.email });
    const isAdmin = userHasPlatformAdminAccess(auth.user, profileRole);

    const admin = createAdminClient();
    const { error: probeError } = await admin
      .from("campus_realm_config")
      .select("config_key")
      .eq("config_key", MARKER_POSITIONS_CONFIG_KEY)
      .maybeSingle();

    const tableExists = !isMissingRealmConfigTableError(probeError);
    let readOk = false;
    let markerRow: { updatedAt: string | null; positionCount: number } | null = null;

    if (tableExists) {
      try {
        const result = await fetchRealmMarkerPositions(auth.userClient);
        readOk = true;
        markerRow = {
          updatedAt: result.updatedAt,
          positionCount: Object.keys(result.positions).length,
        };
      } catch {
        readOk = false;
      }
    }

    return ok({
      tableExists,
      tableReady: tableExists,
      isAdmin,
      readOk,
      configKey: MARKER_POSITIONS_CONFIG_KEY,
      markerRow,
      lookupError: probeError && !tableExists ? probeError.message : null,
      hint: tableExists
        ? null
        : "Run supabase db push to apply campus_realm_config migration, then retry.",
    });
  } catch (error) {
    return fail(error);
  }
}

/** POST — admin-only save round-trip test (upserts current marker_positions). */
export async function POST(request: Request) {
  try {
    const auth = await requireAdminUser(request);

    const admin = createAdminClient();
    const { error: probeError } = await admin
      .from("campus_realm_config")
      .select("config_key")
      .eq("config_key", MARKER_POSITIONS_CONFIG_KEY)
      .maybeSingle();

    if (isMissingRealmConfigTableError(probeError)) {
      return ok({
        saveTestOk: false,
        message: "campus_realm_config table missing — run supabase db push first.",
      });
    }

    const result = await testRealmMarkerPositionsSave(auth.user.id);
    return ok({
      saveTestOk: result.ok,
      positionCount: Object.keys(result.positions).length,
      configKey: MARKER_POSITIONS_CONFIG_KEY,
    });
  } catch (error) {
    return fail(error);
  }
}
