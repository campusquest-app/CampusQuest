"use client";

import { useEffect, useMemo, useState } from "react";
import { User } from "lucide-react";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import {
  normalizeUserAvatarFields,
  userAvatarInitials,
  type NormalizeUserAvatarInput,
  type UserAvatarType,
} from "@/lib/userAvatar";

export type UserAvatarSizeVariant = "podium1" | "podium2" | "podium3" | "row" | "compact" | "sm";

const SIZE_PX: Record<UserAvatarSizeVariant, number> = {
  podium1: 72,
  podium2: 64,
  podium3: 64,
  row: 54,
  compact: 40,
  sm: 32,
};

export type UserAvatarProps = NormalizeUserAvatarInput & {
  /** Pixel size, or a leaderboard size variant. */
  size?: number | UserAvatarSizeVariant;
  className?: string;
  /** Accessible name; defaults to displayName / username. */
  alt?: string;
};

function resolveSize(size: number | UserAvatarSizeVariant | undefined): number {
  if (size == null) return SIZE_PX.row;
  if (typeof size === "number") return Math.max(16, Math.round(size));
  return SIZE_PX[size] ?? SIZE_PX.row;
}

/**
 * Single reusable avatar for leaderboards (and similar dense lists).
 * Never leaves a blank circle — photo → custom → initials → icon.
 */
export function UserAvatar({
  size = "row",
  className = "",
  alt,
  displayName,
  username,
  profileImageUrl,
  avatar_url,
  avatarImageUrl,
  avatar_custom_json,
  avatar,
}: UserAvatarProps) {
  const px = resolveSize(size);
  const normalized = useMemo(
    () =>
      normalizeUserAvatarFields({
        displayName,
        username,
        profileImageUrl,
        avatar_url,
        avatarImageUrl,
        avatar_custom_json,
        avatar,
      }),
    [displayName, username, profileImageUrl, avatar_url, avatarImageUrl, avatar_custom_json, avatar],
  );

  const [photoFailed, setPhotoFailed] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(Boolean(normalized.profileImageUrl));

  // Reset image state when the photo URL changes (new user / refreshed URL).
  useEffect(() => {
    setPhotoFailed(false);
    setPhotoLoading(Boolean(normalized.profileImageUrl));
  }, [normalized.profileImageUrl]);

  const showPhoto = Boolean(normalized.profileImageUrl) && !photoFailed;
  const showCustom = !showPhoto && Boolean(normalized.avatarImageUrl);
  const initials = userAvatarInitials(normalized.displayName, normalized.username);
  const showInitials = !showPhoto && !showCustom && Boolean(initials);
  const label =
    alt?.trim() ||
    normalized.displayName ||
    (normalized.username ? `@${normalized.username}` : "User avatar");

  const fontSize = Math.max(11, Math.round(px * 0.36));

  return (
    <span
      className={`cq-user-avatar ${className}`.trim()}
      style={{
        width: px,
        height: px,
        minWidth: px,
        minHeight: px,
        aspectRatio: "1 / 1",
        borderRadius: 9999,
        overflow: "hidden",
        flexShrink: 0,
      }}
      role="img"
      aria-label={label}
      data-avatar-type={
        showPhoto ? "photo" : showCustom ? "custom" : showInitials ? "initials" : "icon"
      }
    >
      {showPhoto && normalized.profileImageUrl ? (
        <>
          {photoLoading ? <span className="cq-user-avatar__placeholder" aria-hidden /> : null}
          {/* eslint-disable-next-line @next/next/no-img-element -- remote profile URLs; not Next Image hosts */}
          <img
            key={normalized.profileImageUrl}
            src={normalized.profileImageUrl}
            alt=""
            className="cq-user-avatar__img cq-user-avatar__img--cover"
            draggable={false}
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth === 0 || img.naturalHeight === 0) {
                setPhotoFailed(true);
                setPhotoLoading(false);
                return;
              }
              setPhotoLoading(false);
            }}
            onError={() => {
              setPhotoFailed(true);
              setPhotoLoading(false);
            }}
          />
        </>
      ) : null}

      {showCustom && normalized.avatarImageUrl ? (
        <span className="cq-user-avatar__custom">
          <AvatarDisplay avatar={normalized.avatarImageUrl} fitParent size={px} showProp={false} />
        </span>
      ) : null}

      {showInitials && initials ? (
        <span className="cq-user-avatar__initials" style={{ fontSize }} aria-hidden>
          {initials}
        </span>
      ) : null}

      {!showPhoto && !showCustom && !showInitials ? (
        <span className="cq-user-avatar__icon" aria-hidden>
          <User style={{ width: px * 0.48, height: px * 0.48 }} strokeWidth={2.1} />
        </span>
      ) : null}
    </span>
  );
}

export type { UserAvatarType };
