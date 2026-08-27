"use client";

import {
  Briefcase,
  Dumbbell,
  GraduationCap,
  MessageCircle,
  Theater,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import { EVENTS_CATEGORY_RAIL } from "@/lib/client/eventCardPresentation";

const ICONS: Record<string, LucideIcon> = {
  trophy: Trophy,
  users: Users,
  drama: Theater,
  briefcase: Briefcase,
  cap: GraduationCap,
  dumbbell: Dumbbell,
  chat: MessageCircle,
};

export function EventsCategoryRail({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      className="cq-events-category-rail"
      data-cq-horizontal-scroll="true"
      data-cq-gesture-block="swipe-tab"
      role="listbox"
      aria-label="Event categories"
    >
      {EVENTS_CATEGORY_RAIL.map((category) => {
        const Icon = ICONS[category.icon] ?? Trophy;
        const active = selected === category.id;
        return (
          <button
            key={category.id}
            type="button"
            role="option"
            aria-selected={active}
            onClick={() => onSelect(active ? "" : category.id)}
            className={`cq-events-category-chip cq-events-category-chip--${category.accent} ${
              active ? "cq-events-category-chip--on" : ""
            }`}
          >
            <span className="cq-events-category-chip-icon" aria-hidden>
              <Icon className="h-4 w-4" strokeWidth={2.1} />
            </span>
            <span>{category.label}</span>
          </button>
        );
      })}
    </div>
  );
}
