"use client";

import type { GuildInterest } from "@/lib/types";

export type GuildEmblemSize = "sm" | "md" | "lg" | "hero";

const INTEREST_TONE: Record<GuildInterest, string> = {
  study: "study",
  fitness: "fitness",
  networking: "networking",
  clubs: "clubs",
};

const SCHOLAR_TONE: Record<string, string> = {
  arts_sciences: "scholar-arts",
  business: "scholar-business",
  education: "scholar-education",
  engineering: "scholar-engineering",
  health_sciences: "scholar-health",
  environment_life_sciences: "scholar-life",
  nursing: "scholar-nursing",
  pharmacy: "scholar-pharmacy",
  undecided: "scholar-neutral",
};

export function GuildEmblem({
  interest,
  scholarGuildId,
  crest,
  size = "md",
  rank,
  className = "",
}: {
  interest?: GuildInterest;
  scholarGuildId?: string;
  crest?: string;
  size?: GuildEmblemSize;
  rank?: 1 | 2 | 3;
  className?: string;
}) {
  const tone = interest
    ? INTEREST_TONE[interest]
    : scholarGuildId
      ? (SCHOLAR_TONE[scholarGuildId] ?? "scholar-neutral")
      : "neutral";
  const rankClass = rank === 1 ? "cq-guild-emblem--rank-gold" : rank === 2 ? "cq-guild-emblem--rank-silver" : rank === 3 ? "cq-guild-emblem--rank-bronze" : "";

  return (
    <span
      className={`cq-guild-emblem cq-guild-emblem--${size} cq-guild-emblem--${tone} ${rankClass}${className ? ` ${className}` : ""}`}
      aria-hidden
    >
      <span className="cq-guild-emblem-crest">{crest?.trim() || "🛡️"}</span>
    </span>
  );
}
