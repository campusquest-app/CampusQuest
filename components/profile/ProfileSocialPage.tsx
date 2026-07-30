"use client";

import { useState, useCallback, useEffect } from "react";
import type { Character, FieldNote } from "@/lib/types";
import { getActivityLogs } from "@/lib/store";
import { ProfileSocialHeader } from "./ProfileSocialHeader";
import { ProfileStatsRow } from "./ProfileStatsRow";
import { ProfileXpCard } from "./ProfileXpCard";
import { ProfileActionButtons } from "./ProfileActionButtons";
import { ProfileTabNav, type ProfileTab } from "./ProfileTabNav";
import { ProfilePostsGrid } from "./ProfilePostsGrid";
import { ProfileMemoriesGrid } from "./ProfileMemoriesGrid";
import { ProfilePostDetail } from "./ProfilePostDetail";
import { ProfileCollectiblesTab } from "./ProfileCollectiblesTab";
import { ProfileActivityTab } from "./ProfileActivityTab";
import { ProfileOwnerMenu } from "./ProfileOwnerMenu";
import { ProfileLockedPanel } from "./ProfileLockedPanel";
import { CampusMemoryViewer } from "@/components/memories/CampusMemoryViewer";
import type { CampusMemoryGroup } from "@/lib/types";
import { ConnectionActionButton } from "@/components/ConnectionActionButton";
import { ReportContentSheet } from "@/components/safety/ReportContentSheet";
import { postAuthed } from "@/lib/client/dashboardApi";
import type { ProfileRelationshipStatus } from "@/lib/client/userProfileViewClient";

export function ProfileSocialPage({
  character,
  viewer,
  isOwner,
  canViewPrivateContent = true,
  relationshipStatus,
  mutualFriendsCount = 0,
  postCount,
  posts,
  postsLoading,
  postsError,
  onRetryPosts,
  friendsCount,
  friendsLoading,
  followingCount,
  followingLoading,
  onEditBio,
  onEditIdentity,
  onLogout,
  onFriendsPress,
  onBack,
  onConnectionChange,
  onOpenMessage,
  guildLabel,
  onNod,
  onHype,
  onVerify,
  onAssist,
  onAddComment,
  onPostUpdated,
  onPostDeleted,
  onSharePost,
  pendingReactions,
  reactionNotice,
  activeProfileTab,
  onProfileTabChange,
  canModeratePosts,
}: {
  character: Character;
  viewer: Pick<Character, "id" | "name" | "username" | "avatar">;
  isOwner: boolean;
  canViewPrivateContent?: boolean;
  relationshipStatus?: ProfileRelationshipStatus;
  mutualFriendsCount?: number;
  postCount?: number;
  guildLabel?: string | null;
  posts: FieldNote[];
  postsLoading: boolean;
  postsError?: string | null;
  onRetryPosts?: () => void;
  friendsCount: number;
  friendsLoading?: boolean;
  followingCount: number;
  followingLoading?: boolean;
  onEditBio?: () => void;
  onEditIdentity?: () => void;
  onLogout?: () => void;
  onFriendsPress?: () => void;
  onBack?: () => void;
  onConnectionChange?: () => void;
  onOpenMessage?: () => void;
  onNod: (noteId: string) => void;
  onHype: (noteId: string) => void;
  onVerify: (noteId: string) => void;
  onAssist: (noteId: string) => void;
  onAddComment?: (noteId: string, body: string, parentCommentId?: string | null) => void;
  onPostUpdated?: (note: FieldNote) => void;
  onPostDeleted?: (postId: string) => void;
  onSharePost?: (note: FieldNote) => void;
  pendingReactions: Set<string>;
  reactionNotice?: string | null;
  activeProfileTab?: ProfileTab;
  onProfileTabChange?: (tab: ProfileTab) => void;
  canModeratePosts?: boolean;
}) {
  const [tab, setTab] = useState<ProfileTab>(activeProfileTab ?? "posts");
  const [selectedPost, setSelectedPost] = useState<FieldNote | null>(null);
  const [memoryViewerGroup, setMemoryViewerGroup] = useState<CampusMemoryGroup | null>(null);
  const [memoryViewerInitialId, setMemoryViewerInitialId] = useState<string | undefined>();
  const [menuOpen, setMenuOpen] = useState(false);
  const [connectionToast, setConnectionToast] = useState<string | null>(null);
  const [safetySheet, setSafetySheet] = useState<"report" | null>(null);
  const [blockBusy, setBlockBusy] = useState(false);

  async function handleBlockUser() {
    if (blockBusy) return;
    setBlockBusy(true);
    try {
      await postAuthed("/api/social/blocks", { userId: character.id });
      setConnectionToast("User blocked. Manage blocks in Settings → Blocked users.");
      onConnectionChange?.();
    } catch (err) {
      setConnectionToast(err instanceof Error ? err.message : "Could not block user.");
    } finally {
      setBlockBusy(false);
    }
  }

  useEffect(() => {
    if (!connectionToast) return undefined;
    const tid = window.setTimeout(() => setConnectionToast(null), 2800);
    return () => window.clearTimeout(tid);
  }, [connectionToast]);

  useEffect(() => {
    if (activeProfileTab) setTab(activeProfileTab);
  }, [activeProfileTab]);

  const handleProfileTabChange = useCallback(
    (next: ProfileTab) => {
      setTab(next);
      onProfileTabChange?.(next);
    },
    [onProfileTabChange],
  );

  const activitiesCount = canViewPrivateContent ? getActivityLogs(character.id).length : 0;
  const activePost = selectedPost ? posts.find((p) => p.id === selectedPost.id) ?? selectedPost : null;
  const locked = !isOwner && !canViewPrivateContent;
  const displayPostCount = postCount ?? posts.length;

  return (
    <div className="cq-profile-social w-full">
      {onBack ? (
        <div className="border-b border-white/10 px-3 py-2">
          <button
            type="button"
            onClick={onBack}
            className="text-sm font-medium text-uri-keaney hover:text-uri-keaney/80"
          >
            ← Back
          </button>
        </div>
      ) : null}

      <ProfileSocialHeader
        character={character}
        isOwner={isOwner}
        guildLabel={guildLabel}
        onEditBio={isOwner ? onEditBio : undefined}
        onOpenMenu={isOwner && (onEditIdentity || onEditBio || onLogout) ? () => setMenuOpen(true) : undefined}
      />

      <ProfileStatsRow
        items={[
          { label: "Posts", value: displayPostCount },
          { label: "Level", value: character.level },
          ...(canViewPrivateContent
            ? [
                {
                  label: "Friends",
                  value: friendsCount,
                  loading: friendsLoading,
                  onClick: onFriendsPress,
                },
                {
                  label: "Following",
                  value: followingCount,
                  loading: followingLoading,
                },
              ]
            : mutualFriendsCount > 0
              ? [{ label: "Mutual", value: mutualFriendsCount }]
              : []),
        ]}
      />

      <ProfileXpCard character={character} />

      {isOwner ? (
        <ProfileActionButtons
          character={character}
          onEditProfile={onEditIdentity}
          onOpenMenu={
            onEditIdentity || onEditBio || onLogout ? () => setMenuOpen(true) : undefined
          }
        />
      ) : (
        <div className="cq-profile-connect">
          <ConnectionActionButton
            otherUserId={character.id}
            otherUsername={character.username}
            onMessage={onOpenMessage}
            onToast={(message) => {
              setConnectionToast(message);
              onConnectionChange?.();
            }}
            onStateChange={onConnectionChange}
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/[0.07]"
              onClick={() => setSafetySheet("report")}
            >
              Report
            </button>
            <button
              type="button"
              className="flex-1 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-500/15"
              onClick={() => void handleBlockUser()}
              disabled={blockBusy}
            >
              {blockBusy ? "Blocking…" : "Block"}
            </button>
          </div>
          {connectionToast ? (
            <p className="mt-2 text-xs text-cyan-100/85">{connectionToast}</p>
          ) : null}
          {safetySheet === "report" ? (
            <ReportContentSheet
              mode="user"
              userId={character.id}
              targetLabel={`@${character.username}`}
              onClose={() => setSafetySheet(null)}
              onSubmitted={() => setConnectionToast("Thanks — we received your report.")}
              onError={(message) => setConnectionToast(message)}
            />
          ) : null}
        </div>
      )}

      {canViewPrivateContent ? (
        <p className="cq-profile-adventures">
          <span aria-hidden>🏆</span>
          <span className="tabular-nums">{activitiesCount.toLocaleString()}</span>{" "}
          {activitiesCount === 1 ? "Adventure" : "Adventures"} Completed
        </p>
      ) : null}

      {locked ? (
        <>
          <ProfileTabNav active="posts" onChange={() => undefined} locked />
          <ProfileLockedPanel mutualFriendsCount={mutualFriendsCount} />
        </>
      ) : (
        <>
          <ProfileTabNav active={tab} onChange={handleProfileTabChange} />

          <div className="cq-profile-tab-panel">
            {reactionNotice && tab === "posts" ? (
              <p className="border-b border-amber-400/30 bg-amber-500/15 px-4 py-2 text-sm text-amber-200">{reactionNotice}</p>
            ) : null}

            {tab === "posts" ? (
              <ProfilePostsGrid
                posts={posts}
                loading={postsLoading}
                error={postsError}
                onRetry={onRetryPosts}
                onSelectPost={setSelectedPost}
              />
            ) : null}
            {tab === "memories" ? (
              <ProfileMemoriesGrid
                userId={character.id}
                onOpenMemory={(group, memoryId) => {
                  setMemoryViewerGroup(group);
                  setMemoryViewerInitialId(memoryId);
                }}
              />
            ) : null}
            {tab === "collectibles" ? <ProfileCollectiblesTab character={character} /> : null}
            {tab === "activity" ? <ProfileActivityTab character={character} isOwner={isOwner} /> : null}
          </div>
        </>
      )}

      {activePost ? (
        <ProfilePostDetail
          note={activePost}
          currentUserId={viewer.id}
          currentUser={viewer}
          likePending={pendingReactions.has(activePost.id)}
          onClose={() => setSelectedPost(null)}
          onNod={onNod}
          onHype={onHype}
          onVerify={onVerify}
          onAssist={onAssist}
          onAddComment={onAddComment}
          onPostUpdated={onPostUpdated}
          onPostDeleted={(postId) => {
            setSelectedPost(null);
            onPostDeleted?.(postId);
          }}
          onSharePost={onSharePost}
          canModeratePosts={canModeratePosts}
        />
      ) : null}

      {memoryViewerGroup ? (
        <CampusMemoryViewer
          group={memoryViewerGroup}
          currentUserId={viewer.id}
          initialMemoryId={memoryViewerInitialId}
          includeExpired
          onClose={() => {
            setMemoryViewerGroup(null);
            setMemoryViewerInitialId(undefined);
          }}
        />
      ) : null}

      {isOwner ? (
        <ProfileOwnerMenu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          onEditIdentity={() => onEditIdentity?.()}
          onEditBio={() => onEditBio?.()}
          onLogout={onLogout ? () => onLogout() : undefined}
        />
      ) : null}
    </div>
  );
}
