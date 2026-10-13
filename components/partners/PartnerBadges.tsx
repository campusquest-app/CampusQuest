"use client";

import { BadgeCheck, Heart } from "lucide-react";
import type { PartnerOpenStatus as OpenStatus } from "@/lib/partners/partnerHours";

export function VerifiedPartnerBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span className="cq-perk-verified">
      <BadgeCheck className="h-3.5 w-3.5" aria-hidden strokeWidth={2.4} />
      {compact ? "CampusQuest Partner" : "Verified CampusQuest Partner"}
    </span>
  );
}

export function DiscountBadge({ value, size = "md" }: { value: string; size?: "sm" | "md" | "lg" }) {
  return <span className={`cq-perk-discount cq-perk-discount--${size}`}>{value}</span>;
}

export function RewardSoonBadge() {
  return <span className="cq-perk-discount cq-perk-discount--soon">Reward soon</span>;
}

/** "Open Now · Closes at 10 PM" with a colored dot. Neutral when hours are unknown. */
export function PartnerOpenStatus({ status, className = "" }: { status: OpenStatus; className?: string }) {
  return (
    <span className={`cq-perk-status cq-perk-status--${status.state} ${className}`.trim()}>
      <span className="cq-perk-status__dot" aria-hidden />
      <span className="cq-perk-status__label">{status.label}</span>
      {status.detail ? (
        <>
          <span className="cq-perk-status__sep" aria-hidden>
            {"\u00b7"}
          </span>
          <span className="cq-perk-status__detail">{status.detail}</span>
        </>
      ) : null}
    </span>
  );
}

export function FavoriteButton({
  saved,
  busy,
  disabled,
  partnerName,
  onToggle,
  variant = "plain",
}: {
  saved: boolean;
  busy?: boolean;
  disabled?: boolean;
  partnerName: string;
  onToggle: () => void;
  variant?: "plain" | "glass";
}) {
  return (
    <button
      type="button"
      className={`cq-perk-fav cq-perk-fav--${variant}${saved ? " cq-perk-fav--saved" : ""} cq-tap-press touch-manipulation`}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${partnerName} from saved` : `Save ${partnerName}`}
      disabled={disabled}
      aria-busy={busy || undefined}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <Heart className="h-[1.1rem] w-[1.1rem]" aria-hidden strokeWidth={2.3} fill={saved ? "currentColor" : "none"} />
    </button>
  );
}
