"use client";

import { memo } from "react";
import type { GroupCountdown } from "@/lib/realm/eventCountdown";

/**
 * Floating game-style countdown badge above an event marker.
 * Urgency drives pulse speed/glow via CSS; cancelled shows a muted red badge.
 */
export const EventCountdownBadge = memo(function EventCountdownBadge({
  countdown,
}: {
  countdown: GroupCountdown;
}) {
  const { state, eventCount } = countdown;
  if (state.kind === "ended") return null;

  const showCount = eventCount > 1;
  const debugMagic = process.env.NEXT_PUBLIC_DEBUG_MAP_MAGIC === "true";

  return (
    <span
      className={`cq-event-countdown cq-event-countdown--${state.kind} cq-event-countdown--u${state.urgency}`}
      aria-label={
        state.kind === "cancelled"
          ? "Event cancelled"
          : `Event countdown: ${state.label}${showCount ? `, ${eventCount} events` : ""}`
      }
    >
      {debugMagic ? <span className="cq-event-countdown-count">EVENT MAGIC ACTIVE</span> : null}
      {showCount ? <span className="cq-event-countdown-count">{eventCount} Events</span> : null}
      <span className="cq-event-countdown-label">{state.label}</span>
    </span>
  );
});
