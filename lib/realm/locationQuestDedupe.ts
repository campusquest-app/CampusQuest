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
  questId?: string | null;
  eventId?: string | null;
  qrCodeId?: string | null;
  title?: string | null;
  locationId?: string | null;
  xpReward?: number | null;
}): string {
  const questId = (input.questId ?? input.id)?.trim();
  if (questId && !questId.startsWith("qr:")) return `admin:${questId}`;

  const adminId = input.adminQuestId?.trim();
  if (adminId) return `admin:${adminId}`;

  const eventId = input.eventId?.trim();
  if (eventId) return `event:${eventId}`;

  const qrId = input.qrCodeId?.trim();
  if (qrId) return `qr:${qrId}`;

  const title = input.title ? normalizeQuestTitle(input.title) : "";
  const loc = input.locationId?.trim() ?? "";
  const xp = Number(input.xpReward ?? 0);
  if (title && loc) return `title:${loc}:${title}:${xp}`;
  if (title) return `title:${title}:${xp}`;

  return `unknown:${questId ?? qrId ?? "orphan"}`;
}

function cardHasQrMetadata(card: LocationQuestCard): boolean {
  if (card.kind === "qr") return true;
  return Boolean(
    card.scanPath ||
      card.item.requiresQr ||
      card.item.completionMethod === "qr_scan" ||
      card.item.qrCodeId,
  );
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

function enrichLocationQuestCard(kept: LocationQuestCard, other: LocationQuestCard): LocationQuestCard {
  if (kept.kind === "qr" && other.kind === "board") {
    const scanPath = kept.qr.scanPath;
    const item = { ...other.item };
    item.requiresQr =
      item.requiresQr || other.item.completionMethod === "qr_scan" || Boolean(other.item.qrCodeId);
    if (!item.qrCodeId) item.qrCodeId = kept.qr.id;
    if (!item.description?.trim() && other.item.description?.trim()) item.description = other.item.description;
    return { kind: "board", item, scanPath };
  }

  if (kept.kind === "board" && other.kind === "qr") {
    const item = { ...kept.item };
    item.requiresQr = item.requiresQr || kept.item.completionMethod === "qr_scan" || Boolean(kept.item.qrCodeId);
    if (!item.qrCodeId) item.qrCodeId = other.qr.id;
    if (!item.description?.trim() && other.qr.description?.trim()) item.description = other.qr.description;
    const scanPath = kept.scanPath ?? other.qr.scanPath;
    return { kind: "board", item, scanPath };
  }

  if (kept.kind === "board" && other.kind === "board") {
    const primary = scoreBoardItem(kept.item) >= scoreBoardItem(other.item) ? kept.item : other.item;
    const secondary = primary === kept.item ? other.item : kept.item;
    const item = { ...primary };
    if (!item.description?.trim() && secondary.description?.trim()) item.description = secondary.description;
    item.requiresQr = kept.item.requiresQr || other.item.requiresQr;
    if (!item.qrCodeId) item.qrCodeId = kept.item.qrCodeId ?? other.item.qrCodeId;
    const scanPath = kept.scanPath ?? other.scanPath ?? null;
    return { kind: "board", item, scanPath };
  }

  return kept;
}

function pickPrimaryCandidate(a: DedupCandidate, b: DedupCandidate): DedupCandidate {
  const aQr = cardHasQrMetadata(a.card);
  const bQr = cardHasQrMetadata(b.card);
  if (aQr && !bQr) return a;
  if (bQr && !aQr) return b;
  if (a.score !== b.score) return a.score > b.score ? a : b;
  if (a.card.kind === "board" && b.card.kind === "qr") return a;
  if (b.card.kind === "board" && a.card.kind === "qr") return b;
  return a;
}

function mergeDedupCandidates(existing: DedupCandidate, incoming: DedupCandidate): DedupCandidate {
  const primary = pickPrimaryCandidate(existing, incoming);
  const secondary = primary === existing ? incoming : existing;
  const card = enrichLocationQuestCard(primary.card, secondary.card);
  return {
    key: primary.key,
    title: primary.title,
    score: Math.max(existing.score, incoming.score),
    card,
  };
}

function upsertCandidate(map: Map<string, DedupCandidate>, candidate: DedupCandidate): void {
  const existing = map.get(candidate.key);
  if (!existing) {
    map.set(candidate.key, candidate);
    return;
  }
  const merged = mergeDedupCandidates(existing, candidate);
  logDedupedDuplicate(candidate.key, merged.title, merged.title === existing.title ? candidate.title : existing.title);
  map.set(candidate.key, merged);
}

/** Merge map-pin quests, QR pins, and board quests into one deduped render list. */
export function mergeLocationQuestCards(args: {
  qrCodes?: MapQrPin[];
  mapQuests?: MapQuestPin[];
  boardQuests?: UserQuestBoardItem[];
  locationId?: string | null;
}): LocationQuestCard[] {
  const qrByAdminQuestId = new Map<string, MapQrPin>();
  const qrById = new Map<string, MapQrPin>();
  for (const qr of args.qrCodes ?? []) {
    qrById.set(qr.id, qr);
    if (qr.adminQuestId) qrByAdminQuestId.set(qr.adminQuestId, qr);
  }

  const merged = new Map<string, DedupCandidate>();

  for (const item of args.boardQuests ?? []) {
    const linkedQr =
      (item.qrCodeId ? qrById.get(item.qrCodeId) : null) ?? qrByAdminQuestId.get(item.id) ?? null;
    upsertCandidate(merged, {
      key: getQuestDedupKey({
        questId: item.id,
        qrCodeId: item.qrCodeId ?? linkedQr?.id,
        title: item.name,
        locationId: item.locationId ?? args.locationId,
        xpReward: item.xpReward,
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
    const linkedQr =
      (quest.qrCodeId ? qrById.get(quest.qrCodeId) : null) ?? qrByAdminQuestId.get(quest.id) ?? null;
    upsertCandidate(merged, {
      key: getQuestDedupKey({
        questId: quest.id,
        qrCodeId: quest.qrCodeId ?? linkedQr?.id,
        title: quest.name,
        locationId: args.locationId,
        xpReward: quest.xpReward,
      }),
      title: quest.name,
      score: scoreMapQuest(quest),
      card: {
        kind: "board",
        item: mapQuestPinToBoardItem(quest),
        scanPath: linkedQr?.scanPath ?? null,
      },
    });
  }

  for (const qr of args.qrCodes ?? []) {
    upsertCandidate(merged, {
      key: getQuestDedupKey({
        adminQuestId: qr.adminQuestId,
        questId: qr.adminQuestId ?? undefined,
        qrCodeId: qr.id,
        title: qr.name,
        locationId: args.locationId,
        xpReward: qr.xpReward,
      }),
      title: qr.name,
      score: scoreQrPin(qr),
      card: { kind: "qr", qr },
    });
  }

  return Array.from(merged.values()).map((entry) => entry.card);
}

export function hasQrQuestCard(card: LocationQuestCard): boolean {
  return cardHasQrMetadata(card);
}

export function getQuestCardTitle(card: LocationQuestCard): string {
  return card.kind === "qr" ? card.qr.name : card.item.name;
}

export function getQuestCardXp(card: LocationQuestCard): number {
  return card.kind === "qr" ? card.qr.xpReward : card.item.xpReward;
}

export function getQuestCardKey(card: LocationQuestCard): string {
  if (card.kind === "qr") return `qr-${card.qr.id}`;
  return `quest-${card.item.id}`;
}

export function getQuestCardScanPath(card: LocationQuestCard): string | null {
  if (card.kind === "qr") return card.qr.scanPath;
  return card.scanPath ?? null;
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