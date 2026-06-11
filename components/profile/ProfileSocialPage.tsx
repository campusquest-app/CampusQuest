"use client";

import { useState } from "react";
import type { Character, FieldNote } from "@/lib/types";
import { getCommentsByNoteId } from "@/lib/feedStore";
import { getActivityLogs } from "@/lib/store";
import { ProfileSocialHeader } from "./ProfileSocialHeader";
import { ProfileStatsRow } from "./ProfileStatsRow";
import { ProfileTabNav, type ProfileTab } from "./ProfileTabNav";
import { ProfilePostsGrid } from "./ProfilePostsGrid";
import { ProfilePostDetail } from "./ProfilePostDetail";
import { ProfileCollectiblesTab } from "./ProfileCollectiblesTab";
import { ProfileActivityTab } from "./ProfileActivityTab";
import { ProfileOwnerMenu } from "./ProfileOwnerMenu";

export function ProfileSocialPage({
  character,
  viewer,
  isOwner,
  posts,
  postsLoading,
  friendsCount,
  friendsLoading,
  followingCount,
  followingLoading,
  onEditBio,
  onEditIdentity,
  onLogout,
  onFriendsPress,
  onBack,
  onNod,
  onHype,
  onVerify,
  onAssist,
  onAddComment,
  onPostUpdated,
  onPostDeleted,
  pendingReactions,
  reactionNotice,
}: {
  character: Character;
  viewer: Pick<Character, "id" | "name" | "username" | "avatar">;
  isOwner: boolean;
  posts: FieldNote[];
  postsLoading: boolean;
  friendsCount: number;
  friendsLoading?: boolean;
  followingCount: number;
  followingLoading?: boolean;
  onEditBio?: () => void;
  onEditIdentity?: () => void;
  onLogout?: () => void;
  onFriendsPress?: () => void;
  onBack?: () => void;
  onNod: (noteId: string) => void;
  onHype: (noteId: string) => void;
  onVerify: (noteId: string) => void;
  onAssist: (noteId: string) => void;
  onAddComment?: (noteId: string, body: string) => void;
  onPostUpdated?: (note: FieldNote) => void;
  onPostDeleted?: (postId: string) => void;
  pendingReactions: Set<string>;
  reactionNotice?: string | null;
}) {
  const [tab, setTab] = useState<ProfileTab>("posts");
  const [selectedPost, setSelectedPost] = useState<FieldNote | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const activitiesCount = getActivityLogs(character.id).length;
  const activePost = selectedPost ? posts.find((p) => p.id === selectedPost.id) ?? selectedPost : null;

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
        onEditBio={isOwner ? onEditBio : undefined}
        onOpenMenu={isOwner && (onEditIdentity || onEditBio || onLogout) ? () => setMenuOpen(true) : undefined}
      />

      <ProfileStatsRow
        items={[
          { label: "Level", value: character.level },
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
        ]}
      />

      <p className="border-b border-white/10 px-3 py-2 text-center text-[11px] tabular-nums text-cq-subtle">
        {activitiesCount.toLocaleString()} {activitiesCount === 1 ? "Activity" : "Activities"} Completed
      </p>

      <ProfileTabNav active={tab} onChange={setTab} />

      <div className="cq-profile-tab-panel pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]">
        {reactionNotice && tab === "posts" ? (
          <p className="border-b border-amber-400/30 bg-amber-500/15 px-4 py-2 text-sm text-amber-200">{reactionNotice}</p>
        ) : null}

        {tab === "posts" ? (
          <ProfilePostsGrid posts={posts} loading={postsLoading} onSelectPost={setSelectedPost} />
        ) : null}
        {tab === "collectibles" ? <ProfileCollectiblesTab character={character} /> : null}
        {tab === "activity" ? <ProfileActivityTab character={character} /> : null}
      </div>

      {activePost ? (
        <ProfilePostDetail
          note={activePost}
          currentUserId={viewer.id}
          currentUser={viewer}
          comments={getCommentsByNoteId(activePost.id)}
          likePending={pendingReactions.has(activePost.id)}
          onClose={() => setSelectedPost(null)}
          onNod={onNod}
          onHype={onHype}
          onVerify={onVerify}
          onAssist={onAssist}
          onAddComment={onAddComment}
          onPostUpdated={onPostUpdated}
          onPostDeleted={onPostDeleted}
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
