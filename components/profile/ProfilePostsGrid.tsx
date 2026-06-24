"use client";

import type { FieldNote } from "@/lib/types";
import { getPostThumbnailUrl, isTextOnlyPost } from "./profilePostUtils";
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
      {note.nodCount > 0 ? (
        <span className="mt-1 self-end text-[10px] font-semibold text-white/60">♥ {note.nodCount}</span>
      ) : null}
    </div>
  );
}

export function ProfilePostsGrid({
  posts,
  loading,
  error,
  onRetry,
  onSelectPost,
}: {
  posts: FieldNote[];
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  onSelectPost: (note: FieldNote) => void;
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
          message="No posts yet"
          detail="Share campus moments on The Quad to fill your grid."
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
            className="cq-profile-post-tile group relative aspect-square overflow-hidden bg-cq-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-uri-keaney focus-visible:ring-offset-2"
            aria-label={`View post from ${note.authorName}`}
          >
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="" className="h-full w-full object-cover transition duration-200 group-active:scale-[0.98]" loading="lazy" decoding="async" fetchPriority="low" />
            ) : isTextOnlyPost(note) ? (
              <TextPostTile note={note} />
            ) : null}
            {(note.nodCount > 0 || note.hypeCount > 0) && thumb ? (
              <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/45 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                ♥ {note.nodCount}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
