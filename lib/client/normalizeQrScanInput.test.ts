import { describe, expect, it } from "vitest";
import { normalizeQrScanInput } from "@/lib/client/normalizeQrScanInput";

describe("normalizeQrScanInput", () => {
  it("normalizes plain GYM", () => {
    expect(normalizeQrScanInput("GYM")).toEqual({ code: "GYM", format: "plain_code" });
  });

  it("normalizes minimal activity JSON to GYM", () => {
    expect(
      normalizeQrScanInput(
        JSON.stringify({ type: "campusquest_activity", activityId: "GYM" }),
      ),
    ).toEqual({ code: "GYM", format: "legacy_activity_json" });
  });

  it("normalizes campusquest:// deep link", () => {
    expect(normalizeQrScanInput("campusquest://scan?code=GYM")).toEqual({
      code: "GYM",
      format: "custom_scheme",
    });
  });
});
