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

  it("preserves admin CQ_* token casing", () => {
    expect(normalizeQrCode("CQ_ABC123XYZ")).toBe("CQ_ABC123XYZ");
    expect(extractCampusQuestQrCode("https://campusquest.app/scan?code=CQ_ABC123XYZ")).toBe("CQ_ABC123XYZ");
    expect(isCampusQuestQrCode("CQ_ABC123XYZ")).toBe(true);
  });

  it("reads legacy cq_* tokens from scan URLs", () => {
    expect(extractCampusQuestQrCode("https://campusquest.app/scan?code=cq_perm_gym_v1")).toBe("cq_perm_gym_v1");
  });

  it("accepts UUID payloads", () => {
    const uuid = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
    expect(isCampusQuestQrCode(uuid)).toBe(true);
    expect(normalizeQrCode(uuid)).toBe(uuid);
    expect(extractCampusQuestQrCode(`https://campusquest.app/scan?code=${uuid}`)).toBe(uuid);
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
