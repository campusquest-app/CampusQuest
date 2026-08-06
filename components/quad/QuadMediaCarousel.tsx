"use client";

import { useEffect, useRef, useState } from "react";
import type { QuadCarouselMediaDto } from "@/lib/quadMedia";
import type { FieldNoteTag } from "@/lib/types";
import { QuadVideoPlayer } from "@/components/quad/QuadVideoPlayer";
import { FeedPhotoTags } from "@/components/quad/FeedPhotoTags";
import { formatVideoDuration } from "@/lib/quadMedia";

export function QuadMediaCarousel({
  postId,
  media,
  tags = [],
  isFeed = true,
  initialIndex = 0,
  onIndexChange,
}: {
  postId: string;
  media: QuadCarouselMediaDto[];
  tags?: FieldNoteTag[];
  isFeed?: boolean;
  initialIndex?: number;
  onIndexChange?: (index: number) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(Math.min(initialIndex, Math.max(0, media.length - 1)));
  const [tagsVisible, setTagsVisible] = useState(false);
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;

  useEffect(() => {
    onIndexChange?.(index);
  }, [index, onIndexChange]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const slide = el.children[index] as HTMLElement | undefined;
    if (slide) {
      el.scrollTo({ left: slide.offsetLeft, behavior: reduceMotion ? "auto" : "smooth" });
    }
  }, [index, reduceMotion]);

  if (media.length === 0) return null;

  function onScroll() {
    const el = scrollerRef.current;
    if (!el || el.clientWidth <= 0) return;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    if (next !== index && next >= 0 && next < media.length) setIndex(next);
  }

  return (
    <div className="relative w-full" data-no-drawer-swipe="true">
      <div
        ref={scrollerRef}
        className="flex w-full snap-x snap-mandatory overflow-x-auto scrollbar-none"
        style={{ WebkitOverflowScrolling: "touch" }}
        onScroll={onScroll}
        role="region"
        aria-roledescription="carousel"
        aria-label={`Post media, ${index + 1} of ${media.length}`}
      >
        {media.map((item, i) => {
          const active = i === index;
          const nearby = Math.abs(i - index) <= 1;
          const slideTags = tags.filter(
            (t) =>
              t.tagSource === "photo" &&
              (t.mediaKey === item.id || (i === 0 && (!t.mediaKey || t.mediaKey === "primary"))),
          );
          const label =
            item.mediaType === "video"
              ? `Video ${i + 1} of ${media.length}${
                  item.durationSeconds ? `, ${formatVideoDuration(item.durationSeconds)}` : ""
                }`
              : `Photo ${i + 1} of ${media.length}`;

          return (
            <div
              key={item.id}
              className="relative w-full shrink-0 snap-center snap-always bg-black"
              aria-label={label}
              aria-hidden={!active}
            >
              {item.mediaType === "video" ? (
                nearby ? (
                  <QuadVideoPlayer
                    playerId={`${postId}:${item.id}`}
                    src={item.url}
                    poster={item.thumbnailUrl}
                    durationSeconds={item.durationSeconds}
                    autoplayWhenVisible={isFeed && active}
                    showMuteControl={item.hasAudio !== false}
                  />
                ) : item.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.thumbnailUrl}
                    alt=""
                    className="max-h-[min(70vh,720px)] w-full object-contain bg-black"
                  />
                ) : (
                  <div className="flex max-h-[min(70vh,720px)] min-h-[240px] w-full items-center justify-center bg-black text-white/40">
                    Video
                  </div>
                )
              ) : (
                <button
                  type="button"
                  className="block w-full"
                  onClick={() => setTagsVisible((v) => !v)}
                  aria-label={label}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.url}
                    alt=""
                    loading={nearby ? "eager" : "lazy"}
                    className="max-h-[min(70vh,720px)] w-full object-contain"
                  />
                </button>
              )}
              {slideTags.length > 0 && tagsVisible ? (
                <FeedPhotoTags
                  postId={postId}
                  tags={slideTags}
                  visible
                  canReposition={false}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      {media.length > 1 ? (
        <>
          <div className="pointer-events-none absolute right-3 top-3 rounded bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">
            {index + 1}/{media.length}
          </div>
          <div className="flex items-center justify-center gap-1.5 py-2" aria-hidden>
            {media.map((item, i) => (
              <button
                key={item.id}
                type="button"
                className={`h-1.5 rounded-full transition ${
                  i === index ? "w-4 bg-uri-keaney" : "w-1.5 bg-white/35"
                }`}
                aria-label={`Go to media ${i + 1}`}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
