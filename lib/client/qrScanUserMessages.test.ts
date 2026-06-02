import { describe, expect, it } from "vitest";
import { ApiRequestError } from "@/lib/client/dashboardApi";
import { QR_SCAN_USER_MESSAGES, qrScanBannerFromApiError } from "@/lib/client/qrScanUserMessages";
import { campusQrScanSchema } from "@/lib/server/validation";

describe("qrScanBannerFromApiError", () => {
  it("maps expired codes", () => {
    expect(qrScanBannerFromApiError(new ApiRequestError("x", 409, "QR_EXPIRED"))).toBe(
      QR_SCAN_USER_MESSAGES.expired,
    );
  });

  it("maps already redeemed", () => {
    expect(qrScanBannerFromApiError(new ApiRequestError("x", 409, "QR_ALREADY_REDEEMED"))).toBe(
      QR_SCAN_USER_MESSAGES.alreadyScanned,
    );
  });

  it("maps invalid QR to activity not active", () => {
    expect(qrScanBannerFromApiError(new ApiRequestError("x", 404, "INVALID_QR_CODE"))).toBe(
      QR_SCAN_USER_MESSAGES.activityNotActive,
    );
  });
});

describe("campusQrScanSchema", () => {
  it("accepts GYM (3 characters)", () => {
    expect(campusQrScanSchema.safeParse({ code: "GYM" }).success).toBe(true);
  });
});
