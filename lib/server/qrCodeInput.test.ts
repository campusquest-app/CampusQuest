import { describe, expect, it } from "vitest";
import {
  createQrCodeSchema,
  mapAdminQrTypeToLegacyType,
  normalizeCreateQrCodeInput,
  normalizeOptionalCode,
  normalizePartialQrCodeInput,
  updateQrCodeSchema,
} from "@/lib/server/qrCodeInput";

describe("normalizeCreateQrCodeInput", () => {
  it("accepts snake_case quest builder payload", () => {
    const normalized = normalizeCreateQrCodeInput({
      name: "Quest QR Code",
      description: "QR code for completing this quest",
      qr_type: "quest_completion",
      quest_id: "00000000-0000-4000-8000-000000000001",
      xp_reward: 50,
      location_name: "Memorial Union",
      expires_at: "2026-06-24T23:59:59.000Z",
      max_uses: null,
      is_active: true,
      metadata: {
        source: "admin_quest_builder",
        completion_method: "qr_scan",
      },
    });

    expect(normalized.title).toBe("Quest QR Code");
    expect(normalized.type).toBe("quest");
    expect(normalized.qrType).toBe("quest_completion");
    expect(normalized.questId).toBe("00000000-0000-4000-8000-000000000001");
    expect(normalized.xpReward).toBe(50);
    expect(normalized.isActive).toBe(true);
    expect(normalized.maxScansPerDay).toBe(0);
    expect(normalized.metadata.source).toBe("admin_quest_builder");
    expect(normalized.code).toBeUndefined();
  });

  it("accepts legacy QR admin panel camelCase payload", () => {
    const normalized = normalizeCreateQrCodeInput({
      title: "URI Gym",
      type: "permanent_location",
      xpReward: 10,
      isPermanent: true,
      cooldownHours: 24,
      maxScansPerDay: 1,
    });

    expect(normalized.title).toBe("URI Gym");
    expect(normalized.type).toBe("permanent_location");
    expect(normalized.qrType).toBe("location_check_in");
    expect(normalized.xpReward).toBe(10);
    expect(normalized.cooldownHours).toBe(24);
  });

  it("defaults missing optional fields", () => {
    const normalized = normalizeCreateQrCodeInput({});

    expect(normalized.title).toBe("QR Code");
    expect(normalized.description).toBe("");
    expect(normalized.qrType).toBe("general");
    expect(normalized.xpReward).toBe(0);
    expect(normalized.isActive).toBe(true);
    expect(normalized.metadata).toEqual({});
    expect(normalized.expiresAt).toBeNull();
  });

  it("drops invalid partial code values instead of failing validation", () => {
    expect(normalizeOptionalCode("G")).toBeUndefined();
    expect(normalizeOptionalCode("1BAD")).toBeUndefined();
    expect(normalizeOptionalCode("GYM")).toBe("GYM");
    expect(
      createQrCodeSchema.parse({
        title: "Gym",
        type: "permanent_location",
        xpReward: 10,
        code: "G",
      }).code,
    ).toBeUndefined();
  });

  it("accepts quest_id null", () => {
    const normalized = normalizeCreateQrCodeInput({
      name: "Standalone QR",
      qr_type: "general",
      quest_id: null,
    });
    expect(normalized.questId).toBeUndefined();
  });
});

describe("createQrCodeSchema", () => {
  it("parses quest builder payload end-to-end", () => {
    const parsed = createQrCodeSchema.parse({
      name: "Quest QR Code",
      qr_type: "quest_completion",
      quest_id: "00000000-0000-4000-8000-000000000001",
      xp_reward: 50,
    });

    expect(parsed.title).toBe("Quest QR Code");
    expect(parsed.type).toBe("quest");
    expect(parsed.qrType).toBe("quest_completion");
  });
});

describe("updateQrCodeSchema", () => {
  it("allows partial isActive patch without overwriting other fields", () => {
    const parsed = updateQrCodeSchema.parse({ isActive: false });
    expect(parsed).toEqual({ isActive: false });
  });
});

describe("mapAdminQrTypeToLegacyType", () => {
  it("maps semantic qr types for scanner compatibility", () => {
    expect(mapAdminQrTypeToLegacyType("quest_completion")).toBe("quest");
    expect(mapAdminQrTypeToLegacyType("event_check_in")).toBe("event");
    expect(mapAdminQrTypeToLegacyType("location_check_in")).toBe("permanent_location");
  });
});

describe("normalizePartialQrCodeInput", () => {
  it("only includes provided fields", () => {
    expect(normalizePartialQrCodeInput({ isActive: false })).toEqual({ isActive: false });
  });
});
