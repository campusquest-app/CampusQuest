"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Flame, Sparkles, Swords, X } from "lucide-react";
import type { Character, StatKey } from "@/lib/types";
import { STAT_KEYS, STAT_LABELS } from "@/lib/types";
import { grantMiniGameTrainingXp } from "@/lib/store";
import {
  canPlayMiniGameTraining,
  getMiniGameTrainingSummary,
  MINI_GAME_DAILY_QUOTA_BONUS_XP,
  MINI_GAME_WEEK_ALL_FIVE_BONUS_XP,
  playsRemainingToday,
} from "@/lib/miniGameTraining";
import {
  applyStatTrainingXpBonus,
  getAdventurerLabel,
  getCardStateLabel,
  getStatTrainingTooltip,
  getTrainingCardState,
  getTrainingGame,
  TRAINING_GAMES,
  TRAINING_GROUNDS_SUBTITLE,
  TRAINING_GROUNDS_TITLE,
  type TrainingGameCardState,
} from "@/lib/trainingGroundsCatalog";
import {
  playTrainingBegin,
  playTrainingCardTap,
  playTrainingSuccess,
  vibrateTrainingComplete,
} from "@/lib/trainingGroundsFeedback";
import { playXpDing } from "@/lib/playGameSound";
import { defaultTrainingModifiers, TrainingGamePanel } from "@/components/training/TrainingGamePanels";

type DetailStat = StatKey | null;

export function TrainingGrounds({ character, onRefresh }: { character: Character; onRefresh?: () => void }) {
  const [detailStat, setDetailStat] = useState<DetailStat>(null);
  const [activeStat, setActiveStat] = useState<StatKey | null>(null);
  const [completion, setCompletion] = useState<string | null>(null);

  const summary = useMemo(() => getMiniGameTrainingSummary(character), [character]);
  const canPlay = useMemo(() => canPlayMiniGameTraining(character), [character]);
  const playsLeft = useMemo(() => playsRemainingToday(character), [character]);
  const modifiers = useMemo(() => defaultTrainingModifiers(character.stats), [character.stats]);
  const statsTrainedToday = character.miniGameTraining?.statsTrainedToday ?? [];

  const finish = useCallback(
    (stat: StatKey, baseXp: number) => {
      const boosted = applyStatTrainingXpBonus(stat, baseXp, character.stats[stat]);
      const r = grantMiniGameTrainingXp(character.id, stat, boosted);
      if (r) {
        playXpDing();
        playTrainingSuccess();
        vibrateTrainingComplete();
        const parts = [`+${r.sessionXp} XP`];
        for (const e of r.extras) parts.push(`${e.label} +${e.xp}`);
        setCompletion(parts.join(" · "));
        window.setTimeout(() => setCompletion(null), 5000);
        onRefresh?.();
      }
      setActiveStat(null);
      setDetailStat(null);
    },
    [character.id, character.stats, onRefresh],
  );

  const openDetail = (stat: StatKey) => {
    playTrainingCardTap();
    setDetailStat(stat);
  };

  const beginTraining = (stat: StatKey) => {
    if (!canPlay) return;
    playTrainingBegin();
    setDetailStat(null);
    setActiveStat(stat);
  };

  const weekCount = summary.weekStats.length;

  return (
    <div className="cq-training-grounds relative min-h-[60vh] overflow-hidden rounded-2xl border border-uri-keaney/25">
      <div className="cq-training-grounds-bg pointer-events-none absolute inset-0" aria-hidden />
      <div className="cq-training-grounds-particles pointer-events-none absolute inset-0" aria-hidden />

      <div className="relative z-[1] px-4 py-5 sm:px-6 sm:py-7">
        <header className="text-center">
          <p className="cq-training-grounds-eyebrow mb-2 font-display text-[11px] font-semibold uppercase tracking-[0.32em] text-uri-keaney/80">
            Mini Games
          </p>
          <h1 className="font-display text-2xl font-black uppercase tracking-[0.14em] text-white sm:text-3xl">
            {TRAINING_GROUNDS_TITLE}
          </h1>
          <p className="mt-2 text-sm font-medium tracking-wide text-white/55">{TRAINING_GROUNDS_SUBTITLE}</p>
        </header>

        <div className="cq-training-grounds-stats mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <StatChip label="Adventurer" value={getAdventurerLabel(character)} />
          <StatChip label="Plays left today" value={`${playsLeft} left`} highlight={playsLeft > 0} />
          <StatChip label="Training streak" value={`${summary.streak} day${summary.streak === 1 ? "" : "s"}`} icon={<Flame className="h-3.5 w-3.5 text-orange-400" />} />
          <StatChip label="Weekly mastery" value={`${weekCount} / 5 stats trained`} icon={<Sparkles className="h-3.5 w-3.5 text-uri-gold" />} />
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-center text-[11px] leading-relaxed text-white/50 sm:text-xs">
          Real campus activity earns XP and stats. Stats power your training. Training fuels boss battles and your legend.
          <span className="mt-1 block text-white/65">
            Streak mult ×{summary.streakMult.toFixed(2)} · 2nd play today +{MINI_GAME_DAILY_QUOTA_BONUS_XP} XP · All five this week +{MINI_GAME_WEEK_ALL_FIVE_BONUS_XP} XP once
          </span>
        </div>

        {completion ? (
          <p className="cq-training-complete-banner mt-4 rounded-xl border border-uri-gold/35 bg-uri-gold/10 px-4 py-3 text-center text-sm font-semibold text-uri-gold" role="status">
            {completion}
          </p>
        ) : null}

        {!canPlay ? (
          <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-sm text-white/55">
            Daily Training Complete — both sessions used. Return tomorrow to keep your streak alive.
          </p>
        ) : null}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TRAINING_GAMES.map((game) => {
            const state = getTrainingCardState({
              stat: game.stat,
              canPlay,
              statsTrainedToday,
              weekStats: summary.weekStats,
            });
            const tooltip = getStatTrainingTooltip(game.stat, character.stats[game.stat]);
            return (
              <TrainingGameCard
                key={game.stat}
                game={game}
                state={state}
                statValue={character.stats[game.stat]}
                tooltip={tooltip}
                disabled={!canPlay}
                onOpen={() => openDetail(game.stat)}
              />
            );
          })}
        </div>

        <div className="mt-8 rounded-2xl border border-uri-keaney/20 bg-gradient-to-br from-uri-keaney/[0.08] to-transparent p-4">
          <div className="flex items-start gap-3">
            <Swords className="mt-0.5 h-5 w-5 shrink-0 text-uri-keaney" />
            <p className="text-xs leading-relaxed text-white/60 sm:text-sm">
              Your stats are more than numbers. Training makes them stronger, and stronger stats help you perform better across CampusQuest.
            </p>
          </div>
        </div>
      </div>

      {detailStat && typeof document !== "undefined"
        ? createPortal(
            <TrainingDetailModal
              character={character}
              stat={detailStat}
              playsLeft={playsLeft}
              canPlay={canPlay}
              onClose={() => setDetailStat(null)}
              onBegin={() => beginTraining(detailStat)}
            />,
            document.body,
          )
        : null}

      {activeStat && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
              <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto">
                <TrainingGamePanel
                  stat={activeStat}
                  modifiers={modifiers}
                  onCancel={() => setActiveStat(null)}
                  onDone={(xp) => finish(activeStat, xp)}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function StatChip({
  label,
  value,
  highlight,
  icon,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 text-center shadow-inner ${
        highlight ? "border-uri-gold/35 bg-uri-gold/[0.08]" : "border-white/10 bg-black/30"
      }`}
    >
      <div className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-white/45">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-xs font-bold leading-snug text-white sm:text-sm">{value}</p>
    </div>
  );
}

function TrainingGameCard({
  game,
  state,
  statValue,
  tooltip,
  disabled,
  onOpen,
}: {
  game: ReturnType<typeof getTrainingGame>;
  state: TrainingGameCardState;
  statValue: number;
  tooltip: string;
  disabled: boolean;
  onOpen: () => void;
}) {
  const stateLabel = getCardStateLabel(state);
  const locked = state === "locked";

  return (
    <button
      type="button"
      onClick={onOpen}
      title={tooltip}
      disabled={false}
      className={`cq-training-card group relative overflow-hidden rounded-2xl border bg-gradient-to-br p-4 text-left transition-all duration-300 touch-manipulation ${
        game.bgGradient
      } ${game.borderGlow} ${locked ? "opacity-70" : "hover:scale-[1.02] active:scale-[0.99]"}`}
    >
      <div className="cq-training-card-shimmer pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div className="relative z-[1] flex items-start justify-between gap-2">
        <span className="text-2xl" aria-hidden>
          {game.icon}
        </span>
        <span
          className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
            state === "ready"
              ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
              : state === "played-today"
                ? "border-sky-400/35 bg-sky-500/10 text-sky-200"
                : state === "weekly-complete"
                  ? "border-uri-gold/40 bg-uri-gold/15 text-uri-gold"
                  : "border-white/15 bg-white/5 text-white/45"
          }`}
        >
          {stateLabel}
        </span>
      </div>
      <p className={`relative z-[1] mt-3 font-display text-lg font-bold ${game.accent}`}>{game.gameName}</p>
      <p className="relative z-[1] mt-1 text-[11px] font-semibold uppercase tracking-wide text-white/40">{game.theme}</p>
      <p className="relative z-[1] mt-2 text-xs leading-relaxed text-white/65">{game.description}</p>
      <div className="relative z-[1] mt-3 flex flex-wrap items-center gap-2 text-[10px] text-white/50">
        <span className="rounded-md border border-white/10 bg-black/25 px-2 py-0.5">{STAT_LABELS[game.stat]} {statValue}</span>
        <span className="rounded-md border border-white/10 bg-black/25 px-2 py-0.5">XP preview 8–30+</span>
      </div>
      {!locked ? (
        <span className="relative z-[1] mt-4 inline-flex items-center gap-1 text-xs font-bold text-white/80 group-hover:text-white">
          Enter arena <ChevronRight className="h-4 w-4" />
        </span>
      ) : null}
      {disabled && state !== "locked" ? (
        <span className="relative z-[1] mt-2 block text-[10px] text-amber-200/70">No daily plays remaining</span>
      ) : null}
    </button>
  );
}

function TrainingDetailModal({
  character,
  stat,
  playsLeft,
  canPlay,
  onClose,
  onBegin,
}: {
  character: Character;
  stat: StatKey;
  playsLeft: number;
  canPlay: boolean;
  onClose: () => void;
  onBegin: () => void;
}) {
  const game = getTrainingGame(stat);
  const tooltip = getStatTrainingTooltip(stat, character.stats[stat]);

  return (
    <div className="fixed inset-0 z-[115] flex items-end justify-center bg-black/75 p-4 backdrop-blur-md sm:items-center" role="dialog" aria-modal="true">
      <div className={`cq-training-detail relative w-full max-w-lg overflow-hidden rounded-2xl border bg-gradient-to-br ${game.bgGradient} ${game.borderGlow}`}>
        <button type="button" onClick={onClose} className="absolute right-3 top-3 z-[2] rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
        <div className="relative z-[1] p-5 sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">{STAT_LABELS[stat]} training</p>
          <h2 className={`mt-1 font-display text-2xl font-black ${game.accent}`}>{game.gameName}</h2>
          <p className="mt-2 text-sm text-white/70">{game.description}</p>

          <dl className="mt-5 space-y-3 text-sm">
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wide text-white/40">How to play</dt>
              <dd className="mt-1 text-white/75">{game.howToPlay}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wide text-white/40">Rewards</dt>
              <dd className="mt-1 text-white/75">{game.rewards}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wide text-white/40">Stat effect</dt>
              <dd className="mt-1 text-white/75">{game.statEffect}</dd>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs text-uri-keaney/90">{tooltip}</div>
          </dl>

          <p className="mt-4 text-center text-xs text-white/50">
            {playsLeft} play{playsLeft === 1 ? "" : "s"} left today · {STAT_KEYS.filter((s) => character.miniGameTraining?.weekStatsTrained.includes(s)).length}/5 weekly mastery
          </p>

          <button
            type="button"
            disabled={!canPlay}
            onClick={onBegin}
            className="cq-training-begin-btn mt-5 w-full rounded-xl py-3.5 font-display text-sm font-black uppercase tracking-[0.12em] text-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            Begin Training
          </button>
        </div>
      </div>
    </div>
  );
}
