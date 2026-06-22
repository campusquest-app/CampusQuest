"use client";

import { useState, useCallback, useEffect } from "react";
import type { Character } from "@/lib/types";
import type { FieldNote } from "@/lib/types";
import {
  getFeedByAuthorId,
  mergeRemoteQuadPostsForMutations,
  verifyFieldNote,
  assistFieldNote,
} from "@/lib/feedStore";
import { toggleQuadLike, toggleQuadSpark } from "@/lib/client/quadReactionActions";
import { submitQuadComment } from "@/lib/client/quadCommentActions";
import {
  fetchUserProfileView,
  mapProfileViewPosts,
  buildCharacterFromProfileView,
  type ProfileRelationshipStatus,
} from "@/lib/client/userProfileViewClient";
import { scheduleNonCriticalWork } from "@/lib/client/deferNonCriticalWork";
import { PullToRefresh } from "@/components/PullToRefresh";
import { ProfileSocialPage } from "./profile/ProfileSocialPage";
import { MobileSwipeBackSurface } from "@/components/mobile/MobileSwipeBackSurface";

/** Read-only social profile for other users (connected or locked). */
export function UserProfileScreen({
  character: initialCharacter,
  viewer,
  canViewPrivateContent: initialCanView,
  relationshipStatus: initialRelationship,
  mutualFriendsCount: initialMutualFriends,
  initialPosts,
  friendsCount: initialFriendsCount,
  postCount: initialPostCount,
  guildLabel,
  onBack,
  onOpenMessage,
  onProfileReload,
  onSharePost,
}: {
  character: Character;
  viewer: Pick<Character, "id" | "name" | "username" | "avatar">;
  canViewPrivateContent: boolean;
  relationshipStatus: ProfileRelationshipStatus;
  mutualFriendsCount: number;
  initialPosts: FieldNote[];
  friendsCount: number | null;
  postCount: number;
  guildLabel?: string | null;
  onBack?: () => void;
  onOpenMessage?: (other: { userId: string; username: string; name: string; avatar: string }) => void;
  onProfileReload?: () => void | Promise<void>;
  onSharePost?: (note: FieldNote) => void;
}) {
  const [character, setCharacter] = useState(initialCharacter);
  const [canViewPrivateContent, setCanViewPrivateContent] = useState(initialCanView);
  const [relationshipStatus, setRelationshipStatus] = useState(initialRelationship);
  const [mutualFriendsCount, setMutualFriendsCount] = useState(initialMutualFriends);
  const [posts, setPosts] = useState<FieldNote[]>(initialPosts);
  const [postCount, setPostCount] = useState(initialPostCount);
  const [friendsCount, setFriendsCount] = useState(initialFriendsCount ?? 0);
  const [reactionNotice, setReactionNotice] = useState<string | null>(null);
  const [pendingReactions, setPendingReactions] = useState<Set<string>>(() => new Set());
  const [profileQuadPostsReady, setProfileQuadPostsReady] = useState(true);
  const [postsLoadError, setPostsLoadError] = useState<string | null>(null);
  const [socialCountsReady, setSocialCountsReady] = useState(true);

  useEffect(() => {
    setCharacter(initialCharacter);
    setCanViewPrivateContent(initialCanView);
    setRelationshipStatus(initialRelationship);
    setMutualFriendsCount(initialMutualFriends);
    setPosts(initialPosts);
    setPostCount(initialPostCount);
    setFriendsCount(initialFriendsCount ?? 0);
  }, [
    initialCharacter,
    initialCanView,
    initialRelationship,
    initialMutualFriends,
    initialPosts,
    initialPostCount,
    initialFriendsCount,
  ]);

  const reloadProfile = useCallback(async () => {
    if (onProfileReload) {
      await onProfileReload();
      return;
    }
    try {
      const payload = await fetchUserProfileView(character.id);
      setCharacter(buildCharacterFromProfileView(payload, viewer.id));
      setCanViewPrivateContent(payload.canViewPrivateContent);
      setRelationshipStatus(payload.relationshipStatus);
      setMutualFriendsCount(payload.counts.mutualFriends);
      setPostCount(payload.counts.posts);
      setFriendsCount(payload.counts.friends ?? 0);
      const nextPosts = mapProfileViewPosts(payload, viewer.id);
      mergeRemoteQuadPostsForMutations(nextPosts);
      setPosts(nextPosts);
    } catch {
      /* keep current state */
    }
  }, [character.id, onProfileReload, viewer.id]);

  const refresh = useCallback(async () => {
    if (!canViewPrivateContent) {
      setProfileQuadPostsReady(true);
      return;
    }
    setProfileQuadPostsReady(false);
    setPostsLoadError(null);
    try {
      await reloadProfile();
      setPostsLoadError(null);
    } catch (loadError) {
      const fallback = getFeedByAuthorId(character.id);
      setPosts(fallback);
      if (fallback.length === 0) {
        setPostsLoadError(loadError instanceof Error ? loadError.message : "Could not load profile posts.");
      }
    } finally {
      setProfileQuadPostsReady(true);
    }
  }, [canViewPrivateContent, character.id, reloadProfile]);

  const handlePullRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  useEffect(() => {
    if (!canViewPrivateContent) return undefined;
    const tid = scheduleNonCriticalWork(() => {
      void refresh();
    });
    return () => window.clearTimeout(tid);
  }, [canViewPrivateContent, refresh]);

  const syncPostsFromCache = useCallback(() => {
    if (!canViewPrivateContent) return;
    setPosts(getFeedByAuthorId(character.id));
  }, [canViewPrivateContent, character.id]);

  function handleNod(noteId: string) {
    if (!canViewPrivateContent || pendingReactions.has(noteId)) return;
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
    if (!canViewPrivateContent || pendingReactions.has(noteId)) return;
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
    if (!canViewPrivateContent) return;
    verifyFieldNote(noteId, viewer.id);
    void refresh();
  }

  function handleAssist(noteId: string) {
    if (!canViewPrivateContent) return;
    assistFieldNote(noteId, viewer.id);
    void refresh();
  }

  function handleAddComment(noteId: string, body: string) {
    if (!canViewPrivateContent) return Promise.resolve();
    return submitQuadComment({
      noteId,
      author: {
        authorId: viewer.id,
        authorName: viewer.name,
        authorUsername: viewer.username,
        authorAvatar: viewer.avatar,
        body,
      },
      onOptimistic: () => void refresh(),
    });
  }

  const profileBody = (
    <ProfileSocialPage
      character={character}
      viewer={viewer}
      isOwner={false}
      canViewPrivateContent={canViewPrivateContent}
      relationshipStatus={relationshipStatus}
      mutualFriendsCount={mutualFriendsCount}
      postCount={postCount}
      guildLabel={guildLabel}
      posts={posts}
      postsLoading={!profileQuadPostsReady}
      postsError={postsLoadError}
      onRetryPosts={() => void refresh()}
      friendsCount={friendsCount}
      friendsLoading={!socialCountsReady}
      followingCount={friendsCount}
      followingLoading={!socialCountsReady}
      onBack={onBack}
      onConnectionChange={() => {
        void reloadProfile();
      }}
      onOpenMessage={
        relationshipStatus === "connected" && onOpenMessage
          ? () =>
              onOpenMessage({
                userId: character.id,
                username: character.username,
                name: character.name,
                avatar: character.avatar,
              })
          : undefined
      }
      onNod={handleNod}
      onHype={handleHype}
      onVerify={handleVerify}
      onAssist={handleAssist}
      onAddComment={canViewPrivateContent ? handleAddComment : undefined}
      onPostUpdated={(note) => {
        setPosts((prev) => prev.map((p) => (p.id === note.id ? note : p)));
        syncPostsFromCache();
      }}
      pendingReactions={pendingReactions}
      reactionNotice={reactionNotice}
      onSharePost={onSharePost}
    />
  );

  if (onBack) {
    return (
      <MobileSwipeBackSurface onBack={onBack} className="min-h-[50vh]">
        <PullToRefresh onRefresh={handlePullRefresh}>{profileBody}</PullToRefresh>
      </MobileSwipeBackSurface>
    );
  }

  return <PullToRefresh onRefresh={handlePullRefresh}>{profileBody}</PullToRefresh>;
}
