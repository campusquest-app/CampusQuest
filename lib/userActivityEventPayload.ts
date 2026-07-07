import type { ActivityFeedType } from "@/lib/activityFeed";

export type QrScanActivityPayload = {
  activity_type: Extract<ActivityFeedType, "qr_check_in" | "quest_completed">;
  title: string;
  description: string;
  xp_awarded: number;
  quest_id: string | null;
  qr_code_id: string;
  location_name: string;
  metadata: Record<string, unknown>;
};

export function buildQrScanActivityPayload(input: {
  questCompleted: { questId: string; questName: string; xpReward: number } | null;
  locationName: string | null;
  qrTitle: string;
  totalXpAwarded: number;
  qrCodeId: string;
  questId?: string | null;
}): QrScanActivityPayload {
  const place = input.locationName?.trim() || input.qrTitle.trim() || "Campus Location";
  const xp = Math.max(0, input.totalXpAwarded);

  if (input.questCompleted) {
    const questName = input.questCompleted.questName.trim() || input.qrTitle;
    return {
      activity_type: "quest_completed",
      title: `Completed ${questName}`,
      description: xp > 0 ? `+${xp} XP earned from ${place}` : `Quest completed at ${place}`,
      xp_awarded: xp,
      quest_id: input.questCompleted.questId,
      qr_code_id: input.qrCodeId,
      location_name: place,
      metadata: {
        qr_title: input.qrTitle,
        quest_title: questName,
        location_name: place,
      },
    };
  }

  return {
    activity_type: "qr_check_in",
    title: `Checked in at ${place}`,
    description: xp > 0 ? `+${xp} XP earned` : `Scanned ${input.qrTitle}`,
    xp_awarded: xp,
    quest_id: input.questId ?? null,
    qr_code_id: input.qrCodeId,
    location_name: place,
    metadata: {
      qr_title: input.qrTitle,
      location_name: place,
    },
  };
}
