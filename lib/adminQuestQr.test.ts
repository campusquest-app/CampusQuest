import { describe, expect, it } from "vitest";
import {
  adminQuestRequiresQrScan,
  isVerifiedQrQuestCompletion,
  verifiedQuestCompletions,
} from "@/lib/adminQuestQr";
import { deriveAdminQuestStatus } from "@/lib/server/adminQuests";
import type { AdminQuestRow } from "@/lib/adminQuestTypes";

const qrQuest = {
  id: "quest-1",
  requires_qr: true,
  completion_method: "qr_scan",
  quest_type: "qr",
  visibility_status: "active",
  deleted_at: null,
  starts_at: null,
  ends_at: null,
  repeat_limit: "once_per_user",
} as AdminQuestRow;

describe("adminQuestRequiresQrScan", () => {
  it("is true when requires_qr is set", () => {
    expect(
      adminQuestRequiresQrScan({
        requires_qr: true,
        completion_method: "manual_log",
        quest_type: "location",
      }),
    ).toBe(true);
  });

  it("is false for manual location quests", () => {
    expect(
      adminQuestRequiresQrScan({
        requires_qr: false,
        completion_method: "location_checkin",
        quest_type: "location",
      }),
    ).toBe(false);
  });
});

describe("verifiedQuestCompletions", () => {
  it("ignores manual completions for QR-required quests", () => {
    const verified = verifiedQuestCompletions(qrQuest, [
      { status: "completed", completion_day: null, completion_method: "manual_log" },
      { status: "completed", completion_day: null, completion_method: "qr_scan" },
    ]);
    expect(verified).toHaveLength(1);
    expect(verified[0].completion_method).toBe("qr_scan");
  });
});

describe("deriveAdminQuestStatus for QR quests", () => {
  it("stays available when only a manual completion exists", () => {
    expect(
      deriveAdminQuestStatus(qrQuest, [
        { status: "completed", completion_day: null, completion_method: "manual_log" },
      ]),
    ).toBe("available");
  });

  it("is completed only after a verified QR scan completion", () => {
    expect(
      deriveAdminQuestStatus(qrQuest, [
        { status: "completed", completion_day: null, completion_method: "qr_scan" },
      ]),
    ).toBe("completed");
  });
});

describe("isVerifiedQrQuestCompletion", () => {
  it("requires completed status and qr_scan method", () => {
    expect(isVerifiedQrQuestCompletion({ status: "completed", completion_day: null, completion_method: "qr_scan" })).toBe(
      true,
    );
    expect(
      isVerifiedQrQuestCompletion({ status: "completed", completion_day: null, completion_method: "location_checkin" }),
    ).toBe(false);
  });
});
