import { adminQuestRequiresQrScan } from "@/lib/adminQuestQr";
import type { UserQuestBoardItem } from "@/lib/adminQuestTypes";
import type { GroupedMapLocation, MapQuestPin, MapQrPin } from "@/lib/mapLocationGroups";

export type LocationQuestCard =
  | { kind: "board"; item: UserQuestBoardItem; scanPath?: string | null }
  | { kind: "qr"; qr: MapQrPin };

type DedupCandidate = {
  key: string;
  title: string;
  score: number;
  card: LocationQuestCard;
};

export function normalizeQuestTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

export function getQuestDedupKey(input: {
  id?: string | null;
  adminQuestId?: string | null;
  qrCodeId?: string | null;
  title?: string | null;
  locationId?: string | null;
}): string {
  const adminId = input.adminQuestId?.trim();
  if (adminId) return `admin:${adminId}`;

  const questId = input.id?.trim();
  if (questId && !questId.startsWith("qr:")) return `admin:${questId}`;

  const qrId = input.qrCodeId?.trim();
  if (qrId) return `qr:${qrId}`;

  const title = input.title ? normalizeQuestTitle(input.title) : "";
  const loc = input.locationId?.trim() ?? "";
  if (title && loc) return `title:${loc}:${title}`;
  if (title) return `title:${title}`;

  return `unknown:${questId ?? qrId ?? "orphan"}`;
}

function scoreBoardItem(item: UserQuestBoardItem): number {
  let score = 100;
  if (item.progress.current > 0 || item.status === "active" || item.status === "ready") score += 12;
  if (item.canClaim) score += 8;
  if (item.requiresQr || item.completionMethod === "qr_scan") score += 6;
  if (item.description?.trim()) score += 4;
  if (item.xpReward > 0) score += 2;
  if (item.difficulty) score += 1;
  return score;
}

function scoreMapQuest(quest: MapQuestPin): number {
  let score = 60;
  if (quest.requiresQr || quest.completionMethod === "qr_scan") score += 6;
  if (quest.description?.trim()) score += 4;
  if (quest.xpReward > 0) score += 2;
  if (quest.difficulty) score += 1;
  return score;
}

function scoreQrPin(qr: MapQrPin): number {
  let score = 40;
  if (qr.description?.trim()) score += 2;
  if (qr.xpReward > 0) score += 1;
  return score;
}

function logDedupedDuplicate(key: string, keptTitle: string, droppedTitle: string): void {
  if (process.env.NODE_ENV === "production") return;
  console.info("[cq][realm-location] deduped duplicate quest", {
    key,
    kept: keptTitle,
    dropped: droppedTitle,
  });
}

function upsertCandidate(map: Map<string, DedupCandidate>, candidate: DedupCandidate): void {
  const existing = map.get(candidate.key);
  if (!existing) {
    map.set(candidate.key, candidate);
    return;
  }
  if (candidate.score > existing.score) {
    logDedupedDuplicate(candidate.key, candidate.title, existing.title);
    map.set(candidate.key, candidate);
    return;
  }
  logDedupedDuplicate(candidate.key, existing.title, candidate.title);
}

/** Merge map-pin quests, QR pins, and board quests into one deduped render list. */
export function mergeLocationQuestCards(args: {
  qrCodes?: MapQrPin[];
  mapQuests?: MapQuestPin[];
  boardQuests?: UserQuestBoardItem[];
  locationId?: string | null;
}): LocationQuestCard[] {
  const qrByAdminQuestId = new Map<string, MapQrPin>();
  for (const qr of args.qrCodes ?? []) {
    if (qr.adminQuestId) qrByAdminQuestId.set(qr.adminQuestId, qr);
  }

  const merged = new Map<string, DedupCandidate>();

  for (const item of args.boardQuests ?? []) {
    const linkedQr = qrByAdminQuestId.get(item.id);
    upsertCandidate(merged, {
      key: getQuestDedupKey({
        id: item.id,
        qrCodeId: item.qrCodeId ?? linkedQr?.id,
        title: item.name,
        locationId: item.locationId ?? args.locationId,
      }),
      title: item.name,
      score: scoreBoardItem(item),
      card: {
        kind: "board",
        item,
        scanPath: linkedQr?.scanPath ?? null,
      },
    });
  }

  for (const quest of args.mapQuests ?? []) {
    upsertCandidate(merged, {
      key: getQuestDedupKey({
        id: quest.id,
        qrCodeId: quest.qrCodeId,
        title: quest.name,
        locationId: args.locationId,
      }),
      title: quest.name,
      score: scoreMapQuest(quest),
      card: { kind: "board", item: mapQuestPinToBoardItem(quest) },
    });
  }

  for (const qr of args.qrCodes ?? []) {
    upsertCandidate(merged, {
      key: getQuestDedupKey({
        adminQuestId: qr.adminQuestId,
        id: qr.id,
        qrCodeId: qr.id,
        title: qr.name,
        locationId: args.locationId,
      }),
      title: qr.name,
      score: scoreQrPin(qr),
      card: { kind: "qr", qr },
    });
  }

  return Array.from(merged.values()).map((entry) => entry.card);
}

export function countUniqueLocationQuests(
  group: Pick<GroupedMapLocation, "qrCodes" | "quests">,
  locationId?: string | null,
): number {
  return mergeLocationQuestCards({
    qrCodes: group.qrCodes,
    mapQuests: group.quests,
    boardQuests: [],
    locationId,
  }).length;
}

function mapQuestPinToBoardItem(quest: MapQuestPin): UserQuestBoardItem {
  return {
    id: quest.id,
    source: "admin",
    name: quest.name,
    description: quest.description,
    xpReward: quest.xpReward,
    difficulty: (quest.difficulty as UserQuestBoardItem["difficulty"]) ?? "easy",
    questType: "location",
    icon: quest.icon,
    requiresQr: quest.requiresQr,
    completionMethod: (quest.completionMethod as UserQuestBoardItem["completionMethod"]) ?? "manual_log",
    locationName: null,
    locationId: null,
    locationLat: null,
    locationLng: null,
    status: "available",
    progress: { current: 0, max: 1, percent: 0 },
    startsAt: null,
    endsAt: quest.expiresAt,
    repeatType: "one_time",
    canClaim: !adminQuestRequiresQrScan({
      requires_qr: quest.requiresQr,
      completion_method: (quest.completionMethod ?? "manual_log") as UserQuestBoardItem["completionMethod"],
      quest_type: "location",
    }),
    qrCodeId: quest.qrCodeId ?? null,
  };
}