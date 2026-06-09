"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import type { Character } from "@/lib/types";
import type { FieldNote } from "@/lib/types";
import { STAT_KEYS, STAT_LABELS, STAT_ICONS, MAX_STAT, type StatKey } from "@/lib/types";
import { xpProgressInLevel } from "@/lib/level";
import {
  getFeedByAuthorId,
  mergeRemoteQuadPostsForMutations,
  verifyFieldNote,
  assistFieldNote,
  getCommentsByNoteId,
  addComment,
} from "@/lib/feedStore";
import { toggleQuadLike, toggleQuadSpark } from "@/lib/client/quadReactionActions";
import { fetchQuadPostsByAuthor } from "@/lib/client/quadPostsClient";
import {
  avatarFromConnectionProfile,
  fetchFollowCounts,
  fetchFollowers,
  fetchFollowing,
  type ConnectionItem,
} from "@/lib/client/socialConnectionsClient";
import { getGuildById } from "@/lib/guildStore";
import { getClassTitle, getClassRealm } from "@/lib/characterClasses";
import { getEquippedTitleLabel } from "@/lib/achievementEngine";
import { scheduleNonCriticalWork } from "@/lib/client/deferNonCriticalWork";
import { PullToRefresh } from "@/components/PullToRefresh";
import { AvatarDisplay } from "./AvatarDisplay";
import { AchievementShowcaseModal } from "./achievements/AchievementShowcaseModal";
import { FieldNoteCard } from "./FieldNoteCard";

const STAT_FILL: Record<StatKey, string> = {
  strength: "linear-gradient(90deg, #f59e0b, #fbbf24)",
  stamina: "linear-gradient(90deg, #0d9488, #2dd4bf)",
  knowledge: "linear-gradient(90deg, #68ABE8, #93c5fd)",
  social: "linear-gradient(90deg, #2e7d32, #4ade80)",
  focus: "linear-gradient(90deg, #5e35b1, #a78bfa)",
};

function ProfileStatCell({
  label,
  value,
  loading,
  onClick,
}: {
  label: string;
  value: string | number;
  loading?: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <>
      {loading ? (
        <span className="cq-skeleton mx-auto mb-1 block h-6 w-10 rounded-md" aria-hidden />
      ) : (
        <span className="block text-lg font-bold leading-tight text-white tabular-nums">{value}</span>
      )}
      <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wider text-white/50">{label}</span>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="min-w-0 flex-1 px-1 py-1 text-center hover:bg-white/5 transition-colors">
        {inner}
      </button>
    );
  }
  return <div className="min-w-0 flex-1 px-1 py-1 text-center">{inner}</div>;
}

/** Read-only profile for friends and other users. */
export function UserProfileScreen({
  character,
  viewer,
  onBack,
}: {
  character: Character;
  viewer: Pick<Character, "id" | "name" | "username" | "avatar">;
  onBack?: () => void;
}) {
  const [posts, setPosts] = useState<FieldNote[]>([]);
  const [reactionNotice, setReactionNotice] = useState<string | null>(null);
  const [postActionMessage, setPostActionMessage] = useState<string | null>(null);
  const [pendingReactions, setPendingReactions] = useState<Set<string>>(() => new Set());
  const [showAchievementShowcase, setShowAchievementShowcase] = useState(false);
  const [profileQuadPostsReady, setProfileQuadPostsReady] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [socialCountsReady, setSocialCountsReady] = useState(false);
  const [listModal, setListModal] = useState<"followers" | "following" | null>(null);
  const [listUsers, setListUsers] = useState<ConnectionItem[]>([]);
  const [listLoading, setListLoading] = useState(false);

  useEffect(() => {
    setProfileQuadPostsReady(false);
    setSocialCountsReady(false);
  }, [character.id]);

  const refreshSocialCounts = useCallback(async () => {
    try {
      const counts = await fetchFollowCounts(character.id);
      setFollowersCount(counts.followersCount);
      setFollowingCount(counts.followingCount);
    } catch {
      setFollowersCount(0);
      setFollowingCount(0);
    } finally {
      setSocialCountsReady(true);
    }
  }, [character.id]);

  useEffect(() => {
    void refreshSocialCounts();
  }, [refreshSocialCounts]);

  useEffect(() => {
    if (!listModal) return;
    setListLoading(true);
    const load = listModal === "followers" ? fetchFollowers(character.id) : fetchFollowing(character.id);
    void load
      .then(setListUsers)
      .catch(() => setListUsers([]))
      .finally(() => setListLoading(false));
  }, [listModal, character.id]);

  useEffect(() => {
    if (!postActionMessage) return undefined;
    const tid = window.setTimeout(() => setPostActionMessage(null), 2800);
    return () => window.clearTimeout(tid);
  }, [postActionMessage]);

  const refresh = useCallback(async () => {
    try {
      const theirs = await fetchQuadPostsByAuthor(viewer.id, character.id, 40);
      mergeRemoteQuadPostsForMutations(theirs);
      setPosts([...theirs].sort((a, b) => b.createdAt - a.createdAt));
    } catch {
      setPosts(getFeedByAuthorId(character.id));
    } finally {
      setProfileQuadPostsReady(true);
    }
  }, [character.id, viewer.id]);

  const handlePullRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  useEffect(() => {
    const tid = scheduleNonCriticalWork(() => {
      void refresh();
    });
    return () => window.clearTimeout(tid);
  }, [refresh]);

  const syncPostsFromCache = useCallback(() => {
    setPosts(getFeedByAuthorId(character.id));
  }, [character.id]);

  function handleNod(noteId: string) {
    if (pendingReactions.has(noteId)) return;
    setPendingReactions((prev) => new Set(prev).add(noteId));
    setReactionNotice(null);
    void toggleQuadLike({
      noteId,
      userId: viewer.id,
      onOptimistic: syncPostsFromCache,
    }).then((result) => {
      setPendingReactions((prev) => {
        const next = new Set(prev);
        next.delete(noteId);
        return next;
      });
      if (!result.ok && result.message) setReactionNotice(result.message);
    });
  }

  function handleHype(noteId: string) {
    if (pendingReactions.has(noteId)) return;
    setPendingReactions((prev) => new Set(prev).add(noteId));
    setReactionNotice(null);
    void toggleQuadSpark({
      noteId,
      userId: viewer.id,
      onOptimistic: syncPostsFromCache,
    }).then((result) => {
      setPendingReactions((prev) => {
        const next = new Set(prev);
        next.delete(noteId);
        return next;
      });
      if (!result.ok && result.message) setReactionNotice(result.message);
    });
  }

  function handleVerify(noteId: string) {
    verifyFieldNote(noteId, viewer.id);
    void refresh();
  }

  function handleAssist(noteId: string) {
    assistFieldNote(noteId, viewer.id);
    void refresh();
  }

  function handleAddComment(noteId: string, body: string) {
    addComment(noteId, {
      authorId: viewer.id,
      authorName: viewer.name,
      authorUsername: viewer.username,
      authorAvatar: viewer.avatar,
      body,
    });
    void refresh();
  }

  const { current: xpCurrent, needed: xpNeeded } = xpProgressInLevel(character.totalXP);
  const xpPct = xpNeeded > 0 ? Math.min(100, (xpCurrent / xpNeeded) * 100) : 0;
  const profileTitle = getEquippedTitleLabel(character) || getClassTitle(character.classId) || null;
  const profileClassRealm = getClassRealm(character.classId);

  return (
    <PullToRefresh onRefresh={handlePullRefresh}>
      <div className="space-y-6">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white"
          >
            ← Back to your profile
          </button>
        ) : null}

        <div className="character-hero-panel overflow-hidden rounded-2xl p-4 sm:p-6">
          <div className="flex items-start gap-4 sm:gap-5">
            <div className="relative flex-shrink-0">
              <div
                className="character-avatar-frame flex h-[4.75rem] w-[4.75rem] items-center justify-center overflow-hidden rounded-2xl p-[3px] sm:h-20 sm:w-20"
                aria-hidden
              >
                <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-[calc(1rem-2px)] bg-cq-elevated">
                  <AvatarDisplay
                    avatar={character.avatar}
                    size={80}
                    fitParent
                    className="rounded-xl"
                    classId={character.classId}
                    starterWeapon={character.starterWeapon}
                  />
                </div>
              </div>
              <span
                className="cq-profile-level-pip absolute -bottom-0.5 -right-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full border-2 border-cq-card px-0.5 text-[10px] font-bold leading-none text-white"
                aria-hidden
              >
                {character.level}
              </span>
            </div>

            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h2 className="truncate font-display text-xl font-bold tracking-tight text-white sm:text-2xl">
                  {character.name}
                </h2>
                <span className="rounded-md border border-cyan-400/25 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold tracking-[0.14em] text-cyan-200">
                  LVL {character.level}
                </span>
              </div>
              {profileTitle ? (
                <p className="mt-1 truncate text-sm font-medium text-uri-gold/90">
                  {profileTitle}
                  {profileClassRealm && profileTitle !== getClassTitle(character.classId) ? (
                    <span className="font-normal text-white/45"> · {profileClassRealm}</span>
                  ) : null}
                </p>
              ) : profileClassRealm ? (
                <p className="mt-1 text-sm text-white/50">{profileClassRealm}</p>
              ) : null}
              <p className="mt-0.5 text-sm text-white/40">@{character.username}</p>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex justify-between gap-2 text-[11px] font-medium tabular-nums text-white/42">
              <span>{character.totalXP.toLocaleString()} XP total</span>
              <span>{(xpNeeded - xpCurrent).toLocaleString()} XP to next level</span>
            </div>
            <div className="xp-bar-track h-2.5 overflow-hidden rounded-full">
              <div className="xp-bar-fill h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${xpPct}%` }} />
            </div>
          </div>

          {(character.guildIds ?? []).length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {(character.guildIds ?? []).map((gid) => {
                const g = getGuildById(gid);
                return g ? (
                  <span key={gid} className="inline-flex items-center gap-1 text-[11px] font-medium text-white/52">
                    <span className="max-w-[14rem] truncate">{g.crest} {g.name}</span>
                  </span>
                ) : null;
              })}
            </div>
          ) : null}

          {character.streakDays >= 3 ? (
            <p className="mt-2.5 text-[11px] font-semibold text-amber-200/90">
              🔥 {character.streakDays}-Day Streak
            </p>
          ) : null}

          {character.bio ? (
            <p className="mt-3 break-words text-sm leading-relaxed text-white/85">{character.bio}</p>
          ) : null}

          <div className="mt-5 flex border-y border-white/10 py-3">
            <ProfileStatCell label="Posts" value={posts.length} loading={!profileQuadPostsReady} />
            <ProfileStatCell
              label="Followers"
              value={followersCount}
              loading={!socialCountsReady}
              onClick={() => setListModal("followers")}
            />
            <ProfileStatCell
              label="Following"
              value={followingCount}
              loading={!socialCountsReady}
              onClick={() => setListModal("following")}
            />
          </div>

          <button
            type="button"
            onClick={() => setShowAchievementShowcase(true)}
            className="mt-4 w-full rounded-xl border border-uri-gold/35 bg-uri-gold/10 px-4 py-2.5 text-sm font-semibold text-uri-gold transition hover:bg-uri-gold/15"
          >
            View Achievement Showcase
          </button>

          <div className="mt-5 space-y-3">
            {STAT_KEYS.map((key: StatKey) => {
              const value = character.stats[key] ?? 0;
              const pct = Math.min(100, (value / MAX_STAT) * 100);
              const atMax = value >= MAX_STAT;
              const prestigeCount = character.statPrestige?.[key] ?? 0;
              return (
                <div key={key} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                  <div className="flex items-center justify-between sm:w-32 sm:flex-shrink-0">
                    <span className="flex items-center gap-2 text-sm text-white/90">
                      <span className="w-6 flex-shrink-0 text-lg" title={STAT_LABELS[key]}>
                        {STAT_ICONS[key]}
                      </span>
                      {STAT_LABELS[key]}
                      {prestigeCount > 0 ? (
                        <span className="font-mono text-xs text-uri-gold/90">×{prestigeCount}</span>
                      ) : null}
                    </span>
                    <span className={`font-mono text-sm font-semibold sm:hidden ${atMax ? "text-uri-gold" : "text-white/95"}`}>
                      {value}{atMax ? " ★" : ""}
                    </span>
                  </div>
                  <div className="stat-bar-game h-3 min-w-0 w-full flex-1 overflow-hidden rounded-full sm:h-3.5">
                    <div
                      className="stat-fill-game min-w-0 rounded-full"
                      style={{
                        width: `${pct}%`,
                        minWidth: pct > 0 ? "4px" : 0,
                        background: atMax ? "linear-gradient(90deg, #c5a028, #fbbf24)" : STAT_FILL[key],
                        boxShadow: atMax ? "0 0 10px rgba(197,165,40,0.4), inset 0 1px 0 rgba(255,255,255,0.2)" : undefined,
                      }}
                    />
                  </div>
                  <span className={`hidden w-10 flex-shrink-0 text-right font-mono text-sm font-semibold sm:block ${atMax ? "text-uri-gold" : "text-white/95"}`}>
                    {value}{atMax ? " ★" : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <AchievementShowcaseModal
          character={character}
          open={showAchievementShowcase}
          onClose={() => setShowAchievementShowcase(false)}
        />

        <div>
          <div className="mb-3 flex items-center gap-2 px-1">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-white">Posts</h3>
          </div>
          {!profileQuadPostsReady ? (
            <div className="card cq-skeleton-wrap space-y-3 p-8" aria-busy="true" aria-label="Loading posts">
              <div className="cq-skeleton h-4 w-2/3 max-w-xs rounded" />
              <div className="cq-skeleton h-24 w-full rounded-xl" />
            </div>
          ) : posts.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-sm text-white/60">No posts yet.</p>
            </div>
          ) : (
            <div className="card divide-y divide-white/10">
              {reactionNotice ? (
                <p className="cq-quad-reaction-notice border-b border-amber-400/20 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-100/90">
                  {reactionNotice}
                </p>
              ) : null}
              {postActionMessage ? (
                <p className="border-b border-emerald-400/20 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-100/90" aria-live="polite">
                  {postActionMessage}
                </p>
              ) : null}
              {posts.map((note) => (
                <FieldNoteCard
                  key={note.id}
                  note={note}
                  currentUserId={viewer.id}
                  comments={getCommentsByNoteId(note.id)}
                  onNod={handleNod}
                  onHype={handleHype}
                  onVerify={handleVerify}
                  onAssist={handleAssist}
                  onAddComment={handleAddComment}
                  likePending={pendingReactions.has(note.id)}
                  onPostUpdated={(updated) => {
                    setPosts((prev) =>
                      prev.map((n) =>
                        n.id === updated.id
                          ? {
                              ...updated,
                              nodByUserIds: n.nodByUserIds,
                              hypeByUserIds: n.hypeByUserIds,
                              vouchByUserIds: n.vouchByUserIds,
                              verifyByUserIds: n.verifyByUserIds,
                              assistByUserIds: n.assistByUserIds,
                            }
                          : n,
                      ),
                    );
                  }}
                  onPostDeleted={(postId) => {
                    setPosts((prev) => prev.filter((n) => n.id !== postId));
                  }}
                  onActionMessage={setPostActionMessage}
                  currentUser={{
                    id: viewer.id,
                    name: viewer.name,
                    username: viewer.username,
                    avatar: viewer.avatar,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {listModal && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={listModal === "followers" ? "Followers list" : "Following list"} onClick={(e) => e.target === e.currentTarget && setListModal(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setListModal(null)} aria-hidden />
          <div className="relative z-10 w-full max-w-[22rem] max-h-[85vh] overflow-hidden flex flex-col rounded-2xl border border-white/15 bg-cq-elevated shadow-xl shadow-black/40">
            <div className="flex items-center justify-between p-4 border-b border-white/10 flex-shrink-0">
              <h3 className="font-display font-semibold text-white">
                {listModal === "followers" ? "Followers" : "Following"}
              </h3>
              <button type="button" onClick={() => setListModal(null)} className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10" aria-label="Close">✕</button>
            </div>
            <ul className="overflow-y-auto p-3 space-y-2 flex-1 min-h-0">
              {listLoading ? (
                <li className="text-sm text-white/50 py-4 text-center">Loading…</li>
              ) : listUsers.length === 0 ? (
                <li className="text-sm text-white/50 py-4 text-center">
                  {listModal === "followers" ? "No followers yet." : "Not following anyone yet."}
                </li>
              ) : (
                listUsers.map((u) => {
                  const avatar = avatarFromConnectionProfile(u);
                  return (
                    <li key={u.userId} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                      <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center overflow-hidden flex-shrink-0 border border-uri-keaney/30">
                        <AvatarDisplay avatar={avatar} size={40} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-white truncate">{u.displayName}</p>
                        <p className="text-xs text-uri-keaney/90 truncate">@{u.username}</p>
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>,
        document.body
      )}
    </PullToRefresh>
  );
}
