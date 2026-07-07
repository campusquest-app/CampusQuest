import { describe, expect, it } from "vitest";
import { mergeActivityFeed } from "@/lib/activityFeed";
import { buildQrScanActivityPayload } from "@/lib/userActivityEventPayload";

describe("buildQrScanActivityPayload", () => {
  it("builds quest completion copy", () => {
    const payload = buildQrScanActivityPayload({
      questCompleted: { questId: "q1", questName: "Visit the AI Lab", xpReward: 25 },
      locationName: "AI Lab",
      qrTitle: "AI Lab QR",
      totalXpAwarded: 25,
      qrCodeId: "qr-1",
    });
    expect(payload.activity_type).toBe("quest_completed");
    expect(payload.title).toBe("Completed Visit the AI Lab");
    expect(payload.description).toContain("+25 XP");
  });

  it("builds location check-in copy", () => {
    const payload = buildQrScanActivityPayload({
      questCompleted: null,
      locationName: "AI Lab",
      qrTitle: "AI Lab QR",
      totalXpAwarded: 25,
      qrCodeId: "qr-1",
    });
    expect(payload.activity_type).toBe("qr_check_in");
    expect(payload.title).toBe("Checked in at AI Lab");
  });
});

describe("mergeActivityFeed", () => {
  it("prefers server QR events over duplicate local logs", () => {
    const items = mergeActivityFeed({
      localLogs: [
        {
          id: "local-1",
          characterId: "u1",
          activityId: "gym",
          createdAt: Date.now(),
          feedType: "qr_check_in",
          title: "Checked in at AI Lab",
          qrCodeId: "qr-1",
          xpEarned: 25,
        },
      ],
      serverEvents: [
        {
          id: "srv-1",
          activity_type: "qr_check_in",
          title: "Checked in at AI Lab",
          description: "+25 XP earned",
          xp_awarded: 25,
          qr_code_id: "qr-1",
          quest_id: null,
          created_at: new Date().toISOString(),
        },
      ],
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("srv-srv-1");
  });
});
