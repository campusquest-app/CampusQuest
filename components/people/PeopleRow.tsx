"use client";

import type { ReactNode } from "react";
import { AvatarDisplay } from "@/components/AvatarDisplay";

export function PeopleRow({
  avatar,
  displayName,
  username,
  subtitle,
  onOpenProfile,
  actions,
  skeleton = false,
}: {
  avatar?: string;
  displayName: string;
  username: string;
  subtitle?: string | null;
  onOpenProfile?: () => void;
  actions?: ReactNode;
  skeleton?: boolean;
}) {
  if (skeleton) {
    return (
      <li className="cq-people-row" aria-hidden>
        <div className="cq-people-row-avatar cq-people-skeleton-circle" />
        <div className="cq-people-row-text">
          <div className="cq-people-skeleton-line cq-people-skeleton-line--name" />
          <div className="cq-people-skeleton-line cq-people-skeleton-line--user" />
        </div>
        <div className="cq-people-skeleton-btn" />
      </li>
    );
  }

  const identity = (
    <>
      <div className="cq-people-row-avatar">
        <AvatarDisplay avatar={avatar ?? ""} fitParent size={48} />
      </div>
      <div className="cq-people-row-text">
        <p className="cq-people-row-name">{displayName}</p>
        <p className="cq-people-row-username">@{username}</p>
        {subtitle ? <p className="cq-people-row-meta">{subtitle}</p> : null}
      </div>
    </>
  );

  return (
    <li className="cq-people-row">
      {onOpenProfile ? (
        <button
          type="button"
          className="cq-people-row-main"
          onClick={onOpenProfile}
          aria-label={`View ${displayName}'s profile`}
        >
          {identity}
        </button>
      ) : (
        <div className="cq-people-row-main">{identity}</div>
      )}
      {actions ? <div className="cq-people-row-actions">{actions}</div> : null}
    </li>
  );
}
