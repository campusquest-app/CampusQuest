"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TemporaryPinchSurface } from "@/components/quad/TemporaryPinchSurface";
import { buildQuadFeedImageSources } from "@/lib/client/quadFeedImageUrl";
import { feedMediaFrameStyle } from "@/lib/client/quadFeedMediaLayout";
import { primeMediaCache } from "@/lib/client/quadMediaCache";

export type ZoomableImageProps = {
  src: string;
  alt?: string;
  className?: string;
  imgClassName?: string;
  /** Intrinsic pixels — reserve aspect ratio before decode. */
  width?: number | null;
  height?: number | null;
  /** When false, image is display-only (e.g. offscreen carousel slide). */
  interactive?: boolean;
  /** When false, parent owns media gesture lock for one-finger swipes. Default true. */
  lockGestures?: boolean;
  /**
   * @deprecated Double-tap zoom is intentionally disabled (feed uses double-tap to like).
   * Kept for call-site compatibility; ignored.
   */
  enableDoubleTapZoom?: boolean;
  /** Eager + high fetch priority for the first visible feed media. */
  priority?: boolean;
  /** When false, do not attach src yet (near-viewport gate). Keeps aspect placeholder. */
  loadSrc?: boolean;
  /** When true, fill a parent that already reserved aspect-ratio (carousel slide). */
  fillParent?: boolean;
  onClick?: () => void;
  onZoomChange?: (scale: number) => void;
  /** True while pinching or animating reset — parent should lock carousel. */
  onPinchActiveChange?: (active: boolean) => void;
  onError?: (event: React.SyntheticEvent<HTMLImageElement>) => void;
  onLoad?: (event: React.SyntheticEvent<HTMLImageElement>) => void;
  /** Optional override; defaults from `priority` when omitted. */
  loading?: "eager" | "lazy";
  /** Optional override; defaults from `priority` when omitted. */
  fetchPriority?: "high" | "low" | "auto";
};

type LoadPhase = "idle" | "loading" | "ready" | "error";

const IMAGE_LOAD_TIMEOUT_MS = 18_000;

function imageElementIsUsable(img: HTMLImageElement | null): boolean {
  return Boolean(img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0);
}

/**
 * Feed photo with Instagram-style temporary pinch-to-zoom.
 * Zoom exists only while two fingers are down; release always snaps back to 1x.
 */
export function ZoomableImage({
  src,
  alt = "",
  className = "",
  imgClassName = "",
  width = null,
  height = null,
  interactive = true,
  lockGestures = true,
  priority = false,
  loadSrc = true,
  fillParent = false,
  onClick,
  onZoomChange,
  onPinchActiveChange,
  onError,
  onLoad,
  loading,
  fetchPriority,
}: ZoomableImageProps) {
  const frameStyle = useMemo(
    () => feedMediaFrameStyle(width, height, { fillParent }),
    [width, height, fillParent],
  );
  const sources = useMemo(
    () => buildQuadFeedImageSources(src, { displayWidthPx: 390 }),
    [src],
  );
  const [useFallback, setUseFallback] = useState(false);
  const [phase, setPhase] = useState<LoadPhase>(loadSrc ? "loading" : "idle");
  const [attempt, setAttempt] = useState(0);
  /** Keep last successful paint URL so rerenders / src swaps do not blank the frame. */
  const [paintedSrc, setPaintedSrc] = useState<string | null>(null);
  const paintedSrcRef = useRef<string | null>(null);
  const paintedForLogicalSrcRef = useRef<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const loadGenerationRef = useRef(0);

  const activeSrc = useFallback || !sources.usesVariant ? sources.fallbackSrc : sources.src;
  const activeSrcSet = useFallback || !sources.usesVariant ? undefined : sources.srcSet;
  const hasUsablePaint =
    paintedSrc != null && paintedForLogicalSrcRef.current === src;

  useEffect(() => {
    paintedSrcRef.current = paintedSrc;
  }, [paintedSrc]);

  // Logical media URL changed — drop prior frame and restart load bookkeeping.
  useEffect(() => {
    paintedForLogicalSrcRef.current = null;
    paintedSrcRef.current = null;
    setPaintedSrc(null);
    setUseFallback(false);
    setPhase(loadSrc ? "loading" : "idle");
    loadGenerationRef.current += 1;
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps -- loadSrc handled below

  // Gate / retry: never wipe a good frame for this src; only show spinner when empty.
  useEffect(() => {
    if (!loadSrc) {
      setPhase((current) => (paintedSrcRef.current && paintedForLogicalSrcRef.current === src ? "ready" : "idle"));
      return;
    }
    const gen = ++loadGenerationRef.current;
    const img = imgRef.current;
    if (imageElementIsUsable(img)) {
      const painted = img!.currentSrc || activeSrc;
      paintedForLogicalSrcRef.current = src;
      paintedSrcRef.current = painted;
      setPaintedSrc(painted);
      setPhase("ready");
      return;
    }
    if (paintedSrcRef.current && paintedForLogicalSrcRef.current === src) {
      // Keep last good paint while a new attempt resolves (variant → fallback / retry).
      setPhase("loading");
      return;
    }
    setPhase("loading");
    // Generation capture avoids stale timeout/error after unmount or src change.
    void gen;
  }, [loadSrc, attempt, src, activeSrc]);

  useEffect(() => {
    if (!loadSrc || !activeSrc) return;
    if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current);
    const gen = loadGenerationRef.current;
    timeoutRef.current = window.setTimeout(() => {
      if (gen !== loadGenerationRef.current) return;
      const img = imgRef.current;
      if (imageElementIsUsable(img)) {
        const painted = img!.currentSrc || activeSrc;
        paintedForLogicalSrcRef.current = src;
        paintedSrcRef.current = painted;
        setPaintedSrc(painted);
        setPhase("ready");
        return;
      }
      // Failed preload / slow variant must not overlay a frame that already painted.
      if (paintedSrcRef.current && paintedForLogicalSrcRef.current === src) {
        setPhase("ready");
        return;
      }
      setPhase((current) => (current === "ready" ? current : "error"));
    }, IMAGE_LOAD_TIMEOUT_MS);
    return () => {
      if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current);
    };
  }, [loadSrc, activeSrc, attempt, src]);

  useEffect(() => {
    if (phase === "ready" && paintedSrc) primeMediaCache(paintedSrc);
  }, [phase, paintedSrc]);

  function retry() {
    setUseFallback(false);
    setAttempt((n) => n + 1);
  }

  const showSpinner = loadSrc && phase === "loading" && !hasUsablePaint;
  // Only surface Retry when nothing usable is on screen for this post media.
  const showError = loadSrc && phase === "error" && !hasUsablePaint;

  return (
    <TemporaryPinchSurface
      className={`cq-zoomable-image ${className}`.trim()}
      style={frameStyle}
      interactive={interactive}
      lockGestures={lockGestures}
      onClick={onClick}
      onScaleChange={onZoomChange}
      onActiveChange={onPinchActiveChange}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        key={`${attempt}:${useFallback ? "fb" : "var"}:${src}`}
        src={loadSrc ? activeSrc : undefined}
        srcSet={loadSrc ? activeSrcSet : undefined}
        sizes={loadSrc ? sources.sizes : undefined}
        alt={alt}
        width={typeof width === "number" && width > 0 ? Math.round(width) : undefined}
        height={typeof height === "number" && height > 0 ? Math.round(height) : undefined}
        draggable={false}
        loading={loading ?? (priority ? "eager" : "lazy")}
        decoding={priority ? "sync" : "async"}
        fetchPriority={fetchPriority ?? (priority ? "high" : "auto")}
        className={`cq-zoomable-image-img cq-quad-feed-media ${imgClassName}`.trim()}
        style={{
          // Keep last frame visible under a failed/pending swap when possible.
          opacity: showError ? 0 : 1,
        }}
        onLoad={(event) => {
          const el = event.currentTarget;
          if (!imageElementIsUsable(el)) return;
          const painted = el.currentSrc || activeSrc;
          paintedForLogicalSrcRef.current = src;
          paintedSrcRef.current = painted;
          setPaintedSrc(painted);
          setPhase("ready");
          onLoad?.(event);
        }}
        onError={(event) => {
          // Optimized / srcSet candidate failed — try original once.
          if (!useFallback && sources.usesVariant && sources.fallbackSrc !== activeSrc) {
            setUseFallback(true);
            // Do not flip to error: keep any painted frame; spinner only if none.
            setPhase((current) =>
              paintedSrcRef.current && paintedForLogicalSrcRef.current === src
                ? current === "error"
                  ? "ready"
                  : current
                : "loading",
            );
            return;
          }
          // Genuine failure: only error when nothing usable is painted for this src.
          if (paintedSrcRef.current && paintedForLogicalSrcRef.current === src) {
            setPhase("ready");
            return;
          }
          if (imageElementIsUsable(event.currentTarget)) {
            const painted = event.currentTarget.currentSrc || activeSrc;
            paintedForLogicalSrcRef.current = src;
            paintedSrcRef.current = painted;
            setPaintedSrc(painted);
            setPhase("ready");
            return;
          }
          setPhase("error");
          onError?.(event);
        }}
      />

      {showSpinner ? (
        <div className="cq-quad-media-status" aria-hidden>
          <span className="cq-quad-media-spinner" />
        </div>
      ) : null}

      {showError ? (
        <div className="cq-quad-media-status cq-quad-media-status--error" role="status">
          <p className="cq-quad-media-status__text">Couldn’t load photo</p>
          <button
            type="button"
            className="cq-quad-media-status__retry"
            data-cq-media-control="true"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              retry();
            }}
          >
            Retry
          </button>
        </div>
      ) : null}
    </TemporaryPinchSurface>
  );
}
