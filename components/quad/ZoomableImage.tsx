"use client";

import { TemporaryPinchSurface } from "@/components/quad/TemporaryPinchSurface";

export type ZoomableImageProps = {
  src: string;
  alt?: string;
  className?: string;
  imgClassName?: string;
  /** When false, image is display-only (e.g. offscreen carousel slide). */
  interactive?: boolean;
  /** When false, parent owns media gesture lock for one-finger swipes. Default true. */
  lockGestures?: boolean;
  /**
   * @deprecated Double-tap zoom is intentionally disabled (feed uses double-tap to like).
   * Kept for call-site compatibility; ignored.
   */
  enableDoubleTapZoom?: boolean;
  onClick?: () => void;
  onZoomChange?: (scale: number) => void;
  /** True while pinching or animating reset — parent should lock carousel. */
  onPinchActiveChange?: (active: boolean) => void;
  onError?: (event: React.SyntheticEvent<HTMLImageElement>) => void;
};

/**
 * Feed photo with Instagram-style temporary pinch-to-zoom.
 * Zoom exists only while two fingers are down; release always snaps back to 1x.
 */
export function ZoomableImage({
  src,
  alt = "",
  className = "",
  imgClassName = "",
  interactive = true,
  lockGestures = true,
  onClick,
  onZoomChange,
  onPinchActiveChange,
  onError,
}: ZoomableImageProps) {
  return (
    <TemporaryPinchSurface
      className={`cq-zoomable-image ${className}`.trim()}
      interactive={interactive}
      lockGestures={lockGestures}
      onClick={onClick}
      onScaleChange={onZoomChange}
      onActiveChange={onPinchActiveChange}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        className={`cq-zoomable-image-img ${imgClassName}`.trim()}
        onError={onError}
      />
    </TemporaryPinchSurface>
  );
}
