"use client";

import { Heart, SearchX } from "lucide-react";

export function PartnersNoResults({
  variant,
  onReset,
}: {
  variant: "search" | "filter" | "saved" | "empty";
  onReset?: () => void;
}) {
  const copy = {
    search: {
      title: "No businesses found",
      text: "Try another name, category, or deal keyword — or clear your filters.",
    },
    filter: { title: "Nothing here right now", text: "No businesses match this filter at the moment." },
    saved: { title: "No saved businesses yet", text: "Tap the heart on a business to save it here." },
    empty: { title: "No businesses yet", text: "Local spots and student deals are on the way." },
  }[variant];
  const Icon = variant === "saved" ? Heart : SearchX;
  return (
    <div className="cq-perks-empty" role="status">
      <span className="cq-perks-empty__icon" aria-hidden>
        <Icon className="h-6 w-6" strokeWidth={2} />
      </span>
      <p className="cq-perks-empty__title">{copy.title}</p>
      <p className="cq-perks-empty__text">{copy.text}</p>
      {onReset ? (
        <button type="button" className="cq-perk-btn cq-perk-btn--secondary cq-tap-press touch-manipulation" onClick={onReset}>
          {variant === "saved" ? "Show all businesses" : "Clear search & filters"}
        </button>
      ) : null}
    </div>
  );
}
