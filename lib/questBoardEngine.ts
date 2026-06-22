import type { Character } from "./types";
import { getDailyQuests } from "./quests";
import { getFriends } from "./friendsStore";
import { getClassTitle } from "./characterClasses";
import { getFeedByAuthorId } from "./feedStore";
import { getActivityLogs, getLogsByActivity } from "./store";
import {
  CATEGORY_META,
  QUEST_BOARD_CATALOG,
  QUEST_CHAINS,
  getQuestBoardDef,
  getQuestChain,
  statToDailyTemplate,
  type QuestBoardDef,
  type QuestCategory,
  type QuestFilter,
} from "./questBoardCatalog";

export type QuestBoardStatus = "available" | "active" | "ready" | "completed" | "locked";

export type QuestBoardView = {
  def: QuestBoardDef;
  status: QuestBoardStatus;
  accepted: boolean;
  progress: { current: number; max: number; percent: number };
  claimedAt: string | null;
  timeRemainingLabel: string | null;
  chainLabel: string | null;
};

export type QuestProgressContext = {
  character: Character;
  logsByActivityToday: Record<string, number>;
  activityLogCount: number;
  friendsCount: number;
  quadPostsToday: number;
  quadPostsTotal: number;
  trainingPlayedToday: boolean;
  eventsAttended: number;
  qrScanCount: number;
  categoriesClaimed: number;
};

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isQuadPostToday(note: { createdAt: number }): boolean {
  const day = todayString();
  const d = new Date(note.createdAt);
  const noteDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return noteDay === day;
}

export function buildQuestProgressContext(character: Character): QuestProgressContext {
  const logsByActivityToday = getLogsByActivity(character.id);
  const logs = getActivityLogs(character.id);
  const posts = getFeedByAuthorId(character.id);
  const training = character.miniGameTraining;
  const today = todayString();

  const categoriesClaimed = countCategoriesWithClaims(character);

  return {
    character,
    logsByActivityToday,
    activityLogCount: logs.length,
    friendsCount: getFriends(character.id).length,
    quadPostsToday: posts.filter(isQuadPostToday).length,
    quadPostsTotal: posts.length,
    trainingPlayedToday: training?.day === today && (training.playsUsed ?? 0) > 0,
    eventsAttended: character.eventsAttendedCount ?? 0,
    qrScanCount: Object.keys(character.qrMilestones ?? {}).length,
    categoriesClaimed,
  };
}

function countCategoriesWithClaims(character: Character): number {
  const claims = character.questBoardClaims ?? {};
  const claimedCategories = new Set<QuestCategory>();
  for (const id of Object.keys(claims)) {
    const def = getQuestBoardDef(id);
    if (def && def.category !== "legendary") claimedCategories.add(def.category);
  }
  for (const id of character.completedSpecialQuests ?? []) {
    const campus = QUEST_BOARD_CATALOG.find((q) => q.legacySpecialQuestId === id);
    if (campus) claimedCategories.add("campus");
  }
  return claimedCategories.size;
}

export function getDailyBoardQuestIds(): string[] {
  const dailyQuests = getDailyQuests();
  const templates = new Set(dailyQuests.map((q) => statToDailyTemplate(q.stat)));
  return QUEST_BOARD_CATALOG.filter((q) => q.dailyTemplateKey && templates.has(q.dailyTemplateKey)).map((q) => q.id);
}

export function getVisibleQuestDefs(): QuestBoardDef[] {
  const dailyIds = new Set(getDailyBoardQuestIds());
  return QUEST_BOARD_CATALOG.filter((q) => !q.dailyTemplateKey || dailyIds.has(q.id));
}

function isChainStepUnlocked(def: QuestBoardDef, character: Character): boolean {
  if (!def.chainId || def.chainStep == null) return true;
  const progress = character.questChainProgress?.[def.chainId] ?? -1;
  return def.chainStep <= progress + 1;
}

function isClaimed(def: QuestBoardDef, character: Character): boolean {
  if (character.questBoardClaims?.[def.id]) return true;
  if (def.legacySpecialQuestId && (character.completedSpecialQuests ?? []).includes(def.legacySpecialQuestId)) {
    return true;
  }
  return false;
}

export function getQuestProgress(def: QuestBoardDef, ctx: QuestProgressContext): { current: number; max: number; percent: number } {
  const max = def.progressTarget;
  let current = 0;
  const c = ctx.character;

  switch (def.progressKind) {
    case "activity_today":
    case "activity_total": {
      const map = def.progressKind === "activity_today" ? ctx.logsByActivityToday : countAllActivities(c.id);
      current = (def.activityIds ?? []).reduce((sum, id) => sum + (map[id] ?? 0), 0);
      break;
    }
    case "friends":
      current = ctx.friendsCount;
      break;
    case "guild":
      current = (c.guildIds ?? []).length > 0 ? 1 : 0;
      break;
    case "quad_posts_today":
      current = ctx.quadPostsToday;
      break;
    case "quad_posts_total":
      current = ctx.quadPostsTotal;
      break;
    case "training_today":
      current = ctx.trainingPlayedToday ? 1 : 0;
      break;
    case "events":
      current = ctx.eventsAttended;
      break;
    case "level":
      current = c.level;
      break;
    case "qr_scans":
      current = ctx.qrScanCount;
      break;
    case "categories_complete":
      current = ctx.categoriesClaimed;
      break;
    case "special_proof":
      current =
        def.legacySpecialQuestId && (c.completedSpecialQuests ?? []).includes(def.legacySpecialQuestId) ? 1 : 0;
      break;
    case "chain_step":
      current = 0;
      break;
    default:
      current = 0;
  }

  const clamped = Math.min(max, Math.max(0, current));
  return { current: clamped, max, percent: max > 0 ? Math.round((clamped / max) * 100) : 0 };
}

function countAllActivities(characterId: string): Record<string, number> {
  const count: Record<string, number> = {};
  for (const log of getActivityLogs(characterId)) {
    count[log.activityId] = (count[log.activityId] ?? 0) + 1;
  }
  return count;
}

function getTimeRemainingLabel(def: QuestBoardDef): string | null {
  if (!def.expiresEndOfDay) return null;
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const ms = end.getTime() - now.getTime();
  if (ms <= 0) return "Expires soon";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m left today`;
}

export function getQuestBoardViews(character: Character): QuestBoardView[] {
  const ctx = buildQuestProgressContext(character);
  const defs = getVisibleQuestDefs();

  return defs.map((def) => {
    const claimed = isClaimed(def, character);
    const progress = getQuestProgress(def, ctx);
    const chainUnlocked = isChainStepUnlocked(def, character);
    const accepted = chainUnlocked && !claimed;

    let status: QuestBoardStatus = "available";
    if (claimed) status = "completed";
    else if (!chainUnlocked) status = "locked";
    else if (progress.current >= progress.max) status = "ready";
    else if (progress.current > 0) status = "active";

    let chainLabel: string | null = null;
    if (def.chainId != null && def.chainStep != null) {
      const chain = getQuestChain(def.chainId);
      if (chain) chainLabel = `${chain.name} · Step ${def.chainStep + 1} of ${chain.stepIds.length}`;
    }

    return {
      def,
      status,
      accepted,
      progress,
      claimedAt: character.questBoardClaims?.[def.id] ?? null,
      timeRemainingLabel: def.expiresEndOfDay ? getTimeRemainingLabel(def) : null,
      chainLabel,
    };
  });
}

export function filterQuestViews(views: QuestBoardView[], filter: QuestFilter): QuestBoardView[] {
  if (filter === "all") return views;
  if (filter === "active") return views.filter((v) => v.status === "active" || v.status === "ready");
  if (filter === "completed") return views.filter((v) => v.status === "completed");
  return views.filter((v) => v.def.category === filter);
}

export function getActiveQuestViews(character: Character): QuestBoardView[] {
  return getQuestBoardViews(character).filter((v) => v.status === "active" || v.status === "ready");
}

export function countCompletedQuests(character: Character): number {
  const claims = character.questBoardClaims ?? {};
  const legacy = new Set(character.completedSpecialQuests ?? []);
  let count = Object.keys(claims).length;
  for (const def of QUEST_BOARD_CATALOG) {
    if (def.legacySpecialQuestId && legacy.has(def.legacySpecialQuestId) && !claims[def.id]) {
      count += 1;
    }
  }
  return count;
}

export function getAdventurerLabel(character: Character): string {
  const title = getClassTitle(character.classId);
  return title ? `Level ${character.level} ${title}` : `Level ${character.level} Adventurer`;
}

export { CATEGORY_META, QUEST_CHAINS };
