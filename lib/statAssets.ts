import {
  BookOpen,
  Crosshair,
  Dumbbell,
  Footprints,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { StatKey } from "./types";

/** Official CampusQuest stat glyphs — single source for all stat iconography. */
export const STAT_GLYPH: Record<StatKey, LucideIcon> = {
  strength: Dumbbell,
  stamina: Footprints,
  knowledge: BookOpen,
  social: Users,
  focus: Crosshair,
};

/** Progress bar fill classes (Character screen). */
export const STAT_FILL_COLORS: Record<StatKey, string> = {
  strength: "bg-amber-400 stat-fill-game--strength",
  stamina: "bg-uri-teal stat-fill-game--stamina",
  knowledge: "bg-uri-keaney stat-fill-game--knowledge",
  social: "bg-uri-green stat-fill-game--social",
  focus: "bg-uri-purple stat-fill-game--focus",
};

/** Accent text classes for stat labels and highlights. */
export const STAT_TEXT_COLORS: Record<StatKey, string> = {
  strength: "text-amber-400",
  stamina: "text-uri-teal",
  knowledge: "text-uri-keaney",
  social: "text-uri-green",
  focus: "text-uri-purple",
};

/** Attribute row border accents (Manual Log, cards). */
export const STAT_BORDER_CLASS: Record<StatKey, string> = {
  strength: "cq-stat-border--strength",
  stamina: "cq-stat-border--stamina",
  knowledge: "cq-stat-border--knowledge",
  social: "cq-stat-border--social",
  focus: "cq-stat-border--focus",
};
