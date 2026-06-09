"use client";

import type { FieldNote, RamMark, FieldNoteSerialized, QuadComment, QuadPostVisibility } from "./types";
import { serializeDiceBearAvatar } from "./dicebearAvatar";
import { getFriends } from "./friendsStore";
import { addXpToCharacter, bumpQuadAssistForAuthor, getGuildIdsForCharacter } from "./store";
import { recordGuildWeeklyRace } from "./guildWeeklyRace";
import { FIELD_NOTE_MAX_CHARS, RAMMARK_MAX_LENGTH, RAMMARK_MAX_PER_POST, QUAD_COMMENT_MAX_CHARS } from "./types";

let feed: FieldNote[] = [];
let comments: QuadComment[] = [];
/** Latest server-backed posts (Quad tab fetch); enables reactions on persisted notes. */
let remoteQuadPostsCache: FieldNote[] = [];

export function setRemoteQuadPostsCache(posts: FieldNote[]): void {
  remoteQuadPostsCache = posts.map(migrateNote);
}

/** Merge server-backed posts into cache without dropping entries outside the fetch window. */
export function mergeRemoteQuadPostsCache(posts: FieldNote[]): void {
  const byId = new Map(remoteQuadPostsCache.map((n) => [n.id, n]));
  for (const serverPost of posts.map(migrateNote)) {
    const existing = byId.get(serverPost.id);
    if (!existing) {
      byId.set(serverPost.id, serverPost);
      continue;
    }
    existing.nodCount = serverPost.nodCount;
    existing.hypeCount = serverPost.hypeCount;
    existing.vouchCount = serverPost.vouchCount;
    existing.nodByUserIds = new Set(serverPost.nodByUserIds);
    existing.hypeByUserIds = new Set(serverPost.hypeByUserIds ?? serverPost.vouchByUserIds);
    existing.vouchByUserIds = existing.hypeByUserIds;
    existing.isPersisted = serverPost.isPersisted ?? true;
  }
  remoteQuadPostsCache = Array.from(byId.values());
}

function forEachNoteCopy(noteId: string, fn: (note: FieldNote) => void): void {
  const seen = new Set<FieldNote>();
  const remote = remoteQuadPostsCache.find((n) => n.id === noteId);
  if (remote) {
    seen.add(remote);
    fn(remote);
  }
  const local = feed.find((n) => n.id === noteId);
  if (local && !seen.has(local)) {
    seen.add(local);
    fn(local);
  }
  const seed = SEED_FIELD_NOTES.find((n) => n.id === noteId);
  if (seed && !feed.some((n) => n.id === noteId)) {
    const copy = cloneFieldNote(seed);
    feed.push(copy);
    fn(copy);
  }
}

export function prependRemoteQuadPost(note: FieldNote): void {
  remoteQuadPostsCache = [note, ...remoteQuadPostsCache.filter((n) => n.id !== note.id)];
}

export function replaceRemoteQuadPost(note: FieldNote): void {
  const migrated = migrateNote(note);
  const mergeOne = (list: FieldNote[]): FieldNote[] =>
    list.map((n) => {
      if (n.id !== migrated.id) return n;
      return {
        ...migrated,
        nodByUserIds: n.nodByUserIds,
        hypeByUserIds: n.hypeByUserIds ?? n.vouchByUserIds,
        vouchByUserIds: n.vouchByUserIds,
        verifyByUserIds: n.verifyByUserIds ?? new Set(),
        assistByUserIds: n.assistByUserIds ?? new Set(),
        isPersisted: true,
      };
    });
  remoteQuadPostsCache = mergeOne(remoteQuadPostsCache);
  feed = mergeOne(feed);
}

export function removeRemoteQuadPost(postId: string): void {
  remoteQuadPostsCache = remoteQuadPostsCache.filter((n) => n.id !== postId);
  feed = feed.filter((n) => n.id !== postId);
}

/** Merge posts into the mutation cache (e.g. Profile “my posts” fetch). */
export function mergeRemoteQuadPostsForMutations(posts: FieldNote[]): void {
  mergeRemoteQuadPostsCache(posts);
}

const BASE_TS = Date.now();

function makeFeedPersonaAvatar(seedKey: string): string {
  return serializeDiceBearAvatar({
    v: 2,
    style: "lorelei",
    seed: `cq-feed-${seedKey}`,
    options: { backgroundColor: ["041e42"], backgroundType: ["gradientLinear"] },
  });
}

/**
 * Same-origin images in /public/quad-feed — avoids broken embeds on mobile/Safari where
 * third-party CDNs (e.g. Unsplash) can fail hotlink/referrer checks.
 */
const SEED_POST_IMAGES = {
  /** Women's basketball — hosted locally; source photo Rhode Island Current (Z915188, Feb 2024). */
  womensBasketball: "/quad-feed/womens-basketball.jpg",
  /** Keaney-style training floor — weight room (user-provided asset). */
  gym: "/quad-feed/gym.png",
  /** URI Memorial Union entrance (user-provided asset). */
  memorialUnion: "/quad-feed/memorial-union.png",
  running: "/quad-feed/running.jpg",
  groupStudy: "/quad-feed/group-study.jpg",
  careerFair: "/quad-feed/career.jpg",
  raceCrowd: "/quad-feed/ram-run.png",
  housingGroundbreaking: "/quad-feed/housing-groundbreaking.png",
  careerFairTwo: "/quad-feed/career-fair-2.png",
  concert: "/quad-feed/concert.jpg",
  guitar: "/quad-feed/guitar.jpg",
} as const;

function seedNote(
  authorId: string,
  authorName: string,
  authorUsername: string,
  authorAvatar: string,
  body: string,
  ramMarks: { tag: string }[],
  hoursAgo: number,
  nodCount = 0,
  hypeSeed = 0,
  authorStreakDays = 0,
  proofUrl?: string
): FieldNote {
  const id = `fn-seed-${authorId}`;
  const ramMarksWithIds: RamMark[] = ramMarks.map((r) => ({ id: `rm-${id}-${r.tag}`, tag: r.tag.toLowerCase() }));
  return {
    id,
    authorId,
    authorName,
    authorUsername,
    authorAvatar,
    body,
    ramMarks: ramMarksWithIds,
    nodCount,
    vouchCount: hypeSeed,
    nodByUserIds: new Set(),
    vouchByUserIds: new Set(),
    hypeCount: hypeSeed,
    verifyCount: Math.min(3, Math.floor(hypeSeed / 2)),
    assistCount: Math.min(4, Math.floor(hypeSeed / 3)),
    hypeByUserIds: new Set(),
    verifyByUserIds: new Set(),
    assistByUserIds: new Set(),
    createdAt: BASE_TS - hoursAgo * 60 * 60 * 1000,
    visibility: "public",
    authorStreakDays: authorStreakDays || (hypeSeed > 2 ? 7 : 3),
    ...(proofUrl ? { proofUrl } : {}),
  };
}

const SEED_FIELD_NOTES: FieldNote[] = [
  seedNote(
    "seed-1",
    "Jordan Kim",
    "jordan_kim",
    makeFeedPersonaAvatar("alex"),
    "Went to the women's basketball game last night — the energy in the arena was unreal. URI played tough, the crowd was loud, and I left already counting down to the next home game. What a night. #wbb #ramnation #uri",
    [{ tag: "wbb" }, { tag: "ramnation" }, { tag: "uri" }],
    1,
    3,
    8,
    undefined,
    SEED_POST_IMAGES.womensBasketball
  ),
  // New example: student at groundbreaking for new housing
  seedNote(
    "seed-1-groundbreaking",
    "Taylor Brooks",
    "taylor_brooks",
    "🏗️",
    "Huge day on campus 🏗️ Just got back from the groundbreaking for the new student housing building and it already feels like the future of URI. Hard hats, shovels, and a lot of excitement about more room for Rams to live right in the heart of campus. Can’t wait to say “I was here when it all started.” 🐏💙",
    [{ tag: "newhousing" }, { tag: "groundbreaking" }],
    2,
    4,
    6,
    0,
    SEED_POST_IMAGES.housingGroundbreaking
  ),
  seedNote(
    "seed-2",
    "Alex Rivera",
    "alex_rivera",
    makeFeedPersonaAvatar("sam"),
    "Morning lift at Keaney Gym — new PR on bench! Nothing like URI's home court energy. #gym #ramnation",
    [{ tag: "gym" }, { tag: "ramnation" }],
    3,
    5,
    12,
    undefined,
    SEED_POST_IMAGES.gym
  ),
  seedNote(
    "seed-3",
    "Casey Lee",
    "casey_lee",
    makeFeedPersonaAvatar("jordan"),
    "Coffee + flashcards at the union. Midterms are coming but we're ready. #study #coffee",
    [{ tag: "study" }, { tag: "coffee" }],
    5,
    2,
    0,
    undefined,
    SEED_POST_IMAGES.memorialUnion
  ),
  seedNote(
    "seed-4",
    "Riley Morgan",
    "riley_morgan",
    makeFeedPersonaAvatar("taylor"),
    "5K run around campus before class. Nothing like fresh air to wake you up. #running #campus",
    [{ tag: "running" }, { tag: "campus" }],
    8,
    4,
    5,
    undefined,
    SEED_POST_IMAGES.running
  ),
  seedNote(
    "seed-5",
    "Quinn Taylor",
    "quinn_taylor",
    makeFeedPersonaAvatar("riley"),
    "Group study for orgo in the science building. Shoutout to the squad for explaining mechanisms. #groupstudy #orgo",
    [{ tag: "groupstudy" }, { tag: "orgo" }],
    12,
    6,
    14,
    undefined,
    SEED_POST_IMAGES.groupStudy
  ),
  seedNote("seed-6", "Avery Jones", "avery_jones", "🎯", "Deep focus block: 90 minutes no phone. Finished my essay draft. #focus #productivity", [{ tag: "focus" }, { tag: "productivity" }], 18, 2, 21),
  seedNote(
    "seed-7",
    "Morgan Blake",
    "morgan_blake",
    makeFeedPersonaAvatar("casey"),
    "Just wrapped up an incredible afternoon at the URI Career Fair 💼✨ Talked with a bunch of employers, got feedback on my resume, and even spotted a couple of dream internships I’m going to apply for tonight. It was so cool seeing how many paths are open to Rams if we put ourselves out there. #careerfair #internships",
    [{ tag: "careerfair" }, { tag: "internships" }],
    6,
    10,
    6,
    0,
    SEED_POST_IMAGES.careerFairTwo
  ),
  seedNote(
    "seed-8",
    "Sam Chen",
    "sam_chen",
    makeFeedPersonaAvatar("drew"),
    "Ram Run event was a blast. 200+ people showed up. URI spirit is real. #ramrun #uri",
    [{ tag: "ramrun" }, { tag: "uri" }],
    36,
    12,
    30,
    undefined,
    SEED_POST_IMAGES.raceCrowd
  ),
  seedNote(
    "seed-9",
    "Jamie Foster",
    "jamie_foster",
    makeFeedPersonaAvatar("morgan"),
    "Club meeting tonight — we're planning the spring concert. So much to do but the team is amazing. #clublife #campus",
    [{ tag: "clublife" }, { tag: "campus" }],
    48,
    1,
    2,
    undefined,
    SEED_POST_IMAGES.concert
  ),
  seedNote(
    "seed-10",
    "Drew Patel",
    "drew_patel",
    makeFeedPersonaAvatar("quinn"),
    "Practiced for the open mic at the pub. Nerves are real but so is the excitement. #music #campuslife",
    [{ tag: "music" }, { tag: "campuslife" }],
    60,
    7,
    6,
    undefined,
    SEED_POST_IMAGES.guitar
  ),
];

function migrateNote(n: FieldNote): FieldNote {
  const any = n as FieldNote & { hypeByUserIds?: Set<string> };
  if (!any.hypeByUserIds) {
    any.hypeByUserIds = new Set(n.vouchByUserIds);
    any.hypeCount = n.vouchCount;
    any.verifyByUserIds = new Set();
    any.verifyCount = 0;
    any.assistByUserIds = new Set();
    any.assistCount = 0;
  }
  return any;
}

function cloneFieldNote(n: FieldNote): FieldNote {
  const reactionBaseline = {
    nod: n.nodCount,
    hype: n.hypeCount,
    verify: n.verifyCount,
    assist: n.assistCount,
  };
  return {
    ...n,
    reactionBaseline,
    ramMarks: n.ramMarks.map((r) => ({ ...r })),
    nodByUserIds: new Set(n.nodByUserIds),
    vouchByUserIds: new Set(n.vouchByUserIds),
    hypeByUserIds: new Set(n.hypeByUserIds ?? n.vouchByUserIds),
    verifyByUserIds: new Set(n.verifyByUserIds),
    assistByUserIds: new Set(n.assistByUserIds),
  };
}

/** Clone feed notes so React re-renders after in-place reaction mutations. */
export function cloneFeedNotesForDisplay(notes: FieldNote[]): FieldNote[] {
  return notes.map(cloneFieldNote);
}

function syncNodCount(note: FieldNote) {
  if (note.isPersisted) return;
  const b = note.reactionBaseline;
  note.nodCount = b ? b.nod + note.nodByUserIds.size : note.nodByUserIds.size;
}

function syncHypeCount(note: FieldNote) {
  if (note.isPersisted) return;
  const b = note.reactionBaseline;
  note.hypeCount = b ? b.hype + note.hypeByUserIds.size : note.hypeByUserIds.size;
  note.vouchByUserIds = note.hypeByUserIds;
  note.vouchCount = note.hypeCount;
}

function syncVerifyCount(note: FieldNote) {
  const b = note.reactionBaseline;
  note.verifyCount = b ? b.verify + note.verifyByUserIds.size : note.verifyByUserIds.size;
}

function syncAssistCount(note: FieldNote) {
  const b = note.reactionBaseline;
  note.assistCount = b ? b.assist + note.assistByUserIds.size : note.assistByUserIds.size;
}

/**
 * User posts live in `feed`. Seed posts are merged at read time from `SEED_FIELD_NOTES` and
 * are not in `feed` until someone reacts — so we clone the seed into `feed` on first mutation.
 */
export function getNoteForReaction(noteId: string): FieldNote | null {
  return getNoteForMutation(noteId);
}

function getNoteForMutation(noteId: string): FieldNote | null {
  const fromRemote = remoteQuadPostsCache.find((n) => n.id === noteId);
  if (fromRemote) return fromRemote;
  const existing = feed.find((n) => n.id === noteId);
  if (existing) return existing;
  const seed = SEED_FIELD_NOTES.find((n) => n.id === noteId);
  if (!seed) return null;
  const copy = cloneFieldNote(seed);
  feed.push(copy);
  return copy;
}

export function normalizeRamMarkTag(tag: string): string {
  return tag
    .replace(/^#+\s*/, "")
    .trim()
    .slice(0, RAMMARK_MAX_LENGTH)
    .toLowerCase();
}

export function parseRamMarksFromText(text: string): RamMark[] {
  const seen = new Set<string>();
  const re = /#([\w]{1,15})/gi;
  const matches = text.match(re) ?? [];
  const list: RamMark[] = [];
  for (const m of matches) {
    const tag = normalizeRamMarkTag(m);
    if (tag && !seen.has(tag) && list.length < RAMMARK_MAX_PER_POST) {
      seen.add(tag);
      list.push({ id: `rm-${Date.now()}-${tag}`, tag });
    }
  }
  return list;
}

export type QuadFeedType = "public" | "friends";

export function getFeed(viewerId: string | undefined, feedType: QuadFeedType): FieldNote[] {
  if (viewerId == null) return [];
  const byId = new Map<string, FieldNote>();
  const remoteForMerge = remoteQuadPostsCache.map(migrateNote);

  const addNote = (note: FieldNote) => {
    byId.set(note.id, migrateNote(note));
  };

  if (feedType === "public") {
    for (const n of feed) {
      if ((n.visibility ?? "public") === "public") addNote(n);
    }
    for (const n of remoteForMerge) {
      if ((n.visibility ?? "public") === "public") addNote(n);
    }
    const hasPersistedPublicPosts = Array.from(byId.values()).some((n) => n.isPersisted);
    if (!hasPersistedPublicPosts) {
      for (const n of SEED_FIELD_NOTES) {
        if (!byId.has(n.id)) addNote(n);
      }
    }
  } else {
    const friendIds = new Set(getFriends(viewerId).map((f) => f.userId));
    for (const n of feed) {
      if (n.visibility === "friends" && (n.authorId === viewerId || friendIds.has(n.authorId))) addNote(n);
    }
    for (const n of remoteForMerge) {
      if (n.visibility === "friends" && (n.authorId === viewerId || friendIds.has(n.authorId))) addNote(n);
    }
  }

  return Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function getFeedByAuthorId(authorId: string): FieldNote[] {
  return [
    ...feed.filter((n) => n.authorId === authorId).map(migrateNote),
    ...remoteQuadPostsCache.filter((n) => n.authorId === authorId).map(migrateNote),
  ]
    .sort((a, b) => b.createdAt - a.createdAt);
}

export interface CreateFieldNoteParams {
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorAvatar: string;
  body: string;
  ramMarks: RamMark[];
  proofUrl?: string;
  visibility?: QuadPostVisibility;
  authorStreakDays?: number;
}

export function createFieldNote(params: CreateFieldNoteParams): FieldNote | null {
  const body = params.body.trim().slice(0, FIELD_NOTE_MAX_CHARS);
  if (!body) return null;

  const ramMarks = params.ramMarks
    .slice(0, RAMMARK_MAX_PER_POST)
    .map((r) => ({
      ...r,
      tag: normalizeRamMarkTag(r.tag).slice(0, RAMMARK_MAX_LENGTH),
    }))
    .filter((r) => r.tag);

  const note: FieldNote = {
    id: `fn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    authorId: params.authorId,
    authorName: params.authorName,
    authorUsername: params.authorUsername,
    authorAvatar: params.authorAvatar,
    body,
    ramMarks,
    nodCount: 0,
    vouchCount: 0,
    nodByUserIds: new Set(),
    vouchByUserIds: new Set(),
    hypeCount: 0,
    verifyCount: 0,
    assistCount: 0,
    hypeByUserIds: new Set(),
    verifyByUserIds: new Set(),
    assistByUserIds: new Set(),
    createdAt: Date.now(),
    proofUrl: params.proofUrl,
    visibility: params.visibility ?? "public",
    authorStreakDays: params.authorStreakDays,
  };
  feed.unshift(note);
  return note;
}

export type ReactionSnapshot = {
  nodCount: number;
  hypeCount: number;
  liked: boolean;
  sparked: boolean;
};

export function snapshotReactionState(note: FieldNote, userId: string): ReactionSnapshot {
  migrateNote(note);
  return {
    nodCount: note.nodCount,
    hypeCount: note.hypeCount,
    liked: note.nodByUserIds.has(userId),
    sparked: note.hypeByUserIds.has(userId),
  };
}

export function restoreReactionState(note: FieldNote, userId: string, snapshot: ReactionSnapshot): void {
  migrateNote(note);
  note.nodCount = snapshot.nodCount;
  note.hypeCount = snapshot.hypeCount;
  note.vouchCount = snapshot.hypeCount;
  if (snapshot.liked) note.nodByUserIds.add(userId);
  else note.nodByUserIds.delete(userId);
  if (snapshot.sparked) note.hypeByUserIds.add(userId);
  else note.hypeByUserIds.delete(userId);
  note.vouchByUserIds = note.hypeByUserIds;
}

export function optimisticToggleLike(note: FieldNote, userId: string): boolean {
  migrateNote(note);
  if (note.nodByUserIds.has(userId)) {
    note.nodByUserIds.delete(userId);
    note.nodCount = Math.max(0, note.nodCount - 1);
    return false;
  }
  note.nodByUserIds.add(userId);
  note.nodCount += 1;
  return true;
}

export function optimisticToggleSpark(note: FieldNote, userId: string): boolean {
  migrateNote(note);
  if (note.hypeByUserIds.has(userId)) {
    note.hypeByUserIds.delete(userId);
    note.hypeCount = Math.max(0, note.hypeCount - 1);
  } else {
    note.hypeByUserIds.add(userId);
    note.hypeCount += 1;
  }
  note.vouchByUserIds = note.hypeByUserIds;
  note.vouchCount = note.hypeCount;
  return note.hypeByUserIds.has(userId);
}

export function applyServerReactionState(
  note: FieldNote,
  userId: string,
  state: {
    likeCount: number;
    sparkCount: number;
    currentUserHasLiked: boolean;
    currentUserHasSparked: boolean;
  },
): void {
  migrateNote(note);
  note.nodCount = state.likeCount;
  note.hypeCount = state.sparkCount;
  note.vouchCount = state.sparkCount;
  if (state.currentUserHasLiked) note.nodByUserIds.add(userId);
  else note.nodByUserIds.delete(userId);
  if (state.currentUserHasSparked) note.hypeByUserIds.add(userId);
  else note.hypeByUserIds.delete(userId);
  note.vouchByUserIds = note.hypeByUserIds;
}

export function applyServerReactionStateToAllCopies(
  noteId: string,
  userId: string,
  state: {
    likeCount: number;
    sparkCount: number;
    currentUserHasLiked: boolean;
    currentUserHasSparked: boolean;
  },
): void {
  forEachNoteCopy(noteId, (note) => applyServerReactionState(note, userId, state));
}

export function restoreReactionStateToAllCopies(
  noteId: string,
  userId: string,
  snapshot: ReactionSnapshot,
): void {
  forEachNoteCopy(noteId, (note) => restoreReactionState(note, userId, snapshot));
}

export function optimisticToggleLikeOnAllCopies(noteId: string, userId: string): boolean {
  let active = false;
  forEachNoteCopy(noteId, (note) => {
    active = optimisticToggleLike(note, userId);
  });
  return active;
}

export function optimisticToggleSparkOnAllCopies(noteId: string, userId: string): boolean {
  let active = false;
  forEachNoteCopy(noteId, (note) => {
    active = optimisticToggleSpark(note, userId);
  });
  return active;
}

export function snapshotReactionStateForNote(noteId: string, userId: string): ReactionSnapshot | null {
  const note = getNoteForReaction(noteId);
  if (!note) return null;
  return snapshotReactionState(note, userId);
}

export function nodFieldNote(noteId: string, userId: string): FieldNote | null {
  const note = getNoteForMutation(noteId);
  if (!note) return null;
  migrateNote(note);
  if (note.isPersisted) {
    optimisticToggleLike(note, userId);
    return note;
  }
  if (note.nodByUserIds.has(userId)) {
    note.nodByUserIds.delete(userId);
  } else {
    note.nodByUserIds.add(userId);
  }
  syncNodCount(note);
  return note;
}

export function hypeFieldNote(noteId: string, userId: string): FieldNote | null {
  const note = getNoteForMutation(noteId);
  if (!note) return null;
  migrateNote(note);
  if (note.isPersisted) {
    optimisticToggleSpark(note, userId);
    return note;
  }
  if (note.hypeByUserIds.has(userId)) {
    note.hypeByUserIds.delete(userId);
  } else {
    note.hypeByUserIds.add(userId);
    addXpToCharacter(userId, 2);
    addXpToCharacter(note.authorId, 3);
  }
  syncHypeCount(note);
  return note;
}

/** @deprecated Use hypeFieldNote */
export function vouchFieldNote(noteId: string, userId: string): FieldNote | null {
  return hypeFieldNote(noteId, userId);
}

export function verifyFieldNote(noteId: string, userId: string): FieldNote | null {
  const note = getNoteForMutation(noteId);
  if (!note) return null;
  migrateNote(note);
  if (note.verifyByUserIds.has(userId)) {
    note.verifyByUserIds.delete(userId);
  } else {
    note.verifyByUserIds.add(userId);
    addXpToCharacter(userId, 5);
    addXpToCharacter(note.authorId, 5);
  }
  syncVerifyCount(note);
  return note;
}

export function assistFieldNote(noteId: string, userId: string): FieldNote | null {
  const note = getNoteForMutation(noteId);
  if (!note) return null;
  migrateNote(note);
  if (note.assistByUserIds.has(userId)) {
    note.assistByUserIds.delete(userId);
  } else {
    note.assistByUserIds.add(userId);
    addXpToCharacter(note.authorId, 2);
    bumpQuadAssistForAuthor(note.authorId);
    const guildIds = getGuildIdsForCharacter(userId);
    recordGuildWeeklyRace(userId, guildIds, 8);
  }
  syncAssistCount(note);
  return note;
}

export function getAllRamMarks(): string[] {
  const set = new Set<string>();
  feed.forEach((n) => n.ramMarks.forEach((r) => set.add(r.tag)));
  SEED_FIELD_NOTES.forEach((n) => n.ramMarks.forEach((r) => set.add(r.tag)));
  return Array.from(set).sort();
}

export function getCommentsByNoteId(noteId: string): QuadComment[] {
  return [...comments]
    .filter((c) => c.noteId === noteId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export interface AddCommentParams {
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorAvatar: string;
  body: string;
}

export function addComment(noteId: string, params: AddCommentParams): QuadComment | null {
  const body = params.body.trim().slice(0, QUAD_COMMENT_MAX_CHARS);
  if (!body) return null;
  const note = getNoteForMutation(noteId);
  if (!note) return null;

  const comment: QuadComment = {
    id: `qc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    noteId,
    authorId: params.authorId,
    authorName: params.authorName,
    authorUsername: params.authorUsername,
    authorAvatar: params.authorAvatar,
    body,
    createdAt: Date.now(),
  };
  comments.push(comment);
  return comment;
}

export { SEED_FIELD_NOTES };
