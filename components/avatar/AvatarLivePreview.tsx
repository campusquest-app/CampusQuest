"use client";

import { memo, useEffect, useState } from "react";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import { serializeAvatarConfig, type AvatarConfig } from "@/lib/avatarConfig";
import { getClassTitle } from "@/lib/characterClasses";

type AvatarLivePreviewProps = {
  config: AvatarConfig;
  displayName?: string;
  username?: string;
  /** Larger review-step preview */
  size?: "compact" | "default" | "hero";
  className?: string;
};

function previewPx(size: AvatarLivePreviewProps["size"]): number {
  if (size === "hero") return 148;
  if (size === "compact") return 72;
  return 112;
}

/**
 * Sticky live avatar preview. Reads only from AvatarConfig local state —
 * no network calls. Animates subtle fade/scale on config changes.
 */
export const AvatarLivePreview = memo(function AvatarLivePreview({
  config,
  displayName,
  username,
  size = "default",
  className = "",
}: AvatarLivePreviewProps) {
  const avatarJson = serializeAvatarConfig(config);
  const [pulseKey, setPulseKey] = useState(0);
  const [scrolledCompact, setScrolledCompact] = useState(false);

  useEffect(() => {
    setPulseKey((k) => k + 1);
  }, [avatarJson]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onScroll = () => {
      setScrolledCompact(window.scrollY > 48);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const px = scrolledCompact && size !== "hero" ? Math.max(64, previewPx(size) - 28) : previewPx(size);
  const classLabel = getClassTitle(config.classType);

  return (
    <div
      className={`cq-avatar-live-preview ${scrolledCompact ? "cq-avatar-live-preview--compact" : ""} ${className}`}
      data-testid="avatar-live-preview"
    >
      <div
        key={pulseKey}
        className="cq-avatar-live-preview__frame"
        style={{ width: px + 16, height: px + 16 }}
      >
        <AvatarDisplay avatar={avatarJson} size={px} showProp={false} />
      </div>
      {(displayName || username || classLabel) && (
        <div className="cq-avatar-live-preview__meta min-w-0">
          {displayName ? (
            <p className="truncate text-sm font-semibold text-white">{displayName}</p>
          ) : null}
          {username ? (
            <p className="truncate font-mono text-xs text-uri-keaney/90">@{username}</p>
          ) : null}
          {classLabel ? (
            <p className="truncate text-[11px] text-white/55">{classLabel}</p>
          ) : null}
        </div>
      )}
    </div>
  );
});
