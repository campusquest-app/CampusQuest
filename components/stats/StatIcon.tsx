"use client";

import type { StatKey } from "@/lib/types";
import { STAT_GLYPH } from "@/lib/statAssets";

export type StatIconSize = "sm" | "md" | "lg";
export type StatIconVariant = "badge" | "glyph";

const GLYPH_PX: Record<StatIconSize, number> = {
  sm: 14,
  md: 18,
  lg: 20,
};

export function StatIcon({
  stat,
  variant = "badge",
  size = "sm",
  className = "",
  label,
}: {
  stat: StatKey;
  variant?: StatIconVariant;
  size?: StatIconSize;
  className?: string;
  label?: string;
}) {
  const Icon = STAT_GLYPH[stat];
  const px = GLYPH_PX[size];

  if (variant === "glyph") {
    return (
      <Icon
        className={`cq-stat-glyph cq-stat-glyph--${stat} ${className}`.trim()}
        width={px}
        height={px}
        strokeWidth={2.1}
        aria-hidden={!label}
        aria-label={label}
      />
    );
  }

  return (
    <span
      className={`cq-stat-icon cq-stat-icon--${stat} cq-stat-icon--${size} ${className}`.trim()}
      title={label}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={!label}
    >
      <Icon width={px} height={px} strokeWidth={2.1} aria-hidden />
    </span>
  );
}
