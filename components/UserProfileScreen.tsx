"use client";

import { useState, useCallback, useEffect } from "react";
import type { Character } from "@/lib/types";
import type { FieldNote } from "@/lib/types";
import {
  getFeedByAuthorId,
  mergeRemoteQuadPostsForMutations,
  verifyFieldNote,
  assistFieldNote,
  addComment,
} from "@/lib/feedStore";
import { toggleQuadLike, toggleQuadSpark } from "@/lib/client/quadReactionActions";
import { fetchQuadPostsByAuthor } from "@/lib/client/quadPostsClient";
import {
  fetchFollowCounts,
} from "@/lib/client/socialConnectionsClient";
import { scheduleNonCriticalWork } from "@/lib/client/deferNonCriticalWork";
import { PullToRefresh } from "@/components/PullToRefresh";
import { ProfileSocialPage } from "./profile/ProfileSocialPage";

/** Read-only social profile for friends and other users. */
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
  const [pendingReactions, setPendingReactions] = useState<Set<string>>(() => new Set());
  const [profileQuadPostsReady, setProfileQuadPostsReady] = useState(false);
  const [friendsCount, setFriendsCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [socialCountsReady, setSocialCountsReady] = useState(false);

  useEffect(() => {
    setProfileQuadPostsReady(false);
    setSocialCountsReady(false);
  }, [character.id]);

  const refreshSocialCounts = useCallback(async () => {
    try {
      const counts = await fetchFollowCounts(character.id);
      setFriendsCount(counts.followersCount);
      setFollowingCount(counts.followingCount);
    } catch {
      setFriendsCount(0);
      setFollowingCount(0);
    } finally {
      setSocialCountsReady(true);
    }
  }, [character.id]);

  useEffect(() => {
    void refreshSocialCounts();
  }, [refreshSocialCounts]);

  const refresh = useCallback(async () => {
    try {
      const theirs = await fetchQuadPostsByAuthor(viewer.id, character.id, 50);
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
    await refreshSocialCounts();
  }, [refresh, refreshSocialCounts]);

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

  return (
    <PullToRefresh onRefresh={handlePullRefresh}>
      <ProfileSocialPage
        character={character}
        viewer={viewer}
        isOwner={false}
        posts={posts}
        postsLoading={!profileQuadPostsReady}
        friendsCount={friendsCount}
        friendsLoading={!socialCountsReady}
        followingCount={followingCount}
        followingLoading={!socialCountsReady}
        onBack={onBack}
        onNod={handleNod}
        onHype={handleHype}
        onVerify={handleVerify}
        onAssist={handleAssist}
        onAddComment={handleAddComment}
        onPostUpdated={(note) => {
          setPosts((prev) => prev.map((p) => (p.id === note.id ? note : p)));
          syncPostsFromCache();
        }}
        pendingReactions={pendingReactions}
        reactionNotice={reactionNotice}
      />
    </PullToRefresh>
  );
}
