"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { QuadCarouselMediaDto } from "@/lib/quadMedia";
import {
  clampCarouselIndex,
  filterRenderableCarouselMedia,
  QUAD_MEDIA_COUNTER_HIDE_MS,
  resolveCarouselDotWindow,
} from "@/lib/quadMedia";
import type { FieldNoteTag } from "@/lib/types";
import { QuadVideoPlayer } from "@/components/quad/QuadVideoPlayer";
import { FeedPhotoTags } from "@/components/quad/FeedPhotoTags";
import { ZoomableImage } from "@/components/quad/ZoomableImage";
import { TemporaryPinchSurface } from "@/components/quad/TemporaryPinchSurface";
import { formatVideoDuration } from "@/lib/quadMedia";
import { useMediaGestureLock } from "@/lib/client/useMediaGestureLock";

const AXIS_LOCK_PX = 10;
const COMMIT_RATIO = 0.22;
const COMMIT_PX = 56;

const FEED_MEDIA_IMG_CLASS = "cq-quad-feed-media w-full object-contain object-center bg-black";

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
 * Failed/missing media is dropped from the visible slide list (never shown as
 * a full-height "Media unavailable" placeholder).
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
  const mediaSignature = useMemo(() => media.map((item) => `${item.id}:${item.url}`).join("|"), [media]);
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());
  const visibleMedia = useMemo(() => {
    return filterRenderableCarouselMedia(media).filter((item) => !failedIds.has(item.id));
  }, [media, failedIds]);
  const [index, setIndex] = useState(() =>
    clampCarouselIndex(initialIndex, filterRenderableCarouselMedia(media).length),
  );
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [tagsVisible, setTagsVisible] = useState(false);
  const [slideScale, setSlideScale] = useState(1);
  const [pinchActive, setPinchActive] = useState(false);
  const [counterVisible, setCounterVisible] = useState(false);
  const indexRef = useRef(index);
  const dragXRef = useRef(0);
  const mediaLenRef = useRef(visibleMedia.length);
  const counterTimerRef = useRef<number | null>(null);
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

  const clearCounterTimer = useCallback(() => {
    if (counterTimerRef.current != null) {
      window.clearTimeout(counterTimerRef.current);
      counterTimerRef.current = null;
    }
  }, []);

  const bumpCounter = useCallback(() => {
    if (mediaLenRef.current <= 1) {
      setCounterVisible(false);
      clearCounterTimer();
      return;
    }
    setCounterVisible(true);
    clearCounterTimer();
    counterTimerRef.current = window.setTimeout(() => {
      setCounterVisible(false);
      counterTimerRef.current = null;
    }, QUAD_MEDIA_COUNTER_HIDE_MS);
  }, [clearCounterTimer]);

  useEffect(() => {
    // New media payload (different post / refreshed list) clears runtime failures.
    setFailedIds(new Set());
  }, [mediaSignature]);

  useEffect(() => {
    indexRef.current = index;
    onIndexChange?.(index);
  }, [index, onIndexChange]);

  useEffect(() => {
    mediaLenRef.current = visibleMedia.length;
    setIndex((current) => clampCarouselIndex(current, visibleMedia.length));
  }, [visibleMedia.length]);

  useEffect(() => {
    zoomedRef.current = pinchActive || slideScale > 1.01;
    if (zoomedRef.current && dragXRef.current !== 0) {
      dragXRef.current = 0;
      setDragX(0);
      setDragging(false);
      gestureRef.current.active = false;
    }
  }, [pinchActive, slideScale]);

  // Show / restart counter whenever the active slide changes (incl. initial).
  useEffect(() => {
    if (visibleMedia.length <= 1) {
      setCounterVisible(false);
      clearCounterTimer();
      return;
    }
    bumpCounter();
  }, [index, visibleMedia.length, bumpCounter, clearCounterTimer]);

  // Reveal counter again as soon as a horizontal swipe is underway.
  useEffect(() => {
    if (dragging && visibleMedia.length > 1) bumpCounter();
  }, [dragging, visibleMedia.length, bumpCounter]);

  // Reveal when the post becomes substantially visible in the feed.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || visibleMedia.length <= 1) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.45)) {
          bumpCounter();
        }
      },
      { threshold: [0.45, 0.7] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visibleMedia.length, bumpCounter, mediaSignature]);

  useEffect(() => () => clearCounterTimer(), [clearCounterTimer]);

  const onMediaPinchActive = useCallback((active: boolean) => {
    setPinchActive(active);
    if (!active) setSlideScale(1);
  }, []);

  const markFailed = useCallback(
    (mediaId: string) => {
      if (process.env.NODE_ENV === "development") {
        console.warn("[cq:quad-media] carousel item failed to load", { postId, mediaId });
      }
      setFailedIds((prev) => {
        if (prev.has(mediaId)) return prev;
        const next = new Set(prev);
        next.add(mediaId);
        return next;
      });
    },
    [postId],
  );

  const goTo = useCallback((next: number) => {
    const clamped = clampCarouselIndex(next, mediaLenRef.current);
    setIndex(clamped);
    dragXRef.current = 0;
    setDragX(0);
    setDragging(false);
    setSlideScale(1);
    setPinchActive(false);
  }, []);

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
    if (visibleMedia.length === 0 || event.button !== 0) return;

    activePointersRef.current.add(event.pointerId);
    acquire();

    const target = event.target as HTMLElement | null;
    if (
      target?.closest?.("[data-cq-media-control='true']") ||
      target?.closest?.('[data-cq-zoomed="true"]') ||
      zoomedRef.current ||
      !event.isPrimary ||
      activePointersRef.current.size > 1
    ) {
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

  const dotState = useMemo(
    () => resolveCarouselDotWindow(index, visibleMedia.length),
    [index, visibleMedia.length],
  );

  if (visibleMedia.length === 0) return null;

  const multi = visibleMedia.length > 1;

  return (
    <div
      ref={rootRef}
      className="cq-quad-media-carousel relative w-full carousel"
      data-no-drawer-swipe="true"
      data-cq-horizontal-scroll="true"
      data-cq-gesture-block="swipe-tab"
      data-cq-media-carousel="true"
      style={{ touchAction: pinchActive || slideScale > 1.01 ? "none" : "pan-y" }}
      data-cq-pinch-lock={pinchActive ? "true" : "false"}
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
        aria-label={`Post media, ${index + 1} of ${visibleMedia.length}`}
      >
        {visibleMedia.map((item, i) => {
          const active = i === index;
          const nearby = Math.abs(i - index) <= 1;
          const slideTags = tags.filter(
            (t) =>
              t.tagSource === "photo" &&
              (t.mediaKey === item.id || (i === 0 && (!t.mediaKey || t.mediaKey === "primary"))),
          );
          const label =
            item.mediaType === "video"
              ? `Video ${i + 1} of ${visibleMedia.length}${
                  item.durationSeconds ? `, ${formatVideoDuration(item.durationSeconds)}` : ""
                }`
              : `Photo ${i + 1} of ${visibleMedia.length}`;

          return (
            <div
              key={item.id}
              className="cq-quad-media-slide relative w-full shrink-0 bg-black"
              aria-label={label}
              aria-hidden={!active}
            >
              {item.mediaType === "video" ? (
                nearby ? (
                  <TemporaryPinchSurface
                    interactive={active}
                    lockGestures={false}
                    onActiveChange={(activePinch) => {
                      if (active) onMediaPinchActive(activePinch);
                    }}
                    onScaleChange={(s) => {
                      if (active) setSlideScale(s);
                    }}
                  >
                    <QuadVideoPlayer
                      playerId={`${postId}:${item.id}`}
                      src={item.url}
                      poster={item.thumbnailUrl}
                      durationSeconds={item.durationSeconds}
                      autoplayWhenVisible={isFeed && active}
                      showMuteControl={item.hasAudio !== false}
                      className="cq-quad-feed-media-frame"
                      onError={() => markFailed(item.id)}
                    />
                  </TemporaryPinchSurface>
                ) : item.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.thumbnailUrl}
                    alt=""
                    className={FEED_MEDIA_IMG_CLASS}
                    onError={() => markFailed(item.id)}
                  />
                ) : (
                  <QuadVideoPlayer
                    playerId={`${postId}:${item.id}:lazy`}
                    src={item.url}
                    poster={item.thumbnailUrl}
                    durationSeconds={item.durationSeconds}
                    autoplayWhenVisible={false}
                    showMuteControl={item.hasAudio !== false}
                    className="cq-quad-feed-media-frame"
                    onError={() => markFailed(item.id)}
                  />
                )
              ) : (
                <ZoomableImage
                  src={item.url}
                  alt=""
                  interactive={active}
                  lockGestures={false}
                  enableDoubleTapZoom={false}
                  imgClassName={FEED_MEDIA_IMG_CLASS}
                  onClick={() => {
                    if (active) setTagsVisible((v) => !v);
                  }}
                  onPinchActiveChange={(activePinch) => {
                    if (active) onMediaPinchActive(activePinch);
                  }}
                  onZoomChange={(s) => {
                    if (active) setSlideScale(s);
                  }}
                  onError={() => markFailed(item.id)}
                />
              )}
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

      {multi ? (
        <div
          className={`cq-quad-media-counter${counterVisible ? " cq-quad-media-counter--visible" : ""}`}
          aria-hidden
        >
          {index + 1}/{visibleMedia.length}
        </div>
      ) : null}

      {multi ? (
        <div className="cq-quad-media-dots" aria-hidden="true">
          {Array.from({ length: dotState.visibleCount }).map((_, i) => {
            const active = i === dotState.activeDot;
            const edgeShrink =
              (dotState.shrinkLeading && i === 0 && !active) ||
              (dotState.shrinkTrailing && i === dotState.visibleCount - 1 && !active);
            return (
              <span
                key={i}
                className={`cq-quad-media-dot${active ? " cq-quad-media-dot--active" : ""}${
                  edgeShrink ? " cq-quad-media-dot--edge" : ""
                }`}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
