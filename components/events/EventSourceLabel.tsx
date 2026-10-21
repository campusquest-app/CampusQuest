"use client";

import { formatHostedByLabel, isVerifiedEventHostName, truncateEventHostName } from "@/lib/client/eventHostPresentation";

/**
 * Compact host line for event cards. Provider source chips (URInvolved, etc.)
 * are not shown here — use eventSourceLabel only for attribution elsewhere.
 */
export function EventSourceLabel({
  hostName,
  source,
  className = "text-[10px] font-medium tracking-wide text-violet-200/70",
  compact = true,
}: {
  hostName?: string | null;
  source?: string | null;
  className?: string;
  compact?: boolean;
}) {
  if (!isVerifiedEventHostName(hostName, source)) return null;
  const display = compact ? truncateEventHostName(hostName!.trim()) : hostName!.trim();
  return (
    <span className={className} title={hostName!.trim()}>
      {formatHostedByLabel(display)}
    </span>
  );
}
