"use client";

import { AvatarDisplay } from "@/components/AvatarDisplay";
import type { QuadPostLikerPreview } from "@/lib/quadFieldNote";

const AVATAR_SIZE = 26;
const OVERLAP_PX = 8;

type LikedByRowProps = {
  preview: QuadPostLikerPreview[];
  likeCount: number;
  onOpenLikers: () => void;
};

export function LikedByRow({ preview, likeCount, onOpenLikers }: LikedByRowProps) {
  if (likeCount <= 0) return null;

  const avatars = preview.slice(0, 3);
  const named = preview[0];
  const second = preview[1];
  const othersCount = Math.max(0, likeCount - 1);

  return (
    <button
      type="button"
      onClick={onOpenLikers}
      className="cq-feed-liked-by touch-manipulation text-left"
      aria-label={
        likeCount === 1 && named
          ? `Liked by ${named.username}`
          : likeCount === 2 && named && second
            ? `Liked by ${named.username} and ${second.username}`
            : named
              ? `Liked by ${named.username} and ${othersCount} others`
              : `${likeCount} likes`
      }
    >
      {avatars.length > 0 ? (
        <span className="cq-feed-liked-by-avatars" aria-hidden>
          {avatars.map((liker, index) => (
            <span
              key={liker.userId}
              className="cq-feed-liked-by-avatar"
              style={{
                zIndex: avatars.length - index,
                marginLeft: index === 0 ? 0 : -OVERLAP_PX,
                width: AVATAR_SIZE,
                height: AVATAR_SIZE,
              }}
            >
              <AvatarDisplay avatar={liker.avatar} fitParent size={AVATAR_SIZE} />
            </span>
          ))}
        </span>
      ) : null}

      <span className="cq-feed-liked-by-text">
        {likeCount === 1 && named ? (
          <>
            Liked by <span className="cq-feed-liked-by-strong">{named.username}</span>
          </>
        ) : likeCount === 2 && named && second ? (
          <>
            Liked by <span className="cq-feed-liked-by-strong">{named.username}</span>
            {" and "}
            <span className="cq-feed-liked-by-strong">{second.username}</span>
          </>
        ) : named ? (
          <>
            Liked by <span className="cq-feed-liked-by-strong">{named.username}</span>
            {" and "}
            <span className="cq-feed-liked-by-strong">
              {othersCount} other{othersCount === 1 ? "" : "s"}
            </span>
          </>
        ) : (
          <>
            Liked by{" "}
            <span className="cq-feed-liked-by-strong">
              {likeCount} other{likeCount === 1 ? "" : "s"}
            </span>
          </>
        )}
      </span>
    </button>
  );
}
