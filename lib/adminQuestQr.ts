import type { AdminQuestRow } from "@/lib/adminQuestTypes";

export type AdminQuestCompletionSnapshot = {
  status: string;
  completion_day: string | null;
  completion_method?: string | null;
};

/** True when the quest may only be completed by scanning its linked QR code. */
export function adminQuestRequiresQrScan(
  quest: Pick<AdminQuestRow, "requires_qr" | "completion_method" | "quest_type">,
): boolean {
  return Boolean(quest.requires_qr || quest.completion_method === "qr_scan" || quest.quest_type === "qr");
}

export function isVerifiedQrQuestCompletion(completion: AdminQuestCompletionSnapshot): boolean {
  return completion.status === "completed" && completion.completion_method === "qr_scan";
}

/** For QR-required quests, ignore manual/location completions when deriving status. */
export function verifiedQuestCompletions(
  quest: Pick<AdminQuestRow, "requires_qr" | "completion_method" | "quest_type">,
  completions: AdminQuestCompletionSnapshot[],
): AdminQuestCompletionSnapshot[] {
  if (!adminQuestRequiresQrScan(quest)) return completions;
  return completions.filter(isVerifiedQrQuestCompletion);
}
