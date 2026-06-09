"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PullToRefresh } from "@/components/PullToRefresh";
import { refreshPlayerSnapshotFromServer } from "@/lib/client/refreshPlayerSnapshot";
import { Clock, Map, Scroll, Sparkles, Swords } from "lucide-react";
import type { Character } from "@/lib/types";
import { xpProgressInLevel } from "@/lib/level";
import {
  CATEGORY_META,
  DIFFICULTY_LABELS,
  FILTER_OPTIONS,
  QUEST_BOARD_SUBTITLE,
  QUEST_BOARD_TITLE,
  QUEST_CHAINS,
  type QuestFilter,
} from "@/lib/questBoardCatalog";
import {
  countCompletedQuests,
  filterQuestViews,
  getActiveQuestViews,
  getAdventurerLabel,
  getQuestBoardViews,
  type QuestBoardView,
} from "@/lib/questBoardEngine";
import { acceptQuest, claimQuest } from "@/lib/questBoardActions";
import { queueQuestCelebration } from "@/lib/questBoardCelebration";
import { DIFFICULTY_CSS } from "@/lib/questBoardStyles";
import { SurpriseQuestBanner } from "@/components/SurpriseQuestBanner";
import { DailyQuests } from "@/components/DailyQuests";

function StatPlaque({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="cq-quest-stat rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">{label}</p>
      <p className="mt-1 font-display text-sm font-bold text-white sm:text-base">{value}</p>
      {sub ? <p className="mt-0.5 text-[10px] text-white/40">{sub}</p> : null}
    </div>
  );
}

function QuestCard({
  view,
  onAccept,
  onClaim,
  legendary = false,
}: {
  view: QuestBoardView;
  onAccept: (id: string) => void;
  onClaim: (id: string, proof?: string) => void;
  legendary?: boolean;
}) {
  const { def, status, progress, timeRemainingLabel, chainLabel } = view;
  const style = DIFFICULTY_CSS[def.difficulty];
  const [proofOpen, setProofOpen] = useState(false);
  const [proofInput, setProofInput] = useState("");
  const [proofError, setProofError] = useState<string | null>(null);
  const proofFileRef = useRef<HTMLInputElement>(null);

  const handleClaim = () => {
    if (def.requiresProof) {
      if (!proofOpen) {
        setProofOpen(true);
        return;
      }
      const trimmed = proofInput.trim();
      if (!trimmed) {
        setProofError("Add proof from the event to claim this adventure.");
        return;
      }
      onClaim(def.id, trimmed);
      setProofOpen(false);
      setProofInput("");
      return;
    }
    onClaim(def.id);
  };

  return (
    <article
      className={`cq-quest-card group relative flex flex-col overflow-hidden rounded-2xl border bg-gradient-to-b transition-all duration-300 ${
        legendary
          ? "cq-quest-card-legendary border-amber-400/45 from-amber-500/20 via-fuchsia-500/10 to-black/40 ring-1 ring-amber-400/30"
          : `${style.border} ${style.bg} ${style.glow} ${status === "completed" ? "opacity-75" : "hover:-translate-y-0.5"}`
      }`}
    >
      <div className="cq-quest-card-shine pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100" aria-hidden />
      <div className="relative flex flex-1 flex-col p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">
            {CATEGORY_META[def.category].icon} {CATEGORY_META[def.category].label.replace(" Quests", "")}
          </span>
          <span className={`text-[10px] font-bold uppercase tracking-wide ${style.text}`}>
            {DIFFICULTY_LABELS[def.difficulty]}
          </span>
        </div>

        <div className="flex items-start gap-3">
          <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl border border-white/15 bg-black/30 text-3xl">
            {def.icon}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base font-bold leading-tight text-white">{def.name}</h3>
            <p className="mt-1 text-[12px] leading-snug text-white/55">{def.description}</p>
          </div>
        </div>

        {chainLabel ? <p className="mt-2 text-[10px] font-medium text-uri-keaney/90">{chainLabel}</p> : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-lg border border-uri-gold/35 bg-uri-gold/10 px-2 py-1 text-[11px] font-bold text-uri-gold">
            +{def.xpReward} XP
          </span>
          {def.bonusRewards?.badge ? (
            <span className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-[10px] text-white/60">
              🏅 {def.bonusRewards.badge}
            </span>
          ) : null}
          {def.bonusRewards?.title ? (
            <span className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-[10px] text-white/60">
              👑 {def.bonusRewards.title}
            </span>
          ) : null}
          {timeRemainingLabel ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-white/45">
              <Clock className="h-3 w-3" aria-hidden />
              {timeRemainingLabel}
            </span>
          ) : null}
        </div>

        {status !== "available" && status !== "locked" && status !== "completed" ? (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[10px] tabular-nums text-white/50">
              <span>
                {progress.current} / {progress.max}
              </span>
              <span>{progress.percent}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="cq-quest-progress h-full rounded-full bg-gradient-to-r from-uri-keaney to-uri-gold transition-all duration-700"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-col gap-2">
          {status === "available" ? (
            <button
              type="button"
              onClick={() => onAccept(def.id)}
              className="cq-quest-accept w-full rounded-xl bg-gradient-to-b from-uri-keaney to-uri-keaney/80 py-2.5 text-sm font-bold text-white shadow-lg transition hover:brightness-110"
            >
              Accept Quest
            </button>
          ) : null}
          {status === "locked" ? (
            <p className="text-center text-[11px] font-medium text-white/35">Complete prior chain step to unlock</p>
          ) : null}
          {status === "active" ? (
            <p className="text-center text-[11px] font-semibold text-uri-keaney/90">Adventure in progress…</p>
          ) : null}
          {status === "ready" ? (
            <>
              {proofOpen ? (
                <div className="space-y-2 rounded-xl border border-white/10 bg-black/25 p-3">
                  <input
                    type="text"
                    value={proofInput.startsWith("data:") ? "" : proofInput}
                    onChange={(e) => {
                      setProofInput(e.target.value);
                      setProofError(null);
                    }}
                    placeholder="Proof URL or description from the event"
                    className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/35"
                  />
                  <input ref={proofFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => setProofInput((reader.result as string) ?? "");
                    reader.readAsDataURL(file);
                  }} />
                  <button type="button" onClick={() => proofFileRef.current?.click()} className="text-[11px] text-uri-gold">
                    📷 Add photo proof
                  </button>
                  {proofError ? <p className="text-[11px] text-amber-300">{proofError}</p> : null}
                </div>
              ) : null}
              <button
                type="button"
                onClick={handleClaim}
                className="cq-quest-claim w-full rounded-xl bg-gradient-to-b from-uri-gold to-amber-600 py-2.5 text-sm font-bold text-uri-navy shadow-lg transition hover:brightness-110"
              >
                {def.requiresProof && !proofOpen ? "Submit Proof & Claim" : "Claim Reward"}
              </button>
            </>
          ) : null}
          {status === "completed" ? (
            <p className="text-center text-[11px] font-bold uppercase tracking-wider text-emerald-300/90">✓ Completed</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function QuestBoard({ character, onRefresh }: { character: Character; onRefresh?: () => void }) {
  const [filter, setFilter] = useState<QuestFilter>("all");
  const [localCharacter, setLocalCharacter] = useState(character);

  useEffect(() => {
    setLocalCharacter(character);
  }, [character]);

  const views = useMemo(() => getQuestBoardViews(localCharacter), [localCharacter]);
  const filtered = useMemo(() => filterQuestViews(views, filter), [views, filter]);
  const activeViews = useMemo(() => getActiveQuestViews(localCharacter), [localCharacter]);
  const legendaryViews = useMemo(() => views.filter((v) => v.def.category === "legendary"), [views]);
  const completedCount = useMemo(() => countCompletedQuests(localCharacter), [localCharacter]);
  const { current, needed } = xpProgressInLevel(localCharacter.totalXP);
  const xpPct = Math.min(100, (current / needed) * 100);

  const refresh = useCallback(
    (next: Character) => {
      setLocalCharacter({ ...next });
      onRefresh?.();
    },
    [onRefresh],
  );

  const handlePullRefresh = useCallback(async () => {
    const next = await refreshPlayerSnapshotFromServer();
    if (next) {
      setLocalCharacter({ ...next });
    }
    onRefresh?.();
  }, [onRefresh]);

  const handleAccept = useCallback(
    (id: string) => {
      const next = acceptQuest(localCharacter, id);
      if (next) refresh(next);
    },
    [localCharacter, refresh],
  );

  const handleClaim = useCallback(
    (id: string, proof?: string) => {
      const result = claimQuest(localCharacter, id, proof);
      if (!result) return;
      queueQuestCelebration(result.celebration);
      refresh(result.character);
    },
    [localCharacter, refresh],
  );

  const nonLegendaryFiltered = filtered.filter((v) => v.def.category !== "legendary");

  return (
    <PullToRefresh onRefresh={handlePullRefresh}>
    <div className="cq-quest-board relative min-h-[60vh] overflow-hidden rounded-2xl border border-uri-keaney/25">
      <div className="cq-quest-board-bg pointer-events-none absolute inset-0" aria-hidden />
      <div className="cq-quest-board-particles pointer-events-none absolute inset-0" aria-hidden />

      <div className="relative z-[1] px-4 py-5 sm:px-6 sm:py-7 space-y-5">
        <SurpriseQuestBanner character={localCharacter} />
        <DailyQuests character={localCharacter} />

        <header className="text-center">
          <p className="cq-quest-eyebrow mb-2 font-display text-[11px] font-semibold uppercase tracking-[0.32em] text-uri-keaney/80">
            Guild Hall · Bounty Board
          </p>
          <h1 className="font-display text-2xl font-black uppercase tracking-[0.12em] text-white sm:text-3xl">
            {QUEST_BOARD_TITLE}
          </h1>
          <p className="mt-2 text-sm font-medium tracking-wide text-white/55">{QUEST_BOARD_SUBTITLE}</p>
        </header>

        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <StatPlaque label="Adventurer" value={getAdventurerLabel(localCharacter)} />
          <StatPlaque label="XP Progress" value={`${xpPct}%`} sub={`${current.toLocaleString()} / ${needed.toLocaleString()} this level`} />
          <StatPlaque label="Active Quests" value={`${activeViews.length}`} sub="Current adventures" />
          <StatPlaque label="Completed" value={`${completedCount}`} sub="Quests claimed" />
        </div>

        {activeViews.length > 0 ? (
          <section className="cq-quest-active mt-6 rounded-2xl border border-uri-keaney/30 bg-gradient-to-b from-uri-keaney/10 to-black/30 p-4 sm:p-5">
            <header className="mb-4 flex items-center gap-2">
              <Swords className="h-5 w-5 text-uri-keaney" aria-hidden />
              <div>
                <h2 className="font-display text-lg font-bold text-white">Current Adventures</h2>
                <p className="text-xs text-white/45">Your accepted quests — finish them for glory</p>
              </div>
            </header>
            <div className="grid gap-3 sm:grid-cols-2">
              {activeViews.map((view) => (
                <QuestCard key={view.def.id} view={view} onAccept={handleAccept} onClaim={handleClaim} />
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-6 rounded-2xl border border-amber-400/25 bg-gradient-to-b from-amber-500/10 via-fuchsia-500/5 to-black/40 p-4 sm:p-5">
          <header className="mb-4 text-center sm:text-left">
            <p className="flex items-center justify-center gap-2 font-display text-lg font-black uppercase tracking-wide text-amber-100 sm:justify-start">
              <Sparkles className="h-5 w-5 text-amber-300" aria-hidden />
              Legendary Quests
            </p>
            <p className="mt-1 text-xs text-white/45">Rare story quests with extraordinary rewards</p>
          </header>
          <div className="grid gap-3 lg:grid-cols-3">
            {legendaryViews.map((view) => (
              <QuestCard key={view.def.id} view={view} onAccept={handleAccept} onClaim={handleClaim} legendary />
            ))}
          </div>
        </section>

        {QUEST_CHAINS.map((chain) => (
          <section key={chain.id} className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4 sm:p-5">
            <header className="mb-3 flex items-start gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-uri-keaney/30 bg-uri-keaney/10 text-2xl">
                {chain.icon}
              </span>
              <div>
                <h2 className="font-display text-base font-bold text-white">{chain.name}</h2>
                <p className="text-xs text-white/50">{chain.description}</p>
                <p className="mt-1 text-[11px] font-semibold text-uri-gold">
                  Final reward: +{chain.finalBonusXp} XP
                  {chain.finalBonusRewards?.badge ? ` · ${chain.finalBonusRewards.badge}` : ""}
                </p>
              </div>
            </header>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {chain.stepIds.map((stepId) => {
                const view = views.find((v) => v.def.id === stepId);
                if (!view) return null;
                return <QuestCard key={stepId} view={view} onAccept={handleAccept} onClaim={handleClaim} />;
              })}
            </div>
          </section>
        ))}

        <div className="mt-6 flex flex-wrap gap-1.5">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFilter(opt.id)}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                filter === opt.id
                  ? "border-uri-keaney/50 bg-uri-keaney/20 text-white"
                  : "border-white/15 text-white/50 hover:border-white/25 hover:text-white/80"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <section className="mt-5">
          <header className="mb-4 flex items-center gap-2">
            <Scroll className="h-4 w-4 text-white/50" aria-hidden />
            <h2 className="font-display text-base font-bold text-white">
              {filter === "all" ? "Available Adventures" : `${FILTER_OPTIONS.find((f) => f.id === filter)?.label ?? "Quests"}`}
            </h2>
          </header>
          {nonLegendaryFiltered.length === 0 ? (
            <p className="rounded-xl border border-white/10 bg-black/25 px-4 py-10 text-center text-sm text-white/40">
              No quests match this filter. Try another category or accept a new adventure.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {nonLegendaryFiltered
                .filter((v) => !v.def.chainId)
                .map((view) => (
                  <QuestCard key={view.def.id} view={view} onAccept={handleAccept} onClaim={handleClaim} />
                ))}
            </div>
          )}
        </section>

        <p className="mt-6 flex items-center justify-center gap-2 text-center text-[11px] text-white/35">
          <Map className="h-3.5 w-3.5" aria-hidden />
          Real campus actions power every quest — log activities, explore, and connect.
        </p>
      </div>
    </div>
    </PullToRefresh>
  );
}
