"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Lock, X } from "lucide-react";
import type { Character } from "@/lib/types";
import {
  ACHIEVEMENT_CATALOG,
  TROPHY_ROOM_SUBTITLE,
  TROPHY_ROOM_TITLE,
} from "@/lib/achievementsCatalog";
import {
  getAchievementViews,
  getEarnedAchievements,
  syncCatalogAchievements,
  type AchievementView,
} from "@/lib/achievementEngine";
import { replaceLocalCharacter } from "@/lib/store";
import { setEquippedTitle, toggleFeaturedAchievement } from "@/lib/achievementShowcase";
import { RARITY_CSS } from "@/lib/achievementRarityStyles";
import { buildCodexStates, type CodexItemState } from "@/lib/codexState";
import { CodexCard } from "@/components/codex/CodexCard";
import { CodexDetailSheet } from "@/components/codex/CodexDetailSheet";

const RARE_COLLECTIBLE_RARITIES = new Set(["rare", "epic", "legendary", "mythic"]);

function formatEarnedDate(iso: string | null): string {
  if (!iso) return "Recently earned";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "Recently earned";
  }
}

type RecentUnlock =
  | { kind: "achievement"; view: AchievementView; at: number }
  | { kind: "collectible"; state: CodexItemState; at: number };

function AchievementGridCell({
  view,
  onSelect,
}: {
  view: AchievementView;
  onSelect: () => void;
}) {
  const { def, earned } = view;
  const style = RARITY_CSS[def.rarity];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`cq-trophy-achievement-cell group flex flex-col items-center gap-1.5 p-2 text-center transition active:scale-[0.97] ${
        earned ? "" : "opacity-70"
      }`}
      aria-label={`${def.name}, ${style.label}${earned ? "" : ", locked"}`}
    >
      <div
        className={`cq-trophy-achievement-icon flex h-14 w-14 items-center justify-center rounded-2xl text-2xl sm:h-16 sm:w-16 sm:text-3xl ${
          earned ? `cq-trophy-achievement-icon--earned ${style.glow}` : "cq-trophy-achievement-icon--locked"
        }`}
      >
        {earned ? (
          <span aria-hidden>{def.icon}</span>
        ) : (
          <Lock className="h-5 w-5 text-white/35" aria-hidden />
        )}
      </div>
      <span className="line-clamp-2 w-full text-[11px] font-semibold leading-tight text-white sm:text-xs">{def.name}</span>
      <span className={`text-[9px] font-semibold uppercase tracking-wide ${style.text}`}>{style.label}</span>
    </button>
  );
}

function RecentUnlockChip({ unlock, onSelect }: { unlock: RecentUnlock; onSelect: () => void }) {
  if (unlock.kind === "achievement") {
    const { def } = unlock.view;
    const style = RARITY_CSS[def.rarity];
    return (
      <button
        type="button"
        onClick={onSelect}
        className="cq-trophy-recent-chip flex w-[4.75rem] shrink-0 flex-col items-center gap-1"
      >
        <div className={`cq-trophy-recent-icon flex h-12 w-12 items-center justify-center rounded-xl text-xl ${style.glow}`}>
          <span aria-hidden>{def.icon}</span>
        </div>
        <span className="line-clamp-2 w-full text-[10px] font-medium leading-tight text-white/80">{def.name}</span>
      </button>
    );
  }

  const { entry } = unlock.state;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="cq-trophy-recent-chip flex w-[4.75rem] shrink-0 flex-col items-center gap-1"
    >
      <div className="cq-trophy-recent-icon flex h-12 w-12 items-center justify-center rounded-xl text-xl">
        <span aria-hidden>{entry.icon}</span>
      </div>
      <span className="line-clamp-2 w-full text-[10px] font-medium leading-tight text-white/80">{entry.name}</span>
    </button>
  );
}

function AchievementDetailSheet({
  view,
  featured,
  onToggleFeatured,
  onClose,
}: {
  view: AchievementView;
  featured: boolean;
  onToggleFeatured?: () => void;
  onClose: () => void;
}) {
  if (typeof document === "undefined") return null;

  const { def, earned, earnedAt, progress } = view;
  const style = RARITY_CSS[def.rarity];

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className={`cq-trophy-detail relative z-10 w-full max-w-sm rounded-t-2xl p-5 sm:rounded-2xl ${style.glow}`}>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="cq-trophy-detail-icon mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl text-5xl">
          {earned ? def.icon : <Lock className="h-8 w-8 text-white/35" />}
        </div>

        <h3 className="text-center font-display text-lg font-bold text-white">{def.name}</h3>
        <p className={`mt-1 text-center text-xs font-semibold uppercase tracking-wide ${style.text}`}>{style.label}</p>
        <p className="mt-3 text-center text-sm leading-relaxed text-white/70">{def.description}</p>

        {earned ? (
          <>
            <p className="mt-3 text-center text-xs text-white/45">{formatEarnedDate(earnedAt)}</p>
            {onToggleFeatured ? (
              <button
                type="button"
                onClick={onToggleFeatured}
                className={`mt-4 w-full rounded-xl py-2.5 text-xs font-bold uppercase tracking-wide transition ${
                  featured
                    ? "bg-uri-gold/20 text-uri-gold"
                    : "bg-white/8 text-white/70 hover:bg-white/12 hover:text-white"
                }`}
              >
                {featured ? "Featured on profile ★" : "Feature on profile"}
              </button>
            ) : null}
          </>
        ) : (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs tabular-nums text-white/55">
              <span>
                {progress.current} / {progress.max}
              </span>
              <span>{progress.percent}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-uri-keaney to-uri-gold transition-all"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function SectionHeader({ title, count }: { title: string; count?: string }) {
  return (
    <div className="cq-trophy-section-header flex items-baseline justify-between gap-3">
      <h2 className="font-display text-lg font-bold text-white">{title}</h2>
      {count ? <span className="text-xs font-medium tabular-nums text-white/45">{count}</span> : null}
    </div>
  );
}

export function TrophyRoom({ character, onRefresh }: { character: Character; onRefresh?: () => void }) {
  const [localCharacter, setLocalCharacter] = useState(character);
  const [selectedAchievement, setSelectedAchievement] = useState<AchievementView | null>(null);
  const [selectedCollectible, setSelectedCollectible] = useState<CodexItemState | null>(null);

  useEffect(() => {
    setLocalCharacter(character);
  }, [character]);

  useEffect(() => {
    const c = { ...character, achievements: [...character.achievements] };
    const unlocked = syncCatalogAchievements(c);
    if (unlocked.length > 0) {
      replaceLocalCharacter(c);
      setLocalCharacter(c);
      void import("@/lib/achievementCelebration").then(({ queueAchievementCelebration }) => {
        for (const def of unlocked) queueAchievementCelebration(def);
      });
      onRefresh?.();
    }
  }, [character.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const views = useMemo(() => getAchievementViews(localCharacter), [localCharacter]);
  const earned = useMemo(() => getEarnedAchievements(localCharacter), [localCharacter]);
  const featuredIds = useMemo(() => new Set(localCharacter.featuredAchievementIds ?? []), [localCharacter.featuredAchievementIds]);
  const codexStates = useMemo(() => buildCodexStates(localCharacter), [localCharacter]);

  const trophyCount = useMemo(
    () => earned.filter((v) => v.def.trophyKind !== "badge").length,
    [earned],
  );
  const badgeCount = useMemo(
    () => earned.filter((v) => v.def.trophyKind === "badge").length,
    [earned],
  );
  const rareCollectibleCount = useMemo(
    () =>
      codexStates.filter(
        (s) => s.discovered && s.entry.kind === "loot" && RARE_COLLECTIBLE_RARITIES.has(s.entry.rarity),
      ).length,
    [codexStates],
  );

  const milestoneViews = useMemo(
    () => views.filter((v) => v.def.category === "milestones"),
    [views],
  );
  const achievementViews = useMemo(
    () => views.filter((v) => v.def.category !== "milestones"),
    [views],
  );
  const collectibleStates = useMemo(
    () => codexStates.filter((s) => s.entry.kind === "loot"),
    [codexStates],
  );

  const recentUnlocks = useMemo(() => {
    const items: RecentUnlock[] = [];

    for (const view of earned) {
      const at = view.earnedAt ? Date.parse(view.earnedAt) : Date.now();
      if (!Number.isNaN(at)) items.push({ kind: "achievement", view, at });
    }
    for (const state of codexStates) {
      if (state.discovered && state.entry.kind === "loot" && state.earnedAt) {
        items.push({ kind: "collectible", state, at: state.earnedAt });
      }
    }

    return items.sort((a, b) => b.at - a.at).slice(0, 12);
  }, [earned, codexStates]);

  const titleOptions = useMemo(
    () => earned.filter((v) => v.def.titleUnlock).map((v) => ({ id: v.def.id, label: v.def.titleUnlock! })),
    [earned],
  );

  const refreshLocal = useCallback(
    (next: Character) => {
      setLocalCharacter({ ...next });
      onRefresh?.();
    },
    [onRefresh],
  );

  const handleToggleFeatured = useCallback(
    (id: string) => {
      toggleFeaturedAchievement(localCharacter, id);
      refreshLocal({ ...localCharacter });
    },
    [localCharacter, refreshLocal],
  );

  const handleTitleChange = useCallback(
    (id: string) => {
      setEquippedTitle(localCharacter, id || null);
      refreshLocal({ ...localCharacter });
    },
    [localCharacter, refreshLocal],
  );

  const handleRecentSelect = (unlock: RecentUnlock) => {
    if (unlock.kind === "achievement") setSelectedAchievement(unlock.view);
    else setSelectedCollectible(unlock.state);
  };

  return (
    <div className="cq-trophy-room relative min-h-[60vh] pb-10">
      <div className="cq-trophy-room-ambient pointer-events-none absolute inset-0" aria-hidden />

      <div className="relative z-[1] px-4 pt-2 sm:px-5 sm:pt-4">
        <header className="cq-trophy-hero">
          <h1 className="font-display text-2xl font-black tracking-tight text-white sm:text-[1.65rem]">
            {TROPHY_ROOM_TITLE}
          </h1>
          <p className="mt-1.5 text-sm text-white/55">{TROPHY_ROOM_SUBTITLE}</p>
          <p className="cq-trophy-inline-stats mt-4 text-sm font-medium text-white/75">
            <span className="tabular-nums">{trophyCount}</span> Trophies
            <span className="mx-2 text-white/25" aria-hidden>
              •
            </span>
            <span className="tabular-nums">{badgeCount}</span> Badges
            <span className="mx-2 text-white/25" aria-hidden>
              •
            </span>
            <span className="tabular-nums">{rareCollectibleCount}</span> Rare Items
          </p>
        </header>

        <div className="cq-trophy-divider mt-8" />

        <section className="mt-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">Profile showcase</p>
          <p className="mt-0.5 text-xs text-white/45">Up to 3 achievements on your profile</p>
          <div className="mt-3 flex gap-3">
            {[0, 1, 2].map((slot) => {
              const id = localCharacter.featuredAchievementIds?.[slot];
              const view = id ? views.find((v) => v.def.id === id && v.earned) : null;
              return (
                <div
                  key={slot}
                  className={`cq-trophy-showcase-slot flex flex-1 flex-col items-center justify-center py-4 ${
                    view ? "cq-trophy-showcase-slot--filled" : ""
                  }`}
                >
                  {view ? (
                    <>
                      <span className="text-2xl" aria-hidden>
                        {view.def.icon}
                      </span>
                      <p className="mt-1 line-clamp-2 px-1 text-center text-[10px] font-semibold leading-tight text-white/85">
                        {view.def.name}
                      </p>
                    </>
                  ) : (
                    <span className="text-[10px] font-medium uppercase tracking-wider text-white/30">Empty</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {titleOptions.length > 0 ? (
          <section className="mt-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">Equipped title</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleTitleChange("")}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  !localCharacter.equippedTitleId
                    ? "bg-uri-keaney/20 text-uri-keaney"
                    : "text-white/55 hover:text-white/80"
                }`}
              >
                None
              </button>
              {titleOptions.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleTitleChange(t.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    localCharacter.equippedTitleId === t.id
                      ? "bg-uri-gold/20 text-uri-gold"
                      : "text-white/55 hover:text-white/80"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {recentUnlocks.length > 0 ? (
          <section className="mt-10">
            <SectionHeader title="Recent Unlocks" />
            <div className="cq-trophy-recent-scroll mt-4 flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {recentUnlocks.map((unlock, i) => (
                <RecentUnlockChip
                  key={`${unlock.kind}-${unlock.kind === "achievement" ? unlock.view.def.id : unlock.state.entry.id}-${i}`}
                  unlock={unlock}
                  onSelect={() => handleRecentSelect(unlock)}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-10">
          <SectionHeader
            title="Milestones"
            count={`${milestoneViews.filter((v) => v.earned).length} / ${milestoneViews.length}`}
          />
          {milestoneViews.length === 0 ? (
            <p className="mt-4 text-sm text-white/45">No milestones yet — keep questing on campus.</p>
          ) : (
            <div className="cq-trophy-grid mt-5">
              {milestoneViews.map((view) => (
                <AchievementGridCell key={view.def.id} view={view} onSelect={() => setSelectedAchievement(view)} />
              ))}
            </div>
          )}
        </section>

        <div className="cq-trophy-divider mt-10" />

        <section className="mt-10">
          <SectionHeader
            title="Achievements"
            count={`${earned.length} / ${ACHIEVEMENT_CATALOG.length}`}
          />
          <div className="cq-trophy-grid mt-5">
            {achievementViews.map((view) => (
              <AchievementGridCell key={view.def.id} view={view} onSelect={() => setSelectedAchievement(view)} />
            ))}
          </div>
        </section>

        <div className="cq-trophy-divider mt-10" />

        <section className="mt-10">
          <SectionHeader
            title="Collectibles"
            count={`${collectibleStates.filter((s) => s.discovered).length} / ${collectibleStates.length}`}
          />
          {collectibleStates.length === 0 ? (
            <p className="mt-4 text-sm text-white/45">Collectibles appear as you explore campus and win battles.</p>
          ) : (
            <div className="cq-trophy-collectibles-grid mt-5">
              {collectibleStates.map((state) => (
                <CodexCard key={state.entry.id} state={state} onSelect={() => setSelectedCollectible(state)} />
              ))}
            </div>
          )}
        </section>
      </div>

      {selectedAchievement ? (
        <AchievementDetailSheet
          view={selectedAchievement}
          featured={featuredIds.has(selectedAchievement.def.id)}
          onToggleFeatured={
            selectedAchievement.earned ? () => handleToggleFeatured(selectedAchievement.def.id) : undefined
          }
          onClose={() => setSelectedAchievement(null)}
        />
      ) : null}

      {selectedCollectible ? (
        <CodexDetailSheet state={selectedCollectible} onClose={() => setSelectedCollectible(null)} />
      ) : null}
    </div>
  );
}

/** @deprecated Use TrophyRoom */
export const HallOfLegends = TrophyRoom;
