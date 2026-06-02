import { describe, expect, it } from "vitest";
import { ApiRequestError } from "@/lib/client/dashboardApi";
import { normalizeQrScanInput } from "@/lib/client/normalizeQrScanInput";
import {
  QR_SCAN_USER_MESSAGES,
  qrScanBannerFromApiError,
} from "@/lib/client/qrScanUserMessages";
import { resolveQrActivityLink } from "@/lib/server/qrActivityLink";
import { evaluateScanEligibility } from "@/lib/server/qrCodeScan";
import type { QrCodeRow } from "@/lib/server/qrCodeScan";
import { campusQrScanSchema } from "@/lib/server/validation";

const gymRow = {
  id: "gym-id",
  code: "GYM",
  title: "URI Gym",
  description: null,
  type: "permanent_location",
  event_id: null,
  quest_id: null,
  location_name: "URI Gym",
  activity_name: "Hitting the Gym",
  xp_reward: 80,
  is_active: true,
  is_permanent: true,
  cooldown_hours: 24,
  max_scans_per_day: 1,
  requires_staff_approval: false,
  expires_at: null,
} satisfies QrCodeRow;

const GYM_JSON = JSON.stringify({ type: "campusquest_activity", activityId: "GYM" });

describe("QR reward verification — format normalization", () => {
  const cases: { input: string; code: string }[] = [
    { input: "GYM", code: "GYM" },
    { input: "https://campusquest.app/scan?code=GYM", code: "GYM" },
    { input: "http://localhost:3000/scan?code=GYM", code: "GYM" },
    { input: "campusquest://scan?code=GYM", code: "GYM" },
    { input: GYM_JSON, code: "GYM" },
  ];

  it.each(cases)("normalizeQrScanInput($input) → $code", ({ input, code }) => {
    const n = normalizeQrScanInput(input);
    expect(n).not.toBeNull();
    expect(n!.code).toBe(code);
  });

  it("UNKNOWN_TEST normalizes as token; server returns activity not active", () => {
    expect(normalizeQrScanInput("UNKNOWN_TEST")?.code).toBe("UNKNOWN_TEST");
  });
});

describe("QR reward verification — API request schema", () => {
  it("accepts POST body { code: GYM }", () => {
    expect(campusQrScanSchema.safeParse({ code: "GYM" }).success).toBe(true);
  });
});

describe("QR reward verification — user-facing errors", () => {
  it("UNKNOWN / not found → activity not active", () => {
    expect(qrScanBannerFromApiError(new ApiRequestError("x", 404, "ACTIVITY_NOT_FOUND"))).toBe(
      QR_SCAN_USER_MESSAGES.activityNotActive,
    );
  });

  it("cooldown → already claimed", () => {
    expect(qrScanBannerFromApiError(new ApiRequestError("x", 409, "QR_COOLDOWN"))).toBe(
      QR_SCAN_USER_MESSAGES.alreadyScanned,
    );
  });

  it("tables not ready → setup message", () => {
    expect(qrScanBannerFromApiError(new ApiRequestError("x", 503, "QR_TABLES_NOT_READY"))).toBe(
      QR_SCAN_USER_MESSAGES.tablesNotReady,
    );
  });
});

describe("QR reward verification — cooldown", () => {
  it("blocks repeat scan within 24h cooldown", () => {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const result = evaluateScanEligibility({
      row: gymRow,
      role: "student",
      lastSuccessAt: hourAgo,
      successToday: 1,
      priorEventSuccess: false,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("cooldown");
  });

  it("allows scan after cooldown window", () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const result = evaluateScanEligibility({
      row: gymRow,
      role: "student",
      lastSuccessAt: twoDaysAgo,
      successToday: 0,
      priorEventSuccess: false,
    });
    expect(result.allowed).toBe(true);
  });
});

describe("QR reward verification — GYM reward mapping", () => {
  it("GYM links to gym activity with Strength +2", () => {
    const link = resolveQrActivityLink({
      code: "GYM",
      activityName: "Hitting the Gym",
      locationName: "URI Gym",
    });
    expect(link).not.toBeNull();
    expect(link!.activityId).toBe("gym");
    expect(link!.stat).toBe("strength");
    expect(link!.statGain).toBe(2);
  });
});
