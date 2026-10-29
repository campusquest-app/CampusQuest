"use client";

import type { FieldNote } from "@/lib/types";
import { getPostThumbnailUrl, isCarouselPost, isTextOnlyPost, isVideoPost } from "./profilePostUtils";
import { Heart, Images, MessageCircle, Video } from "lucide-react";
import { ScreenDataState } from "@/components/ui/ScreenDataState";

function TextPostTile({ note }: { note: FieldNote }) {
  const preview = note.body.trim().slice(0, 120) || note.ramMarks.map((r) => `#${r.tag}`).join(" ");
  const hue = (note.id.charCodeAt(0) + note.id.charCodeAt(note.id.length - 1)) % 360;

  return (
    <div
      className="cq-profile-post-tile cq-profile-post-tile--text flex h-full w-full flex-col justify-between p-2"
      style={{
        background: `linear-gradient(145deg, hsl(${hue} 48% 32%) 0%, hsl(${(hue + 35) % 360} 42% 24%) 100%)`,
      }}
    >
      <span className="line-clamp-4 text-[10px] font-medium leading-snug text-white/90 sm:text-[11px]">{preview}</span>
    </div>
  );
}

function EngagementIndicator({ note }: { note: FieldNote }) {
  const likes = note.nodCount;
  const comments = note.commentCount ?? 0;
  if (likes <= 0 && comments <= 0) return null;
  const label = [
    likes > 0 ? `${likes} ${likes === 1 ? "like" : "likes"}` : null,
    comments > 0 ? `${comments} ${comments === 1 ? "comment" : "comments"}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <span className="cq-profile-tile-stats" aria-label={label}>
      {likes > 0 ? (
        <span className="cq-profile-tile-stat">
          <Heart className="h-3 w-3" fill="currentColor" aria-hidden />
          {likes.toLocaleString()}
        </span>
      ) : null}
      {comments > 0 ? (
        <span className="cq-profile-tile-stat">
          <MessageCircle className="h-3 w-3" aria-hidden />
          {comments.toLocaleString()}
        </span>
      ) : null}
    </span>
  );
}

export function ProfilePostsGrid({
  posts,
  loading,
  error,
  onRetry,
  onSelectPost,
  emptyMessage = "No posts yet",
  emptyDetail = "Share campus moments on The Quad to fill your grid.",
}: {
  posts: FieldNote[];
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  onSelectPost: (note: FieldNote) => void;
  emptyMessage?: string;
  emptyDetail?: string;
}) {
  if (loading) {
    return (
      <div className="cq-profile-posts-grid" aria-busy="true" aria-label="Loading posts">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="cq-profile-post-tile cq-skeleton aspect-square" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-8">
        <ScreenDataState
          variant="error"
          message="Could not load posts."
          detail={error}
          onRetry={onRetry}
          compact
        />
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="px-4 py-8">
        <ScreenDataState
          variant="empty"
          message={emptyMessage}
          detail={emptyDetail}
          compact
        />
      </div>
    );
  }

  return (
    <div className="cq-profile-posts-grid">
      {posts.map((note) => {
        const thumb = getPostThumbnailUrl(note);
        return (
          <button
            key={note.id}
            type="button"
            onClick={() => onSelectPost(note)}
            className="cq-profile-post-tile cq-profile-press group relative aspect-square overflow-hidden bg-cq-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-uri-keaney focus-visible:ring-offset-2"
            aria-label={`View post from ${note.authorName}`}
          >
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="" className="h-full w-full object-cover transition duration-200 group-active:scale-[0.98]" loading="lazy" decoding="async" fetchPriority="low" />
            ) : isVideoPost(note) ? (
              <div className="flex h-full w-full items-center justify-center bg-black/40">
                <Video className="h-8 w-8 text-white/80" aria-hidden />
              </div>
            ) : isTextOnlyPost(note) ? (
              <TextPostTile note={note} />
            ) : null}
            {isCarouselPost(note) ? (
              <span className="cq-profile-tile-kind" aria-hidden>
                <Images className="h-3.5 w-3.5" />
              </span>
            ) : isVideoPost(note) ? (
              <span className="cq-profile-tile-kind" aria-hidden>
                <Video className="h-3.5 w-3.5" />
              </span>
            ) : null}
            <EngagementIndicator note={note} />
          </button>
        );
      })}
    </div>
  );
}
