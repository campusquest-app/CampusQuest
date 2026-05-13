"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import type { Character, Guild } from "@/lib/types";
import type { FieldNote } from "@/lib/types";
import { STAT_KEYS, STAT_LABELS, STAT_ICONS, MAX_STAT, type StatKey } from "@/lib/types";
import { xpProgressInLevel } from "@/lib/level";
import { getFeedByAuthorId, nodFieldNote, hypeFieldNote, verifyFieldNote, assistFieldNote, getCommentsByNoteId, addComment } from "@/lib/feedStore";
import { getFriends, getCharacterById, removeFriend } from "@/lib/friendsStore";
import { getFollowing, unfollow } from "@/lib/followStore";
import { getGuildById, leaveGuild } from "@/lib/guildStore";
import { getUserBosses, replaceLocalCharacter, updateCharacter } from "@/lib/store";
import { ApiRequestError, fetchAuthed, patchAuthed } from "@/lib/client/dashboardApi";
import { buildLocalCharacterFromServer, type MeProfileRow, type MeStatsRow } from "@/lib/client/profileCharacter";
import { getClassTitle, getClassRealm } from "@/lib/characterClasses";
import { AvatarDisplay } from "./AvatarDisplay";
import { FieldNoteCard } from "./FieldNoteCard";
import { LootCodex } from "./LootCodex";
import { EquipmentStrip } from "./EquipmentStrip";
import { ViewGuildModal } from "./ViewGuildModal";
import {
  formatNextChangeDateLabel,
  getNextIdentityChangeEligibleAt,
  isProfileIdentityCooldownActive,
  PROFILE_DISPLAY_NAME_COOLDOWN_MS,
  PROFILE_USERNAME_COOLDOWN_MS,
} from "@/lib/profileIdentityCooldown";

const STAT_FILL: Record<StatKey, string> = {
  strength: "linear-gradient(90deg, #f59e0b, #fbbf24)",
  stamina: "linear-gradient(90deg, #0d9488, #2dd4bf)",
  knowledge: "linear-gradient(90deg, #68ABE8, #93c5fd)",
  social: "linear-gradient(90deg, #2e7d32, #4ade80)",
  focus: "linear-gradient(90deg, #5e35b1, #a78bfa)",
};

const BIO_MAX_LENGTH = 150;

const USERNAME_REGEX = /^[a-z0-9_]+$/;
/** Matches `/api/me/profile` patch schema (`max(24)`) and DB constraint. */
const USERNAME_MAX = 24;
const DISPLAY_NAME_MAX = 60;

function toUsername(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, USERNAME_MAX);
}

export function Profile({
  character,
  onLogout,
  onRefresh,
  /** When true, hides the large Character stats panel (used when CharacterCard already shows stats on the same screen). */
  omitCharacterStatPanel = false,
  /** When true, signed-in viewer owns this profile — show name/username edit. */
  isOwnProfile = false,
  /** Moderation allow-list: optional preserve-cooldown check when patching identity. */
  moderationAdminAccess = false,
}: {
  character: Character;
  onLogout?: () => void;
  onRefresh?: () => void;
  omitCharacterStatPanel?: boolean;
  isOwnProfile?: boolean;
  moderationAdminAccess?: boolean;
}) {
  const [posts, setPosts] = useState<FieldNote[]>([]);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showEditBio, setShowEditBio] = useState(false);
  const [showEditIdentity, setShowEditIdentity] = useState(false);
  const [identityNameDraft, setIdentityNameDraft] = useState(character.name);
  const [identityUsernameDraft, setIdentityUsernameDraft] = useState(character.username);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [identitySaving, setIdentitySaving] = useState(false);
  const [cooldownSnap, setCooldownSnap] = useState<Pick<
    MeProfileRow,
    "onboarding_character_completed" | "display_name_changed_at" | "username_changed_at"
  > | null>(null);
  const [cooldownLoading, setCooldownLoading] = useState(false);
  const [repairPreserveCooldown, setRepairPreserveCooldown] = useState(true);
  const [showLootCodex, setShowLootCodex] = useState(false);
  const [bioDraft, setBioDraft] = useState(character.bio ?? "");

  const refresh = useCallback(() => {
    setPosts(getFeedByAuthorId(character.id));
  }, [character.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isOwnProfile || !showEditIdentity) return;
    let cancelled = false;
    setCooldownLoading(true);
    void fetchAuthed<MeProfileRow>("/api/me/profile")
      .then((row) => {
        if (!cancelled) {
          setCooldownSnap({
            onboarding_character_completed: row.onboarding_character_completed ?? null,
            display_name_changed_at: row.display_name_changed_at ?? null,
            username_changed_at: row.username_changed_at ?? null,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setCooldownSnap(null);
      })
      .finally(() => {
        if (!cancelled) setCooldownLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOwnProfile, showEditIdentity]);

  const identityUsernameNormalized = toUsername(identityUsernameDraft || identityNameDraft.trim());
  const identityNameOk =
    identityNameDraft.trim().length >= 1 && identityNameDraft.trim().length <= DISPLAY_NAME_MAX;
  const identityUsernameOk =
    identityUsernameNormalized.length >= 3 &&
    identityUsernameNormalized.length <= USERNAME_MAX &&
    USERNAME_REGEX.test(identityUsernameNormalized);

  const postCharacterOnboarding = Boolean(cooldownSnap?.onboarding_character_completed);
  const displayNameLocked =
    isOwnProfile &&
    postCharacterOnboarding &&
    !cooldownLoading &&
    isProfileIdentityCooldownActive(
      cooldownSnap?.display_name_changed_at ?? null,
      PROFILE_DISPLAY_NAME_COOLDOWN_MS,
    );
  const usernameFieldLocked =
    isOwnProfile &&
    postCharacterOnboarding &&
    !cooldownLoading &&
    isProfileIdentityCooldownActive(cooldownSnap?.username_changed_at ?? null, PROFILE_USERNAME_COOLDOWN_MS);
  const nextDisplayEligible =
    cooldownSnap?.display_name_changed_at != null
      ? getNextIdentityChangeEligibleAt(cooldownSnap.display_name_changed_at, PROFILE_DISPLAY_NAME_COOLDOWN_MS)
      : null;
  const nextUsernameEligible =
    cooldownSnap?.username_changed_at != null
      ? getNextIdentityChangeEligibleAt(cooldownSnap.username_changed_at, PROFILE_USERNAME_COOLDOWN_MS)
      : null;
  const identitySaveBlockedByCooldown =
    isOwnProfile && postCharacterOnboarding && displayNameLocked && usernameFieldLocked;

  const saveIdentity = useCallback(async () => {
    if (!isOwnProfile) return;
    const nameTrimmed = identityNameDraft.trim();
    const usernameNormalized = toUsername(identityUsernameDraft || nameTrimmed);
    if (nameTrimmed.length < 1 || nameTrimmed.length > DISPLAY_NAME_MAX) {
      setIdentityError(`Display name must be 1–${DISPLAY_NAME_MAX} characters.`);
      return;
    }
    if (
      usernameNormalized.length < 3 ||
      usernameNormalized.length > USERNAME_MAX ||
      !USERNAME_REGEX.test(usernameNormalized)
    ) {
      setIdentityError(`Username must be 3–${USERNAME_MAX} characters (letters, numbers, underscores).`);
      return;
    }

    const body: Record<string, unknown> = {};
    if (!displayNameLocked) body.displayName = nameTrimmed;
    if (!usernameFieldLocked) body.username = usernameNormalized;
    const hasIdentityPatch = Object.prototype.hasOwnProperty.call(body, "displayName") || Object.prototype.hasOwnProperty.call(body, "username");
    if (!hasIdentityPatch) {
      setIdentityError("Both display name and username are on cooldown. Try again later.");
      return;
    }
    if (repairPreserveCooldown && moderationAdminAccess) {
      body.preserveIdentityCooldownTimestamps = true;
    }

    setIdentityError(null);
    setIdentitySaving(true);
    try {
      const mergedProfile = await patchAuthed<MeProfileRow, Record<string, unknown>>("/api/me/profile", body);
      const stats = await fetchAuthed<MeStatsRow>("/api/me/stats");
      const next = buildLocalCharacterFromServer(mergedProfile, stats);
      replaceLocalCharacter({
        ...character,
        id: next.id,
        name: next.name,
        username: next.username,
        avatar: next.avatar,
        level: next.level,
        totalXP: next.totalXP,
        stats: next.stats,
        streakDays: next.streakDays,
        lastActivityDate: next.lastActivityDate,
        classId: next.classId,
        starterWeapon: next.starterWeapon,
        scholarGuildId: next.scholarGuildId,
      });
      setCooldownSnap({
        onboarding_character_completed: mergedProfile.onboarding_character_completed ?? null,
        display_name_changed_at: mergedProfile.display_name_changed_at ?? null,
        username_changed_at: mergedProfile.username_changed_at ?? null,
      });
      setShowEditIdentity(false);
      onRefresh?.();
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409) {
        setIdentityError("That username is already taken. Pick another.");
        return;
      }
      if (err instanceof ApiRequestError && (err.code === "DISPLAY_NAME_COOLDOWN" || err.code === "USERNAME_COOLDOWN")) {
        setIdentityError(err.message);
        return;
      }
      setIdentityError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setIdentitySaving(false);
    }
  }, [
    character,
    identityNameDraft,
    identityUsernameDraft,
    isOwnProfile,
    moderationAdminAccess,
    displayNameLocked,
    usernameFieldLocked,
    repairPreserveCooldown,
    onRefresh,
  ]);

  function handleNod(noteId: string) {
    nodFieldNote(noteId, character.id);
    refresh();
  }

  function handleHype(noteId: string) {
    hypeFieldNote(noteId, character.id);
    refresh();
    onRefresh?.();
  }

  function handleVerify(noteId: string) {
    verifyFieldNote(noteId, character.id);
    refresh();
    onRefresh?.();
  }

  function handleAssist(noteId: string) {
    assistFieldNote(noteId, character.id);
    refresh();
    onRefresh?.();
  }

  function handleAddComment(noteId: string, body: string) {
    addComment(noteId, {
      authorId: character.id,
      authorName: character.name,
      authorUsername: character.username,
      authorAvatar: character.avatar,
      body,
    });
    refresh();
  }

  const friends = getFriends(character.id);
  const followingIds = getFollowing(character.id);
  const friendsCount = friends.length;
  const followingCount = followingIds.length;
  const [listModal, setListModal] = useState<"friends" | "following" | null>(null);
  const [listRefreshKey, setListRefreshKey] = useState(0);
  const [viewGuild, setViewGuild] = useState<Guild | null>(null);
  const bosses = getUserBosses();
  const bossesDefeated =
    character.bossesDefeatedCount ?? bosses.filter((b) => b.defeated).length;
  const finalBossesDefeated =
    character.finalBossesDefeatedCount ?? bosses.filter((b) => b.defeated && b.maxHp > 500).length;

  const { current: xpCurrent, needed: xpNeeded } = xpProgressInLevel(character.totalXP);
  const xpPct = xpNeeded > 0 ? Math.min(100, (xpCurrent / xpNeeded) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Game-style character hero panel */}
      <div className="character-hero-panel rounded-2xl p-6 sm:p-8 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-start gap-6 sm:gap-8">
          <div className="flex justify-center sm:justify-start flex-shrink-0">
            <div className="relative">
              <div
                className="character-avatar-frame w-28 h-28 sm:w-32 sm:h-32 rounded-2xl flex items-center justify-center overflow-hidden p-[3px]"
                aria-hidden
              >
                <div className="w-full h-full rounded-[calc(1rem-2px)] bg-uri-navy flex items-center justify-center overflow-hidden">
                  <AvatarDisplay
                    avatar={character.avatar}
                    size={128}
                    className="rounded-xl"
                    classId={character.classId}
                    starterWeapon={character.starterWeapon}
                  />
                </div>
              </div>
              <div
                className="character-level-badge absolute -bottom-2 -right-2 min-w-[2.75rem] h-8 px-2 rounded-lg flex items-center justify-center text-xs font-display"
                aria-label={`Level ${character.level}`}
              >
                LV.{character.level}
              </div>
            </div>
          </div>
          <div className="flex-1 text-center sm:text-left min-w-0">
            <h2 className="font-display font-bold text-2xl sm:text-3xl text-white tracking-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
              {character.name}
            </h2>
            <p className="text-uri-keaney/95 text-sm mt-0.5 font-medium">@{character.username}</p>
            {character.classId && (getClassTitle(character.classId) || getClassRealm(character.classId)) && (
              <p className="inline-block mt-2 px-3 py-1 rounded-lg bg-uri-gold/20 border border-uri-gold/40 text-uri-gold text-sm font-semibold">
                {getClassTitle(character.classId)}
                {getClassRealm(character.classId) && (
                  <span className="text-white/60 font-normal"> · {getClassRealm(character.classId)}</span>
                )}
              </p>
            )}
            {/* XP bar */}
            <div className="mt-4">
              <div className="flex justify-between text-xs text-white/70 mb-1.5">
                <span>Level progress</span>
                <span className="font-mono text-uri-keaney/95">{xpCurrent} / {xpNeeded} XP</span>
              </div>
              <div className="xp-bar-track h-3 rounded-full overflow-hidden">
                <div
                  className="xp-bar-fill h-full rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${xpPct}%` }}
                />
              </div>
            </div>
            {(character.guildIds ?? []).length > 0 && (
              <div className="flex items-center gap-1.5 mt-3 flex-wrap justify-center sm:justify-start">
                {(character.guildIds ?? []).map((gid) => {
                  const g = getGuildById(gid);
                  return g ? (
                    <button
                      key={gid}
                      type="button"
                      onClick={() => setViewGuild(g)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 text-white/90 border border-uri-keaney/25 text-xs font-medium transition-colors hover:bg-uri-keaney/15 hover:border-uri-keaney/40 focus:outline-none focus:ring-2 focus:ring-uri-keaney/50 focus:ring-offset-2 focus:ring-offset-uri-navy"
                    >
                      <span className="truncate max-w-[14rem] sm:max-w-[18rem]">
                        {g.crest} {g.name}
                      </span>{" "}
                      <span className="text-white/50 shrink-0">Lv.{g.xp != null ? 1 + Math.floor(g.xp / 100) : g.level}</span>
                    </button>
                  ) : null;
                })}
              </div>
            )}
            {character.bio && (
              <p className="text-sm text-white/85 mt-3 break-words leading-relaxed">{character.bio}</p>
            )}
            <div className="flex justify-center sm:justify-start gap-4 mt-5 flex-wrap">
              <div className="game-stat-pill rounded-xl px-4 py-2.5 min-w-[4rem] text-center">
                <span className="font-bold text-white text-lg block leading-tight">{posts.length}</span>
                <span className="text-white/60 text-xs uppercase tracking-wider">Posts</span>
              </div>
              <button
                type="button"
                onClick={() => setListModal("friends")}
                className="game-stat-pill rounded-xl px-4 py-2.5 min-w-[4rem] text-center hover:border-uri-keaney/40 hover:shadow-[0_0_20px_rgba(104,171,232,0.1)] transition-all focus:outline-none focus:ring-2 focus:ring-uri-keaney/50 focus:ring-offset-2 focus:ring-offset-uri-navy"
              >
                <span className="font-bold text-white text-lg block leading-tight">{friendsCount}</span>
                <span className="text-white/60 text-xs uppercase tracking-wider">Friends</span>
              </button>
              <button
                type="button"
                onClick={() => setListModal("following")}
                className="game-stat-pill rounded-xl px-4 py-2.5 min-w-[4rem] text-center hover:border-uri-keaney/40 hover:shadow-[0_0_20px_rgba(104,171,232,0.1)] transition-all focus:outline-none focus:ring-2 focus:ring-uri-keaney/50 focus:ring-offset-2 focus:ring-offset-uri-navy"
              >
                <span className="font-bold text-white text-lg block leading-tight">{followingCount}</span>
                <span className="text-white/60 text-xs uppercase tracking-wider">Following</span>
              </button>
            </div>
            <div className="flex flex-wrap gap-3 mt-4">
              {isOwnProfile ? (
                <button
                  type="button"
                  onClick={() => {
                    setIdentityNameDraft(character.name);
                    setIdentityUsernameDraft(character.username);
                    setIdentityError(null);
                    setRepairPreserveCooldown(true);
                    setCooldownSnap(null);
                    setShowEditIdentity(true);
                  }}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium text-white/90 hover:text-white bg-white/10 hover:bg-white/15 border border-white/20 transition-colors"
                >
                  Edit name & username
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => { setBioDraft(character.bio ?? ""); setShowEditBio(true); }}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-white/90 hover:text-white bg-white/10 hover:bg-white/15 border border-white/20 transition-colors"
              >
                Edit bio
              </button>
              <button
                type="button"
                onClick={() => setShowLootCodex(true)}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-uri-keaney/95 hover:text-uri-keaney bg-uri-keaney/15 hover:bg-uri-keaney/25 border border-uri-keaney/30 transition-colors"
              >
                Loot Codex
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-0 sm:px-0">
        <EquipmentStrip character={character} onRefresh={onRefresh} />
      </div>

      {omitCharacterStatPanel && (
        <div className="character-hero-panel rounded-2xl p-4 sm:p-5 overflow-hidden flex flex-wrap gap-3">
          <div className="game-stat-pill-gold rounded-xl px-4 py-3 flex flex-1 min-w-[8rem] items-center gap-3">
            <span className="text-2xl flex-shrink-0" aria-hidden>🐉</span>
            <div className="min-w-0">
              <span className="text-uri-gold/80 text-xs uppercase block">Bosses defeated</span>
              <span className="font-bold text-uri-gold text-lg block">{bossesDefeated}</span>
            </div>
          </div>
          <div className="game-stat-pill-final rounded-xl px-4 py-3 flex flex-1 min-w-[8rem] items-center gap-3">
            <span className="text-2xl flex-shrink-0" aria-hidden>👑</span>
            <div className="min-w-0">
              <span className="text-uri-gold/90 text-xs uppercase font-semibold block">Final bosses</span>
              <span className="font-bold text-lg bg-clip-text text-transparent bg-gradient-to-r from-uri-gold via-amber-200 to-uri-gold block">{finalBossesDefeated}</span>
            </div>
          </div>
        </div>
      )}

      {!omitCharacterStatPanel && (
      <div className="character-hero-panel rounded-2xl p-4 sm:p-6 overflow-hidden">
        <div className="flex items-center gap-2 mb-4 sm:mb-5">
          <span className="text-lg sm:text-xl" aria-hidden>⚔️</span>
          <h3 className="font-display font-bold text-white text-xs sm:text-sm uppercase tracking-widest">
            Character stats
          </h3>
          <div className="flex-1 h-px bg-gradient-to-r from-uri-keaney/40 to-transparent" />
        </div>
        {/* Mobile: 2x2 grid for breathing room. Desktop: one row. */}
        <div className="grid grid-cols-2 sm:flex sm:flex-nowrap gap-3 sm:gap-3 mb-5 sm:mb-6">
          <div className="game-stat-pill rounded-xl px-4 py-3 sm:py-2.5 flex flex-1 min-w-0 items-center gap-3 sm:gap-2">
            <span className="text-2xl sm:text-xl flex-shrink-0" aria-hidden>📊</span>
            <div className="min-w-0">
              <span className="text-white/60 text-xs uppercase block">Level</span>
              <span className="font-bold text-uri-keaney text-lg sm:text-base block">{character.level}</span>
            </div>
          </div>
          <div className="game-stat-pill rounded-xl px-4 py-3 sm:py-2.5 flex flex-1 min-w-0 items-center gap-3 sm:gap-2">
            <span className="text-2xl sm:text-xl flex-shrink-0" aria-hidden>✨</span>
            <div className="min-w-0">
              <span className="text-white/60 text-xs uppercase block">Total XP</span>
              <span className="font-bold text-white text-lg sm:text-base font-mono block">{character.totalXP}</span>
            </div>
          </div>
          <div className="game-stat-pill-gold rounded-xl px-4 py-3 sm:py-2.5 flex flex-1 min-w-0 items-center gap-3 sm:gap-2">
            <span className="text-2xl sm:text-xl flex-shrink-0" aria-hidden>🐉</span>
            <div className="min-w-0">
              <span className="text-uri-gold/80 text-xs uppercase block">Bosses defeated</span>
              <span className="font-bold text-uri-gold text-lg sm:text-base block">{bossesDefeated}</span>
            </div>
          </div>
          <div className="game-stat-pill-final rounded-xl px-4 py-3 sm:py-2.5 flex flex-1 min-w-0 items-center gap-3 sm:gap-2">
            <span className="text-2xl sm:text-xl flex-shrink-0" aria-hidden>👑</span>
            <div className="min-w-0">
              <span className="text-uri-gold/90 text-xs uppercase font-semibold block">Final bosses</span>
              <span className="font-bold text-lg sm:text-base bg-clip-text text-transparent bg-gradient-to-r from-uri-gold via-amber-200 to-uri-gold block">{finalBossesDefeated}</span>
            </div>
          </div>
        </div>
        {/* Mobile: stacked (label + value on top, bar full width below). Desktop: single row. */}
        <div className="space-y-4 sm:space-y-3">
          {STAT_KEYS.map((key: StatKey) => {
            const value = character.stats[key] ?? 0;
            const pct = Math.min(100, (value / MAX_STAT) * 100);
            const atMax = value >= MAX_STAT;
            const prestigeCount = character.statPrestige?.[key] ?? 0;
            const valueEl = (
              <span className={`font-mono text-sm font-semibold ${atMax ? "text-uri-gold" : "text-white/95"}`}>
                {value}{atMax ? " ★" : ""}
              </span>
            );
            return (
              <div key={key} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                <div className="flex items-center justify-between sm:justify-start sm:w-32 flex-shrink-0">
                  <span className="flex items-center gap-2 text-white/90 text-sm">
                    <span className="text-lg w-6 flex-shrink-0" title={STAT_LABELS[key]}>
                      {STAT_ICONS[key]}
                    </span>
                    {STAT_LABELS[key]}
                    {prestigeCount > 0 && (
                      <span className="text-uri-gold/90 font-mono text-xs">×{prestigeCount}</span>
                    )}
                  </span>
                  <span className="sm:hidden">{valueEl}</span>
                </div>
                <div className="stat-bar-game w-full sm:flex-1 h-4 rounded-full overflow-hidden min-w-0">
                  <div
                    className="stat-fill-game rounded-full min-w-0"
                    style={{
                      width: `${pct}%`,
                      minWidth: pct > 0 ? "4px" : 0,
                      background: atMax
                        ? "linear-gradient(90deg, #c5a028, #fbbf24)"
                        : STAT_FILL[key],
                      boxShadow: atMax ? "0 0 10px rgba(197,165,40,0.4), inset 0 1px 0 rgba(255,255,255,0.2)" : undefined,
                    }}
                  />
                </div>
                <span className="hidden sm:block w-10 text-right flex-shrink-0">{valueEl}</span>
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* Log out */}
      {onLogout && (
        <div className="card p-4">
          <button
            type="button"
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full py-3 rounded-xl text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 border border-white/10 transition-colors"
          >
            Log out
          </button>
        </div>
      )}

      {/* All posts to the Quad */}
      <div>
        <div className="flex items-center gap-2 mb-3 px-1">
          <span className="text-lg" aria-hidden>📜</span>
          <h3 className="font-display font-semibold text-white text-sm uppercase tracking-wider">
            Posts to the Quad
          </h3>
        </div>
        {posts.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-white/60 text-sm">No posts yet. Share something on The Quad!</p>
          </div>
        ) : (
          <div className="card divide-y divide-white/10">
            {posts.map((note) => (
              <FieldNoteCard
                key={note.id}
                note={note}
                currentUserId={character.id}
                comments={getCommentsByNoteId(note.id)}
                onNod={handleNod}
                onHype={handleHype}
                onVerify={handleVerify}
                onAssist={handleAssist}
                onAddComment={handleAddComment}
                currentUser={{
                  id: character.id,
                  name: character.name,
                  username: character.username,
                  avatar: character.avatar,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {listModal && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={listModal === "friends" ? "Friends list" : "Following list"} onClick={(e) => e.target === e.currentTarget && setListModal(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setListModal(null)} aria-hidden />
          <div className="relative z-10 w-full max-w-[22rem] max-h-[85vh] overflow-hidden flex flex-col rounded-2xl border border-white/15 bg-uri-navy shadow-xl shadow-black/40">
            <div className="flex items-center justify-between p-4 border-b border-white/10 flex-shrink-0">
              <h3 className="font-display font-semibold text-white">
                {listModal === "friends" ? "Friends" : "Following"}
              </h3>
              <button type="button" onClick={() => setListModal(null)} className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10" aria-label="Close">✕</button>
            </div>
            <ul className="overflow-y-auto p-3 space-y-2 flex-1 min-h-0">
              {listModal === "friends"
                ? friends.length === 0
                  ? <li className="text-sm text-white/50 py-4 text-center">No friends yet.</li>
                  : friends.map((f) => (
                      <li key={f.userId} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center overflow-hidden flex-shrink-0 border border-uri-keaney/30">
                          <AvatarDisplay avatar={f.avatar} size={40} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-white truncate">{f.name}</p>
                          <p className="text-xs text-uri-keaney/90 truncate">@{f.username}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => { removeFriend(character.id, f.userId); setListRefreshKey((k) => k + 1); }}
                          className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-400/90 border border-amber-400/40 hover:bg-amber-400/10"
                        >
                          Unfriend
                        </button>
                      </li>
                    ))
                : followingIds.length === 0
                  ? <li className="text-sm text-white/50 py-4 text-center">Not following anyone yet.</li>
                  : followingIds.map((id) => {
                      const c = getCharacterById(id);
                      return (
                        <li key={id} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center overflow-hidden flex-shrink-0 border border-uri-keaney/30">
                            {c ? <AvatarDisplay avatar={c.avatar} size={40} /> : <span className="text-lg opacity-60">👤</span>}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-white truncate">{c ? c.name : "Unknown"}</p>
                            <p className="text-xs text-uri-keaney/90 truncate">{c ? `@${c.username}` : id}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => { unfollow(character.id, id); setListRefreshKey((k) => k + 1); }}
                            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium text-white/70 border border-white/20 hover:bg-white/10"
                          >
                            Unfollow
                          </button>
                        </li>
                      );
                    })}
            </ul>
          </div>
        </div>,
        document.body
      )}

      {showEditIdentity && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="edit-identity-title">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !identitySaving && setShowEditIdentity(false)}
            aria-hidden
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/15 bg-uri-navy shadow-xl shadow-black/40 p-5">
            <h2 id="edit-identity-title" className="font-display font-semibold text-lg text-white mb-1">
              Edit name & username
            </h2>
            <p className="text-xs text-white/50 mb-3">
              {moderationAdminAccess
                ? "Admin: updates this profile using the same rules as student signup."
                : "This is how your name and handle appear across campus."}
            </p>
            <p className="text-xs text-white/45 mb-1">Display name can be changed once every 7 days.</p>
            <p className="text-xs text-white/45 mb-4">Username can be changed once every 30 days.</p>
            {cooldownLoading ? (
              <p className="text-[11px] text-white/45 mb-3">Checking change limits…</p>
            ) : null}

            <label htmlFor="edit-identity-name" className="block text-[11px] font-medium text-white/55 mb-1">
              Display name
            </label>
            <input
              id="edit-identity-name"
              value={identityNameDraft}
              disabled={identitySaving || displayNameLocked}
              onChange={(e) => {
                setIdentityNameDraft(e.target.value.slice(0, DISPLAY_NAME_MAX));
                setIdentityError(null);
              }}
              className="w-full px-3 py-2.5 rounded-xl bg-white/10 border border-white/15 text-white text-sm focus:outline-none focus:ring-2 focus:ring-uri-keaney/40 mb-1 disabled:opacity-50 disabled:cursor-not-allowed"
              autoComplete="name"
            />
            {displayNameLocked && nextDisplayEligible && !cooldownLoading ? (
              <p className="text-[11px] text-uri-keaney/90 mb-3">
                You can change this again on {formatNextChangeDateLabel(nextDisplayEligible)}.
              </p>
            ) : (
              <div className="mb-3" />
            )}

            <label htmlFor="edit-identity-username" className="block text-[11px] font-medium text-white/55 mb-1">
              Username
            </label>
            <input
              id="edit-identity-username"
              value={identityUsernameDraft}
              disabled={identitySaving || usernameFieldLocked}
              onChange={(e) => {
                setIdentityUsernameDraft(toUsername(e.target.value));
                setIdentityError(null);
              }}
              className="w-full px-3 py-2.5 rounded-xl bg-white/10 border border-white/15 text-white text-sm focus:outline-none focus:ring-2 focus:ring-uri-keaney/40 disabled:opacity-50 disabled:cursor-not-allowed"
              autoComplete="username"
              spellCheck={false}
            />
            {usernameFieldLocked && nextUsernameEligible && !cooldownLoading ? (
              <p className="text-[11px] text-uri-keaney/90 mt-1">
                You can change this again on {formatNextChangeDateLabel(nextUsernameEligible)}.
              </p>
            ) : null}
            <p className="text-xs text-white/45 mt-1.5">
              You’ll appear as @{identityUsernameNormalized || "username"} · 3–{USERNAME_MAX} chars, a–z, 0–9, _
            </p>
            {moderationAdminAccess ? (
              <label className="flex items-start gap-2 mt-4 text-xs text-white/65 cursor-pointer">
                <input
                  type="checkbox"
                  checked={repairPreserveCooldown}
                  onChange={(e) => setRepairPreserveCooldown(e.target.checked)}
                  className="mt-0.5 rounded border-white/30"
                />
                <span>
                  Preserve name cooldown timestamps (moderator repairs). Uncheck when this should count as your normal rename and start/update the timer.
                </span>
              </label>
            ) : null}
            {identityNameDraft.trim().length > 0 && !identityNameOk ? (
              <p className="text-xs text-amber-200 mt-2" role="alert">
                Display name: 1–{DISPLAY_NAME_MAX} characters.
              </p>
            ) : null}
            {identityUsernameDraft.length > 0 && !identityUsernameOk ? (
              <p className="text-xs text-amber-200 mt-1" role="alert">
                Username must be 3–{USERNAME_MAX} valid characters.
              </p>
            ) : null}
            {identityError ? (
              <p className="text-xs text-rose-200 mt-2" role="alert">
                {identityError}
              </p>
            ) : null}
            <div className="flex gap-3 justify-end mt-5">
              <button
                type="button"
                disabled={identitySaving}
                onClick={() => setShowEditIdentity(false)}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-white/80 hover:text-white bg-white/10 hover:bg-white/15 border border-white/15 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  identitySaving ||
                  cooldownLoading ||
                  !identityNameOk ||
                  !identityUsernameOk ||
                  identitySaveBlockedByCooldown
                }
                onClick={() => void saveIdentity()}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 border border-emerald-400/40 transition-colors disabled:opacity-50"
              >
                {identitySaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showEditBio && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="edit-bio-title">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowEditBio(false)}
            aria-hidden
          />
          <div className="relative z-10 w-full max-w-[20rem] rounded-2xl border border-white/15 bg-uri-navy shadow-xl shadow-black/40 p-5">
            <h2 id="edit-bio-title" className="font-display font-semibold text-lg text-white mb-3">
              Edit bio
            </h2>
            <textarea
              value={bioDraft}
              onChange={(e) => setBioDraft(e.target.value.slice(0, BIO_MAX_LENGTH))}
              placeholder="A short line about you..."
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl bg-white/10 border border-white/15 text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-uri-keaney/40 resize-none"
            />
            <p className="text-xs text-white/50 mt-1">{bioDraft.length}/{BIO_MAX_LENGTH}</p>
            <div className="flex gap-3 justify-end mt-4">
              <button
                type="button"
                onClick={() => setShowEditBio(false)}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-white/80 hover:text-white bg-white/10 hover:bg-white/15 border border-white/15 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  updateCharacter({ bio: bioDraft });
                  setShowEditBio(false);
                  onRefresh?.();
                }}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-uri-keaney hover:bg-uri-keaney/90 border border-uri-keaney/40 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showLootCodex && typeof document !== "undefined" && createPortal(
        <LootCodex
          characterId={character.id}
          equippedCosmetics={character.equippedCosmetics}
          onClose={() => setShowLootCodex(false)}
        />,
        document.body
      )}

      {viewGuild && (
        <ViewGuildModal
          guild={viewGuild}
          currentUserId={character.id}
          onLeave={(guildId) => {
            leaveGuild(character.id, guildId);
            setViewGuild(null);
            onRefresh?.();
          }}
          onClose={() => setViewGuild(null)}
          onUpdated={() => {
            onRefresh?.();
            setViewGuild((g) => (g ? getGuildById(g.id) ?? g : null));
          }}
        />
      )}

      {showLogoutConfirm && onLogout && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="logout-dialog-title">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowLogoutConfirm(false)}
            aria-hidden
          />
          <div className="relative z-10 w-full max-w-[20rem] rounded-2xl border border-white/15 bg-uri-navy shadow-xl shadow-black/40 p-6">
            <h2 id="logout-dialog-title" className="font-display font-semibold text-lg text-white mb-2">
              Leave CampusQuest?
            </h2>
            <p className="text-sm text-white/70 mb-6">
              The Quad shall wait for your return.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-white/80 hover:text-white bg-white/10 hover:bg-white/15 border border-white/15 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { setShowLogoutConfirm(false); onLogout(); }}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-uri-keaney hover:bg-uri-keaney/90 border border-uri-keaney/40 transition-colors"
              >
                Log out
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
