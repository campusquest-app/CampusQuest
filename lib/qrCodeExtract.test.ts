import { describe, expect, it } from "vitest";
import {
  extractCampusQuestQrCode,
  isCampusQuestQrCode,
  isLegacyCampusQuestActivityJson,
  isSecureQrToken,
  normalizeQrCode,
} from "@/lib/qrCodeExtract";

describe("qrCodeExtract", () => {
  it("reads GYM from scan URLs", () => {
    expect(extractCampusQuestQrCode("https://campusquest.app/scan?code=GYM")).toBe("GYM");
    expect(extractCampusQuestQrCode("http://localhost:3000/scan?code=GYM")).toBe("GYM");
    expect(extractCampusQuestQrCode("campusquest://scan?code=GYM")).toBe("GYM");
  });

  it("reads legacy cq_* tokens from scan URLs", () => {
    expect(extractCampusQuestQrCode("https://campusquest.app/scan?code=cq_perm_gym_v1")).toBe("cq_perm_gym_v1");
  });

  it("accepts raw GYM token", () => {
    expect(extractCampusQuestQrCode("GYM")).toBe("GYM");
    expect(normalizeQrCode("gym")).toBe("GYM");
  });

  it("accepts legacy URI gym token", () => {
    expect(extractCampusQuestQrCode("URI_GYM_CHECKIN_V1")).toBe("URI_GYM_CHECKIN_V1");
    expect(
      extractCampusQuestQrCode("https://campusquest.app/scan?code=URI_GYM_CHECKIN_V1"),
    ).toBe("URI_GYM_CHECKIN_V1");
  });

  it("rejects non-campusquest strings", () => {
    expect(extractCampusQuestQrCode("hello-world")).toBeNull();
  });

  it("detects legacy JSON payloads", () => {
    expect(
      isLegacyCampusQuestActivityJson(
        JSON.stringify({ type: "campusquest_activity", activityId: "a", activityName: "Test", xp: 10 }),
      ),
    ).toBe(true);
  });

  it("validates token shapes", () => {
    expect(isCampusQuestQrCode("GYM")).toBe(true);
    expect(isCampusQuestQrCode("LIBRARY")).toBe(true);
    expect(isSecureQrToken("cq_abcd")).toBe(true);
    expect(isCampusQuestQrCode("bad")).toBe(false);
  });
});
