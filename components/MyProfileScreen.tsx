"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import type { Character } from "@/lib/types";
import type { FieldNote } from "@/lib/types";
import { getFeedByAuthorId, mergeRemoteQuadPostsForMutations, verifyFieldNote, assistFieldNote } from "@/lib/feedStore";
import { toggleQuadLike, toggleQuadSpark } from "@/lib/client/quadReactionActions";
import { submitQuadComment } from "@/lib/client/quadCommentActions";
import { fetchMyQuadPosts, fetchQuadPostsByAuthor } from "@/lib/client/quadPostsClient";
import {
  avatarFromConnectionProfile,
  fetchConnections,
  removeConnection as removeConnectionApi,
  type ConnectionItem,
} from "@/lib/client/socialConnectionsClient";
import { subscribeSocialSync, emitSocialSync } from "@/lib/client/socialSync";
import { replaceLocalCharacter, updateCharacter } from "@/lib/store";
import { ApiRequestError, fetchAuthed, patchAuthed } from "@/lib/client/dashboardApi";
import { persistBioToServer } from "@/lib/client/gameStateSync";
import { LOGOUT_BLOCKED_SAVE_MESSAGE, resetUserSaveSyncAfterHydrate, isServerBackedUserId } from "@/lib/client/gameStateSync";
import { hydrateUserPersistenceFromServer } from "@/lib/client/hydrateUserPersistence";
import { refreshPlayerSnapshotFromServer } from "@/lib/client/refreshPlayerSnapshot";
import { PullToRefresh } from "@/components/PullToRefresh";
import { registerLogoutPrepare } from "@/lib/client/logoutPrepare";
import { buildLocalCharacterFromServer, type MeProfileRow, type MeStatsRow } from "@/lib/client/profileCharacter";
import { scheduleNonCriticalWork } from "@/lib/client/deferNonCriticalWork";
import { AvatarDisplay } from "./AvatarDisplay";
import { ProfileSocialPage } from "./profile/ProfileSocialPage";
import type { ProfileTab } from "./profile/ProfileTabNav";
import {
  formatNextChangeDateLabel,
  getNextIdentityChangeEligibleAt,
  isProfileIdentityCooldownActive,
  PROFILE_DISPLAY_NAME_COOLDOWN_MS,
  PROFILE_USERNAME_COOLDOWN_MS,
} from "@/lib/profileIdentityCooldown";
import { useCampusIdentities } from "@/lib/client/useCampusIdentities";
import { openVerificationOnboarding, switchCampusIdentity } from "@/lib/client/identityStore";
import { SwitchProfileSheet } from "@/components/identity/SwitchProfileSheet";

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

export function MyProfileScreen({
  character,
  onLogout,
  onRefresh,
  omitCharacterStatPanel = false,
  moderationAdminAccess = false,
  platformAdminAccess,
  onViewFriend,
  onSharePost,
  activeProfileTab,
  onProfileTabChange,
  onOpenLeaderboard,
}: {
  character: Character;
  onLogout?: () => void | Promise<void>;
  onRefresh?: () => void;
  omitCharacterStatPanel?: boolean;
  moderationAdminAccess?: boolean;
  /** Platform admin (DB role or moderation allow-list). */
  platformAdminAccess?: boolean;
  onViewFriend?: (userId: string) => void;
  onSharePost?: (note: FieldNote) => void;
  activeProfileTab?: ProfileTab;
  onProfileTabChange?: (tab: ProfileTab) => void;
  onOpenLeaderboard?: () => void;
}) {
  const identityState = useCampusIdentities();
  const currentIdentity = identityState.currentIdentity;
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const displayCharacter: Character =
    currentIdentity && currentIdentity.type !== "personal"
      ? {
          ...character,
          name: currentIdentity.displayName,
          username: currentIdentity.username,
          bio: currentIdentity.bio,
          avatar: currentIdentity.avatarUrl || character.avatar,
        }
      : character;
  const isPlatformAdminUser = platformAdminAccess ?? moderationAdminAccess;
  const [posts, setPosts] = useState<FieldNote[]>([]);
  const [reactionNotice, setReactionNotice] = useState<string | null>(null);
  const [pendingReactions, setPendingReactions] = useState<Set<string>>(() => new Set());
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [logoutWorking, setLogoutWorking] = useState(false);
  const [logoutSaveError, setLogoutSaveError] = useState<string | null>(null);
  const [showEditBio, setShowEditBio] = useState(false);
  const [showEditIdentity, setShowEditIdentity] = useState(false);
  const [identityNameDraft, setIdentityNameDraft] = useState(character.name);
  const [identityUsernameDraft, setIdentityUsernameDraft] = useState(character.username);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [identitySaving, setIdentitySaving] = useState(false);
  const [cooldownSnap, setCooldownSnap] = useState<Pick<
    MeProfileRow,
    "onboarding_character_completed" | "display_name_changed_at" | "username_changed_at" | "weekly_identity_budget"
  > | null>(null);
  const [cooldownLoading, setCooldownLoading] = useState(false);
  const [repairPreserveCooldown, setRepairPreserveCooldown] = useState(true);
  const [bioDraft, setBioDraft] = useState(character.bio ?? "");
  const [bioSaving, setBioSaving] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);
  const [profileQuadPostsReady, setProfileQuadPostsReady] = useState(false);
  const [postsLoadError, setPostsLoadError] = useState<string | null>(null);
  const [apiConnections, setApiConnections] = useState<ConnectionItem[]>([]);
  const [followingCount, setFollowingCount] = useState(0);
  const [unfriendingId, setUnfriendingId] = useState<string | null>(null);
  const [friendsListOpen, setFriendsListOpen] = useState(false);

  const refreshConnections = useCallback(async () => {
    if (!isServerBackedUserId(character.id)) {
      setApiConnections([]);
      setFollowingCount(0);
      return;
    }
    try {
      const { connections, followingCount: count } = await fetchConnections();
      setApiConnections(connections);
      setFollowingCount(count);
    } catch {
      // Keep last good list on transient failures.
    }
  }, [character.id]);

  useEffect(() => {
    setProfileQuadPostsReady(false);
    setPostsLoadError(null);
  }, [character.id]);

  const refresh = useCallback(() => {
    void (async () => {
      try {
        const t0 = typeof performance !== "undefined" ? performance.now() : 0;
        const mine =
          currentIdentity && currentIdentity.type !== "personal"
            ? await fetchQuadPostsByAuthor(character.id, character.id, 50, {
                type: currentIdentity.type,
                id: currentIdentity.id,
              })
            : await fetchQuadPostsByAuthor(character.id, character.id, 50, {
                type: "personal",
                id: character.id,
              }).catch(() => fetchMyQuadPosts(character.id, 50));
        if (typeof performance !== "undefined") {
          console.log("[cq:load] profile my quad posts", Math.round(performance.now() - t0), "ms");
        }
        mergeRemoteQuadPostsForMutations(mine);
        setPosts(mine);
        setPostsLoadError(null);
      } catch (loadError) {
        const fallback = getFeedByAuthorId(character.id);
        setPosts(fallback);
        if (fallback.length === 0) {
          setPostsLoadError(loadError instanceof Error ? loadError.message : "Could not load profile posts.");
        } else {
          setPostsLoadError(null);
        }
      } finally {
        setProfileQuadPostsReady(true);
      }
    })();
  }, [character.id, currentIdentity]);

  const handlePullRefresh = useCallback(async () => {
    refresh();
    await refreshConnections();
    if (isServerBackedUserId(character.id)) {
      await Promise.all([
        refreshPlayerSnapshotFromServer(),
        hydrateUserPersistenceFromServer(character.id),
      ]);
    }
    onRefresh?.();
  }, [refresh, refreshConnections, character.id, onRefresh]);

  useEffect(() => {
    void refreshConnections();
    const unsubscribe = subscribeSocialSync(() => void refreshConnections());
    const onFocus = () => {
      if (document.visibilityState === "visible") void refreshConnections();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refreshConnections]);

  useEffect(() => {
    if (friendsListOpen) void refreshConnections();
  }, [friendsListOpen, refreshConnections]);

  useEffect(() => {
    const tid = scheduleNonCriticalWork(() => refresh());
    return () => window.clearTimeout(tid);
  }, [refresh]);

  useEffect(() => {
    return registerLogoutPrepare(() => {
      if (!showEditBio) return;
      const next = bioDraft.trim();
      const cur = (character.bio ?? "").trim();
      if (next !== cur) {
        updateCharacter({ bio: bioDraft });
      }
    });
  }, [showEditBio, bioDraft, character.bio]);

  useEffect(() => {
    if (!showEditIdentity) return;
    let cancelled = false;
    setCooldownLoading(true);
    void fetchAuthed<MeProfileRow>("/api/me/profile")
      .then((row) => {
        if (!cancelled) {
          setCooldownSnap({
            onboarding_character_completed: row.onboarding_character_completed ?? null,
            display_name_changed_at: row.display_name_changed_at ?? null,
            username_changed_at: row.username_changed_at ?? null,
            weekly_identity_budget: row.weekly_identity_budget ?? null,
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
  }, [showEditIdentity]);

  const identityUsernameNormalized = toUsername(identityUsernameDraft || identityNameDraft.trim());
  const identityNameOk =
    identityNameDraft.trim().length >= 1 && identityNameDraft.trim().length <= DISPLAY_NAME_MAX;
  const identityUsernameOk =
    identityUsernameNormalized.length >= 3 &&
    identityUsernameNormalized.length <= USERNAME_MAX &&
    USERNAME_REGEX.test(identityUsernameNormalized);

  const postCharacterOnboarding = Boolean(cooldownSnap?.onboarding_character_completed);
  const weeklyBudget = cooldownSnap?.weekly_identity_budget ?? null;
  const useWeeklyBudget = Boolean(weeklyBudget);

  const displayNameLocked =
    postCharacterOnboarding &&
    !cooldownLoading &&
    (useWeeklyBudget
      ? (weeklyBudget?.display_used ?? 0) >= (weeklyBudget?.max_per_week ?? 10)
      : isProfileIdentityCooldownActive(
          cooldownSnap?.display_name_changed_at ?? null,
          PROFILE_DISPLAY_NAME_COOLDOWN_MS,
        ));
  const usernameFieldLocked =
    postCharacterOnboarding &&
    !cooldownLoading &&
    (useWeeklyBudget
      ? (weeklyBudget?.username_used ?? 0) >= (weeklyBudget?.max_per_week ?? 10)
      : isProfileIdentityCooldownActive(cooldownSnap?.username_changed_at ?? null, PROFILE_USERNAME_COOLDOWN_MS));
  const nextDisplayEligible =
    !useWeeklyBudget && cooldownSnap?.display_name_changed_at != null
      ? getNextIdentityChangeEligibleAt(cooldownSnap.display_name_changed_at, PROFILE_DISPLAY_NAME_COOLDOWN_MS)
      : null;
  const nextUsernameEligible =
    !useWeeklyBudget && cooldownSnap?.username_changed_at != null
      ? getNextIdentityChangeEligibleAt(cooldownSnap.username_changed_at, PROFILE_USERNAME_COOLDOWN_MS)
      : null;
  const identitySaveBlockedByCooldown =
    postCharacterOnboarding && displayNameLocked && usernameFieldLocked;

  const saveIdentity = useCallback(async () => {
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
    if (repairPreserveCooldown && isPlatformAdminUser) {
      body.preserveIdentityCooldownTimestamps = true;
    }

    setIdentityError(null);
    setIdentitySaving(true);
    try {
      await patchAuthed<MeProfileRow, Record<string, unknown>>("/api/me/profile", body);
      const mergedProfile = await fetchAuthed<MeProfileRow>("/api/me/profile");
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
      }, { skipRemoteSync: true });
      resetUserSaveSyncAfterHydrate();
      setCooldownSnap({
        onboarding_character_completed: mergedProfile.onboarding_character_completed ?? null,
        display_name_changed_at: mergedProfile.display_name_changed_at ?? null,
        username_changed_at: mergedProfile.username_changed_at ?? null,
        weekly_identity_budget: mergedProfile.weekly_identity_budget ?? null,
      });
      setShowEditIdentity(false);
      onRefresh?.();
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409) {
        setIdentityError("That username is already taken. Pick another.");
        return;
      }
      if (
        err instanceof ApiRequestError &&
        (err.code === "DISPLAY_NAME_COOLDOWN" ||
          err.code === "USERNAME_COOLDOWN" ||
          err.code === "DISPLAY_NAME_WEEKLY_LIMIT" ||
          err.code === "USERNAME_WEEKLY_LIMIT")
      ) {
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
    isPlatformAdminUser,
    displayNameLocked,
    usernameFieldLocked,
    repairPreserveCooldown,
    onRefresh,
  ]);

  const saveBio = useCallback(async () => {
    const next = bioDraft.trim();
    const cur = (character.bio ?? "").trim();
    if (next === cur) {
      setShowEditBio(false);
      return;
    }
    setBioError(null);
    setBioSaving(true);
    try {
      await persistBioToServer(next);
      replaceLocalCharacter({ ...character, bio: next || undefined }, { skipRemoteSync: true });
      setShowEditBio(false);
      onRefresh?.();
    } catch (err) {
      setBioError(err instanceof Error ? err.message : "Could not save bio.");
    } finally {
      setBioSaving(false);
    }
  }, [bioDraft, character.bio, onRefresh]);

  const syncPostsFromCache = useCallback(() => {
    setPosts((prev) => {
      const byId = new Map(prev.map((p) => [p.id, p]));
      for (const cached of getFeedByAuthorId(character.id)) {
        byId.set(cached.id, cached);
      }
      return Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
    });
  }, [character.id]);

  function handleNod(noteId: string) {
    if (pendingReactions.has(noteId)) return;
    setPendingReactions((prev) => new Set(prev).add(noteId));
    setReactionNotice(null);
    void toggleQuadLike({
      noteId,
      userId: character.id,
      onOptimistic: syncPostsFromCache,
    }).then((result) => {
      setPendingReactions((prev) => {
        const next = new Set(prev);
        next.delete(noteId);
        return next;
      });
      if (!result.ok && result.message) {
        setReactionNotice(result.message);
      }
    });
  }

  function handleHype(noteId: string) {
    if (pendingReactions.has(noteId)) return;
    setPendingReactions((prev) => new Set(prev).add(noteId));
    setReactionNotice(null);
    void toggleQuadSpark({
      noteId,
      userId: character.id,
      onOptimistic: syncPostsFromCache,
    }).then((result) => {
      setPendingReactions((prev) => {
        const next = new Set(prev);
        next.delete(noteId);
        return next;
      });
      if (!result.ok && result.message) {
        setReactionNotice(result.message);
      }
    });
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

  function handleAddComment(noteId: string, body: string, parentCommentId?: string | null) {
    return submitQuadComment({
      noteId,
      parentCommentId,
      author: {
        authorId: character.id,
        authorName: character.name,
        authorUsername: character.username,
        authorAvatar: character.avatar,
        body,
      },
      onOptimistic: refresh,
    });
  }

  const friendsCount = apiConnections.length;

  return (
    <PullToRefresh onRefresh={handlePullRefresh}>
      <ProfileSocialPage
        character={displayCharacter}
        viewer={character}
        isOwner
        posts={posts}
        postsLoading={!profileQuadPostsReady}
        postsError={postsLoadError}
        onRetryPosts={refresh}
        friendsCount={friendsCount}
        followingCount={followingCount}
        onSwitchIdentity={() => setSwitcherOpen(true)}
        identityVerified={currentIdentity?.verified === true && currentIdentity.type !== "personal"}
        identitySubtitle={currentIdentity?.type === "personal" ? null : currentIdentity?.verificationLabel ?? null}
        showLevel={!currentIdentity || currentIdentity.type === "personal"}
        onEditBio={
          !currentIdentity || currentIdentity.type === "personal"
            ? () => {
                setBioDraft(character.bio ?? "");
                setShowEditBio(true);
              }
            : undefined
        }
        onEditIdentity={
          !currentIdentity || currentIdentity.type === "personal"
            ? () => {
                setIdentityNameDraft(character.name);
                setIdentityUsernameDraft(character.username);
                setIdentityError(null);
                setRepairPreserveCooldown(true);
                setCooldownSnap(null);
                setShowEditIdentity(true);
              }
            : undefined
        }
        onLogout={
          onLogout
            ? () => {
                setLogoutSaveError(null);
                setShowLogoutConfirm(true);
              }
            : undefined
        }
        onFriendsPress={() => setFriendsListOpen(true)}
        onNod={handleNod}
        onHype={handleHype}
        onVerify={handleVerify}
        onAssist={handleAssist}
        onAddComment={handleAddComment}
        onPostUpdated={(note) => {
          setPosts((prev) => prev.map((p) => (p.id === note.id ? note : p)));
          syncPostsFromCache();
        }}
        onPostDeleted={(postId) => {
          setPosts((prev) => prev.filter((p) => p.id !== postId));
          syncPostsFromCache();
        }}
        pendingReactions={pendingReactions}
        reactionNotice={reactionNotice}
        onSharePost={onSharePost}
        activeProfileTab={activeProfileTab}
        onProfileTabChange={onProfileTabChange}
        onOpenLeaderboard={onOpenLeaderboard}
      />

      {switcherOpen ? (
        <SwitchProfileSheet
          identities={identityState.identities}
          currentId={identityState.active.id || character.id}
          pendingRequests={identityState.pendingRequests}
          onSelect={(identity) => {
            void switchCampusIdentity({ type: identity.type, id: identity.id })
              .then(() => setSwitcherOpen(false))
              .catch(() => setSwitcherOpen(false));
          }}
          onAdd={() => {
            setSwitcherOpen(false);
            openVerificationOnboarding();
          }}
          onClose={() => setSwitcherOpen(false)}
        />
      ) : null}

      {friendsListOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Friends list" onClick={(e) => e.target === e.currentTarget && setFriendsListOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setFriendsListOpen(false)} aria-hidden />
          <div className="relative z-10 w-full max-w-[22rem] max-h-[85vh] overflow-hidden flex flex-col rounded-2xl border border-cq-border bg-cq-card shadow-xl shadow-black/40">
            <div className="flex items-center justify-between p-4 border-b border-cq-border flex-shrink-0">
              <h3 className="font-display font-semibold text-cq-foreground">Friends</h3>
              <button type="button" onClick={() => setFriendsListOpen(false)} className="p-2 rounded-xl text-cq-muted hover:text-cq-foreground hover:bg-cq-elevated" aria-label="Close">✕</button>
            </div>
            <ul className="overflow-y-auto p-3 space-y-2 flex-1 min-h-0">
              {apiConnections.length === 0 ? (
                <li className="text-sm text-cq-muted py-4 text-center">No friends yet. Connect with students on campus!</li>
              ) : (
                apiConnections.map((f) => {
                  const avatar = avatarFromConnectionProfile(f);
                  return (
                    <li key={f.userId} className="flex items-center gap-3 p-3 rounded-xl bg-cq-elevated border border-cq-border">
                      <button
                        type="button"
                        onClick={() => {
                          setFriendsListOpen(false);
                          onViewFriend?.(f.userId);
                        }}
                        className="flex items-center gap-3 min-w-0 flex-1 text-left"
                      >
                        <div className="cq-avatar-slot w-10 h-10 bg-cq-elevated border border-uri-keaney/30">
                          <AvatarDisplay avatar={avatar} fitParent size={40} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-cq-foreground truncate">{f.displayName}</p>
                          <p className="text-xs text-uri-keaney/90 truncate">@{f.username}</p>
                        </div>
                      </button>
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setFriendsListOpen(false);
                            onViewFriend?.(f.userId);
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-uri-keaney border border-uri-keaney/40 hover:bg-uri-keaney/10"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          disabled={unfriendingId === f.connectionId}
                          onClick={async () => {
                            setUnfriendingId(f.connectionId);
                            try {
                              await removeConnectionApi(f.connectionId);
                              emitSocialSync({ source: "friends" });
                              await refreshConnections();
                            } finally {
                              setUnfriendingId(null);
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-amber-300 border border-amber-400/40 hover:bg-amber-500/10 disabled:opacity-50"
                        >
                          {unfriendingId === f.connectionId ? "…" : "Remove"}
                        </button>
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

      {showEditIdentity && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="edit-identity-title">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !identitySaving && setShowEditIdentity(false)}
            aria-hidden
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-cq-border bg-cq-card shadow-xl shadow-black/40 p-5">
            <h2 id="edit-identity-title" className="font-display font-semibold text-lg text-cq-foreground mb-1">
              Edit name & username
            </h2>
            <p className="text-xs text-cq-muted mb-3">
              {isPlatformAdminUser
                ? "Admin: updates this profile using the same rules as student signup."
                : "This is how your name and handle appear across campus."}
            </p>
            {useWeeklyBudget && weeklyBudget ? (
              <>
                <p className="text-xs text-cq-muted mb-1">
                  Rolling 7 days: up to {weeklyBudget.max_per_week} display name changes and {weeklyBudget.max_per_week}{" "}
                  username changes (separate limits).
                </p>
                <p className="text-xs text-cq-muted mb-4">
                  This window: {weeklyBudget.display_used}/{weeklyBudget.max_per_week} display ·{" "}
                  {weeklyBudget.username_used}/{weeklyBudget.max_per_week} username.
                </p>
              </>
            ) : (
              <>
                <p className="text-xs text-cq-muted mb-1">Display name can be changed once every 7 days.</p>
                <p className="text-xs text-cq-muted mb-4">Username can be changed once every 30 days.</p>
              </>
            )}
            {cooldownLoading ? (
              <p className="text-[11px] text-cq-muted mb-3">Checking change limits…</p>
            ) : null}

            <label htmlFor="edit-identity-name" className="block text-[11px] font-medium text-cq-muted mb-1">
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
              className="w-full px-3 py-2.5 rounded-xl bg-cq-elevated border border-cq-border text-cq-foreground text-sm focus:outline-none focus:ring-2 focus:ring-uri-keaney/40 mb-1 disabled:opacity-50 disabled:cursor-not-allowed"
              autoComplete="name"
            />
            {displayNameLocked && useWeeklyBudget && weeklyBudget && !cooldownLoading ? (
              <p className="text-[11px] text-uri-keaney/90 mb-3">
                Display name limit reached ({weeklyBudget.display_used}/{weeklyBudget.max_per_week} in the last 7 days).
              </p>
            ) : displayNameLocked && nextDisplayEligible && !cooldownLoading ? (
              <p className="text-[11px] text-uri-keaney/90 mb-3">
                You can change this again on {formatNextChangeDateLabel(nextDisplayEligible)}.
              </p>
            ) : (
              <div className="mb-3" />
            )}

            <label htmlFor="edit-identity-username" className="block text-[11px] font-medium text-cq-muted mb-1">
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
              className="w-full px-3 py-2.5 rounded-xl bg-cq-elevated border border-cq-border text-cq-foreground text-sm focus:outline-none focus:ring-2 focus:ring-uri-keaney/40 disabled:opacity-50 disabled:cursor-not-allowed"
              autoComplete="username"
              spellCheck={false}
            />
            {usernameFieldLocked && useWeeklyBudget && weeklyBudget && !cooldownLoading ? (
              <p className="text-[11px] text-uri-keaney/90 mt-1">
                Username limit reached ({weeklyBudget.username_used}/{weeklyBudget.max_per_week} in the last 7 days).
              </p>
            ) : usernameFieldLocked && nextUsernameEligible && !cooldownLoading ? (
              <p className="text-[11px] text-uri-keaney/90 mt-1">
                You can change this again on {formatNextChangeDateLabel(nextUsernameEligible)}.
              </p>
            ) : null}
            <p className="text-xs text-cq-muted mt-1.5">
              You’ll appear as @{identityUsernameNormalized || "username"} · 3–{USERNAME_MAX} chars, a–z, 0–9, _
            </p>
            {isPlatformAdminUser ? (
              <label className="flex items-start gap-2 mt-4 text-xs text-cq-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={repairPreserveCooldown}
                  onChange={(e) => setRepairPreserveCooldown(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300"
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
              <p className="text-xs text-red-300 mt-2" role="alert">
                {identityError}
              </p>
            ) : null}
            <div className="flex gap-3 justify-end mt-5">
              <button
                type="button"
                disabled={identitySaving}
                onClick={() => setShowEditIdentity(false)}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-cq-muted hover:text-cq-foreground bg-cq-elevated hover:bg-cq-elevated border border-cq-border transition-colors disabled:opacity-50"
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
          <div className="relative z-10 w-full max-w-[20rem] rounded-2xl border border-cq-border bg-cq-card shadow-xl shadow-black/40 p-5">
            <h2 id="edit-bio-title" className="font-display font-semibold text-lg text-cq-foreground mb-3">
              Edit bio
            </h2>
            <textarea
              value={bioDraft}
              onChange={(e) => setBioDraft(e.target.value.slice(0, BIO_MAX_LENGTH))}
              placeholder="A short line about you..."
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl bg-cq-elevated border border-cq-border text-cq-foreground placeholder:text-cq-subtle text-sm focus:outline-none focus:ring-2 focus:ring-uri-keaney/40 resize-none"
            />
            <p className="text-xs text-cq-muted mt-1">{bioDraft.length}/{BIO_MAX_LENGTH}</p>
            {bioError ? <p className="text-xs text-red-400 mt-2">{bioError}</p> : null}
            <div className="flex gap-3 justify-end mt-4">
              <button
                type="button"
                onClick={() => setShowEditBio(false)}
                disabled={bioSaving}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-cq-muted hover:text-cq-foreground bg-cq-elevated border border-cq-border transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveBio()}
                disabled={bioSaving}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-uri-keaney hover:bg-uri-keaney/90 border border-uri-keaney/40 transition-colors disabled:opacity-60"
              >
                {bioSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showLogoutConfirm && onLogout && typeof document !== "undefined" && createPortal(
        <>
          <button
            type="button"
            className="cq-confirm-modal-backdrop"
            aria-label="Dismiss logout dialog"
            disabled={logoutWorking}
            onClick={() => {
              if (!logoutWorking) {
                setShowLogoutConfirm(false);
                setLogoutSaveError(null);
              }
            }}
          />
          <div
            className="cq-confirm-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-dialog-title"
          >
            <h2 id="logout-dialog-title" className="font-display font-semibold text-lg text-cq-foreground mb-2">
              Leave CampusQuest?
            </h2>
            <p className="text-sm text-cq-muted mb-4">
              The Quad shall wait for your return.
            </p>
            {logoutSaveError ? (
              <p className="text-xs text-amber-200 bg-amber-500/15 border border-amber-400/30 rounded-lg px-3 py-2 mb-4">
                {logoutSaveError}
              </p>
            ) : null}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                disabled={logoutWorking}
                onClick={() => {
                  setShowLogoutConfirm(false);
                  setLogoutSaveError(null);
                }}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-cq-muted hover:text-cq-foreground bg-cq-elevated border border-cq-border transition-colors disabled:opacity-45"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={logoutWorking}
                onClick={() => {
                  void (async () => {
                    setLogoutSaveError(null);
                    setLogoutWorking(true);
                    try {
                      await onLogout();
                      setShowLogoutConfirm(false);
                      setLogoutSaveError(null);
                    } catch (err) {
                      setLogoutSaveError(err instanceof Error ? err.message : LOGOUT_BLOCKED_SAVE_MESSAGE);
                    } finally {
                      setLogoutWorking(false);
                    }
                  })();
                }}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-uri-keaney hover:bg-uri-keaney/90 border border-uri-keaney/40 transition-colors disabled:opacity-55 disabled:pointer-events-none"
              >
                {logoutWorking ? "Saving…" : "Log out"}
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </PullToRefresh>
  );
}
