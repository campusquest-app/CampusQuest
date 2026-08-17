"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { QuadCarouselMediaDto } from "@/lib/quadMedia";
import type { FieldNoteTag } from "@/lib/types";
import { QuadVideoPlayer } from "@/components/quad/QuadVideoPlayer";
import { FeedPhotoTags } from "@/components/quad/FeedPhotoTags";
import { ZoomableImage } from "@/components/quad/ZoomableImage";
import { formatVideoDuration } from "@/lib/quadMedia";
import { useMediaGestureLock } from "@/lib/client/useMediaGestureLock";

const AXIS_LOCK_PX = 10;
const COMMIT_RATIO = 0.22;
const COMMIT_PX = 56;

type GestureState = {
  pointerId: number | null;
  active: boolean;
  decided: boolean;
  axis: "x" | "y" | null;
  startX: number;
  startY: number;
  width: number;
};

/**
 * Multi-media post carousel that owns horizontal swipes (via pointer events +
 * media gesture lock) so global tab navigation cannot steal the gesture —
 * including at first/last slide edges.
 *
 * Does not use setPointerCapture for the whole surface so pinch-zoom on photos
 * can still receive its own pointer stream.
 */
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { acquire, release } = useMediaGestureLock();
  const [index, setIndex] = useState(Math.min(initialIndex, Math.max(0, media.length - 1)));
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [tagsVisible, setTagsVisible] = useState(false);
  const [slideScale, setSlideScale] = useState(1);
  const indexRef = useRef(index);
  const dragXRef = useRef(0);
  const mediaLenRef = useRef(media.length);
  const activePointersRef = useRef(new Set<number>());
  const gestureRef = useRef<GestureState>({
    pointerId: null,
    active: false,
    decided: false,
    axis: null,
    startX: 0,
    startY: 0,
    width: 1,
  });
  const zoomedRef = useRef(false);
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;

  useEffect(() => {
    indexRef.current = index;
    onIndexChange?.(index);
  }, [index, onIndexChange]);

  useEffect(() => {
    mediaLenRef.current = media.length;
  }, [media.length]);

  useEffect(() => {
    zoomedRef.current = slideScale > 1.01;
    if (slideScale > 1.01 && dragXRef.current !== 0) {
      dragXRef.current = 0;
      setDragX(0);
      setDragging(false);
      gestureRef.current.active = false;
    }
  }, [slideScale]);

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(media.length - 1, next));
      setIndex(clamped);
      dragXRef.current = 0;
      setDragX(0);
      setDragging(false);
      setSlideScale(1);
    },
    [media.length],
  );

  const finishGesture = useCallback(() => {
    const state = gestureRef.current;
    const width = state.width || 1;
    const dx = dragXRef.current;
    const current = indexRef.current;
    let next = current;
    if (state.axis === "x" && Math.abs(dx) >= Math.max(COMMIT_PX, width * COMMIT_RATIO)) {
      if (dx < 0 && current < mediaLenRef.current - 1) next = current + 1;
      else if (dx > 0 && current > 0) next = current - 1;
    }
    gestureRef.current = {
      pointerId: null,
      active: false,
      decided: false,
      axis: null,
      startX: 0,
      startY: 0,
      width: 1,
    };
    goTo(next);
    release();
  }, [goTo, release]);

  useEffect(() => {
    function onMove(event: PointerEvent) {
      const state = gestureRef.current;
      if (!state.active || state.pointerId !== event.pointerId) return;
      if (zoomedRef.current) {
        state.active = false;
        dragXRef.current = 0;
        setDragX(0);
        setDragging(false);
        return;
      }

      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;

      if (!state.decided) {
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > AXIS_LOCK_PX) {
          state.active = false;
          state.decided = true;
          state.axis = "y";
          setDragging(false);
          dragXRef.current = 0;
          setDragX(0);
          return;
        }
        if (Math.abs(dx) > AXIS_LOCK_PX && Math.abs(dx) > Math.abs(dy)) {
          state.decided = true;
          state.axis = "x";
          setDragging(true);
        } else {
          return;
        }
      }

      if (state.axis !== "x") return;

      const current = indexRef.current;
      let nextDx = dx;
      if ((current === 0 && dx > 0) || (current === mediaLenRef.current - 1 && dx < 0)) {
        nextDx = dx * 0.28;
      }
      dragXRef.current = nextDx;
      setDragX(nextDx);
      if (event.cancelable) event.preventDefault();
    }

    function onEnd(event: PointerEvent) {
      if (!activePointersRef.current.has(event.pointerId)) return;
      activePointersRef.current.delete(event.pointerId);

      const state = gestureRef.current;
      const isCarouselPointer = state.pointerId === event.pointerId;

      if (activePointersRef.current.size > 0) {
        if (isCarouselPointer) {
          gestureRef.current = {
            pointerId: null,
            active: false,
            decided: false,
            axis: null,
            startX: 0,
            startY: 0,
            width: 1,
          };
          dragXRef.current = 0;
          setDragX(0);
          setDragging(false);
        }
        return;
      }

      if (isCarouselPointer && state.active && state.axis === "x") {
        finishGesture();
        return;
      }
      gestureRef.current = {
        pointerId: null,
        active: false,
        decided: false,
        axis: null,
        startX: 0,
        startY: 0,
        width: 1,
      };
      dragXRef.current = 0;
      setDragX(0);
      setDragging(false);
      release();
    }

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      release();
    };
  }, [finishGesture, release]);

  const onPointerDown = (event: React.PointerEvent) => {
    if (media.length === 0 || event.button !== 0) return;

    activePointersRef.current.add(event.pointerId);
    // Always lock global tab swipe for the lifetime of a media-originated gesture.
    acquire();

    const target = event.target as HTMLElement | null;
    if (
      target?.closest?.("[data-cq-media-control='true']") ||
      target?.closest?.('[data-cq-zoomed="true"]') ||
      zoomedRef.current ||
      !event.isPrimary ||
      activePointersRef.current.size > 1
    ) {
      // Cancel any in-progress carousel drag once multi-touch / zoom / controls win.
      gestureRef.current.active = false;
      dragXRef.current = 0;
      setDragX(0);
      setDragging(false);
      if (!gestureRef.current.pointerId) {
        gestureRef.current.pointerId = event.pointerId;
      }
      return;
    }

    const width = rootRef.current?.getBoundingClientRect().width || window.innerWidth;
    gestureRef.current = {
      pointerId: event.pointerId,
      active: true,
      decided: false,
      axis: null,
      startX: event.clientX,
      startY: event.clientY,
      width,
    };
    dragXRef.current = 0;
    setDragX(0);
  };

  if (media.length === 0) return null;

  return (
    <div
      ref={rootRef}
      className="cq-quad-media-carousel relative w-full carousel"
      data-no-drawer-swipe="true"
      data-cq-horizontal-scroll="true"
      data-cq-gesture-block="swipe-tab"
      data-cq-media-carousel="true"
      style={{ touchAction: slideScale > 1.01 ? "none" : "pan-y" }}
      onPointerDown={onPointerDown}
    >
      <div
        className="cq-quad-media-track flex w-full"
        style={{
          transform: `translate3d(calc(${-index * 100}% + ${dragX}px), 0, 0)`,
          transition:
            dragging || reduceMotion
              ? "none"
              : "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)",
          willChange: "transform",
        }}
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
              className="cq-quad-media-slide relative w-full shrink-0 bg-black"
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
                    className="max-h-[min(65vh,36rem)] w-full object-cover bg-black object-center"
                  />
                ) : (
                  <div className="flex max-h-[min(70vh,720px)] min-h-[240px] w-full items-center justify-center bg-black text-white/40">
                    Video
                  </div>
                )
              ) : (
                <ZoomableImage
                  src={item.url}
                  alt=""
                  interactive={active}
                  lockGestures={false}
                  imgClassName="max-h-[min(65vh,36rem)] w-full object-cover object-center"
                  onClick={() => {
                    if (active) setTagsVisible((v) => !v);
                  }}
                  onZoomChange={(s) => {
                    if (active) setSlideScale(s);
                  }}
                  onError={(event) => {
                    const img = event.currentTarget;
                    img.onerror = null;
                    img.style.display = "none";
                    const fallback = img.closest(".cq-quad-media-slide")?.querySelector("[data-media-fallback]");
                    if (fallback instanceof HTMLElement) fallback.hidden = false;
                  }}
                />
              )}
              <div
                hidden
                data-media-fallback
                className="flex max-h-[min(70vh,720px)] min-h-[240px] w-full items-center justify-center bg-black text-sm text-white/50"
              >
                Media unavailable
              </div>
              {slideTags.length > 0 && tagsVisible && active ? (
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
          <div className="cq-quad-media-counter" aria-hidden>
            {index + 1}/{media.length}
          </div>
          <div className="flex items-center justify-center gap-1 py-2" aria-hidden>
            {media.map((item, i) => (
              <button
                key={item.id}
                type="button"
                className={`h-1.5 rounded-full transition ${
                  i === index ? "w-1.5 bg-uri-keaney" : "w-1.5 bg-white/30"
                }`}
                aria-label={`Go to media ${i + 1}`}
                onClick={() => goTo(i)}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
