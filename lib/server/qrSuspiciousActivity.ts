import type { SupabaseClient } from "@supabase/supabase-js";

type LogArgs = {
  adminClient: SupabaseClient;
  userId: string;
  qrCodeId?: string | null;
  pattern: string;
  detail?: Record<string, unknown>;
};

async function logSuspicious(args: LogArgs) {
  const { adminClient, userId, qrCodeId, pattern, detail } = args;
  await adminClient.from("qr_suspicious_events").insert({
    user_id: userId,
    qr_code_id: qrCodeId ?? null,
    pattern,
    detail: detail ?? null,
  });
}

export async function auditQrScanPatterns(args: {
  adminClient: SupabaseClient;
  userId: string;
  qrCodeId: string;
  status: string;
  deviceHint?: string | null;
  locationName?: string | null;
}) {
  const { adminClient, userId, qrCodeId, status, deviceHint, locationName } = args;
  const since10m = new Date(Date.now() - 10 * 60_000).toISOString();
  const since2m = new Date(Date.now() - 2 * 60_000).toISOString();

  const [{ count: failedRecent }, { count: scansRecent }, { data: recentSuccess }] = await Promise.all([
    adminClient
      .from("qr_scans")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "failed")
      .gte("scanned_at", since10m),
    adminClient
      .from("qr_scans")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("scanned_at", since2m),
    adminClient
      .from("qr_scans")
      .select("id, scanned_at, qr_codes(location_name)")
      .eq("user_id", userId)
      .in("status", ["success", "admin_bypass"])
      .order("scanned_at", { ascending: false })
      .limit(5),
  ]);

  if ((failedRecent ?? 0) >= 5) {
    await logSuspicious({
      adminClient,
      userId,
      qrCodeId,
      pattern: "many_failed_scans",
      detail: { failedRecent, windowMinutes: 10 },
    });
  }

  if ((scansRecent ?? 0) >= 10) {
    await logSuspicious({
      adminClient,
      userId,
      qrCodeId,
      pattern: "rapid_scan_burst",
      detail: { scansRecent, windowMinutes: 2 },
    });
  }

  const rows = (recentSuccess ?? []) as Array<{
    scanned_at: string;
    qr_codes?: { location_name?: string | null };
  }>;
  if (rows.length >= 2) {
    const newest = new Date(rows[0]!.scanned_at).getTime();
    const prev = new Date(rows[1]!.scanned_at).getTime();
    const locA = rows[0]?.qr_codes?.location_name ?? locationName ?? "";
    const locB = rows[1]?.qr_codes?.location_name ?? "";
    const deltaSec = (newest - prev) / 1000;
    if (deltaSec > 0 && deltaSec < 90 && locA && locB && locA !== locB) {
      await logSuspicious({
        adminClient,
        userId,
        qrCodeId,
        pattern: "impossible_location_speed",
        detail: { deltaSec, locA, locB },
      });
    }
  }

  if (deviceHint && deviceHint.length >= 8) {
    const since24h = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const { data: deviceScans } = await adminClient
      .from("qr_scans")
      .select("user_id")
      .eq("device_hint", deviceHint)
      .gte("scanned_at", since24h);
    const distinctUsers = new Set((deviceScans ?? []).map((r) => r.user_id));
    if (distinctUsers.size >= 3) {
      await logSuspicious({
        adminClient,
        userId,
        qrCodeId,
        pattern: "shared_device_hint",
        detail: { deviceHint, distinctUsers: distinctUsers.size },
      });
    }
  }

  if (status === "failed") {
    const { count: permanentFails } = await adminClient
      .from("qr_scans")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("qr_code_id", qrCodeId)
      .eq("status", "failed")
      .gte("scanned_at", since10m);
    if ((permanentFails ?? 0) >= 4) {
      await logSuspicious({
        adminClient,
        userId,
        qrCodeId,
        pattern: "repeated_permanent_qr_failures",
        detail: { permanentFails },
      });
    }
  }

  void status;
}
