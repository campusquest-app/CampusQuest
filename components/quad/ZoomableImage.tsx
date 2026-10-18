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
  const [phase, setPhase] = useState<LoadPhase>("idle");
  const [attempt, setAttempt] = useState(0);
  /** Keep last successful paint URL so rerenders / src swaps do not blank the frame. */
  const [paintedSrc, setPaintedSrc] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const activeSrc = useFallback || !sources.usesVariant ? sources.fallbackSrc : sources.src;
  const activeSrcSet = useFallback || !sources.usesVariant ? undefined : sources.srcSet;

  useEffect(() => {
    setUseFallback(false);
    setPhase(loadSrc ? "loading" : "idle");
  }, [src, loadSrc, attempt]);

  useEffect(() => {
    if (!loadSrc || !activeSrc) return;
    if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      setPhase((current) => (current === "ready" ? current : "error"));
    }, IMAGE_LOAD_TIMEOUT_MS);
    return () => {
      if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current);
    };
  }, [loadSrc, activeSrc, attempt]);

  useEffect(() => {
    if (phase === "ready" && paintedSrc) primeMediaCache(paintedSrc);
  }, [phase, paintedSrc]);

  function retry() {
    setUseFallback(false);
    setAttempt((n) => n + 1);
    setPhase("loading");
  }

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
          opacity: phase === "error" && !paintedSrc ? 0 : 1,
        }}
        onLoad={(event) => {
          setPhase("ready");
          setPaintedSrc(event.currentTarget.currentSrc || activeSrc);
          onLoad?.(event);
        }}
        onError={(event) => {
          if (!useFallback && sources.usesVariant && sources.fallbackSrc !== activeSrc) {
            setUseFallback(true);
            setPhase("loading");
            return;
          }
          setPhase("error");
          onError?.(event);
        }}
      />

      {loadSrc && phase === "loading" && !paintedSrc ? (
        <div className="cq-quad-media-status" aria-hidden>
          <span className="cq-quad-media-spinner" />
        </div>
      ) : null}

      {loadSrc && phase === "error" ? (
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
