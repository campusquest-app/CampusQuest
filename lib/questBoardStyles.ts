import type { QuestDifficulty } from "./questBoardCatalog";

export const DIFFICULTY_CSS: Record<
  QuestDifficulty,
  { border: string; glow: string; text: string; bg: string }
> = {
  easy: {
    border: "border-emerald-400/35",
    glow: "shadow-[0_0_16px_rgba(52,211,153,0.2)]",
    text: "text-emerald-200",
    bg: "from-emerald-500/15 to-emerald-900/10",
  },
  medium: {
    border: "border-sky-400/40",
    glow: "shadow-[0_0_18px_rgba(56,189,248,0.25)]",
    text: "text-sky-200",
    bg: "from-sky-500/15 to-sky-900/10",
  },
  hard: {
    border: "border-violet-400/45",
    glow: "shadow-[0_0_20px_rgba(167,139,250,0.3)]",
    text: "text-violet-200",
    bg: "from-violet-500/20 to-indigo-900/10",
  },
  legendary: {
    border: "border-amber-400/55",
    glow: "shadow-[0_0_28px_rgba(251,191,36,0.4),0_0_12px_rgba(232,121,249,0.2)]",
    text: "text-amber-100",
    bg: "from-amber-500/25 via-fuchsia-500/10 to-violet-900/15",
  },
};
