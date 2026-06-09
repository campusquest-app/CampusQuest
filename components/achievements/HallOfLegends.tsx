"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Crown, Lock, Sparkles, Star } from "lucide-react";
import type { Character } from "@/lib/types";
import {
  ACHIEVEMENT_CATALOG,
  CATEGORY_META,
  HALL_OF_LEGENDS_SUBTITLE,
  HALL_OF_LEGENDS_TITLE,
  LEGEND_SCORE_BY_RARITY,
  type AchievementCategory,
} from "@/lib/achievementsCatalog";
import {
  computeLegendScore,
  getAchievementViews,
  getAdventurerLabel,
  getEarnedAchievements,
  getRarestEarnedAchievement,
  syncCatalogAchievements,
  type AchievementView,
} from "@/lib/achievementEngine";
import { replaceLocalCharacter } from "@/lib/store";
import { setEquippedTitle, toggleFeaturedAchievement } from "@/lib/achievementShowcase";
import { RARITY_CSS, TROPHY_KIND_LABEL } from "@/lib/achievementRarityStyles";

const CATEGORY_ORDER: AchievementCategory[] = [
  "milestones",
  "challenges",
  "academic",
  "social",
  "special",
  "legendary",
];

function formatEarnedDate(iso: string | null): string {
  if (!iso) return "Recently earned";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "Recently earned";
  }
}

function StatPlaque({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="cq-hall-stat rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">{label}</p>
      <p className="mt-1 font-display text-sm font-bold text-white sm:text-base">{value}</p>
      {sub ? <p className="mt-0.5 text-[10px] text-white/40">{sub}</p> : null}
    </div>
  );
}

function TrophyPedestal({
  view,
  featured,
  onToggleFeatured,
  showEquipHint,
}: {
  view: AchievementView;
  featured: boolean;
  onToggleFeatured?: () => void;
  showEquipHint?: boolean;
}) {
  const { def, earned, earnedAt, progress } = view;
  const style = RARITY_CSS[def.rarity];
  const kind = TROPHY_KIND_LABEL[def.trophyKind] ?? "Badge";

  return (
    <article
      className={`cq-hall-trophy group relative flex flex-col overflow-hidden rounded-2xl border transition-all duration-300 ${
        earned
          ? `border-white/15 bg-gradient-to-b ${style.bg} ring-1 ${style.ring} ${style.glow} hover:-translate-y-0.5`
          : "border-white/8 bg-black/25 opacity-80"
      } ${featured ? "cq-hall-trophy-featured ring-2 ring-uri-gold/50" : ""}`}
    >
      <div className="cq-hall-trophy-shine pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100" aria-hidden />
      <div className="relative flex flex-1 flex-col p-3 sm:p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${style.text} bg-black/25`}>
            {style.label}
          </span>
          <span className="text-[9px] font-medium uppercase tracking-wide text-white/35">{kind}</span>
        </div>

        <div
          className={`cq-hall-trophy-icon mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-xl border text-3xl sm:h-[4.5rem] sm:w-[4.5rem] sm:text-4xl ${
            earned ? "border-white/20 bg-black/30" : "border-white/10 bg-black/40 grayscale"
          }`}
        >
          {earned ? def.icon : <Lock className="h-6 w-6 text-white/30" aria-hidden />}
        </div>

        <h3 className="text-center font-display text-sm font-bold leading-tight text-white">{def.name}</h3>
        <p className="mt-1.5 flex-1 text-center text-[11px] leading-snug text-white/50">{def.description}</p>

        {earned ? (
          <>
            <p className="mt-2 text-center text-[10px] text-white/35">{formatEarnedDate(earnedAt)}</p>
            <p className="mt-1 text-center text-[10px] font-semibold text-uri-gold/80">
              +{LEGEND_SCORE_BY_RARITY[def.rarity]} Legend Score
            </p>
            {onToggleFeatured ? (
              <button
                type="button"
                onClick={onToggleFeatured}
                className={`mt-3 rounded-lg border px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide transition ${
                  featured
                    ? "border-uri-gold/50 bg-uri-gold/15 text-uri-gold"
                    : "border-white/15 bg-white/5 text-white/55 hover:border-uri-keaney/40 hover:text-white"
                }`}
              >
                {featured ? "Featured ★" : showEquipHint ? "Showcase" : "Equip showcase"}
              </button>
            ) : null}
          </>
        ) : (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[10px] tabular-nums text-white/45">
              <span>
                {progress.current} / {progress.max}
              </span>
              <span>{progress.percent}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="cq-hall-progress-fill h-full rounded-full bg-gradient-to-r from-uri-keaney to-uri-gold transition-all duration-700"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function CategorySection({
  category,
  views,
  featuredIds,
  onToggleFeatured,
}: {
  category: AchievementCategory;
  views: AchievementView[];
  featuredIds: Set<string>;
  onToggleFeatured: (id: string) => void;
}) {
  const meta = CATEGORY_META[category];
  const earnedCount = views.filter((v) => v.earned).length;

  return (
    <section className="cq-hall-category rounded-2xl border border-white/10 bg-black/20 p-4 sm:p-5">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 font-display text-lg font-bold text-white">
            <span aria-hidden>{meta.icon}</span>
            {meta.label}
          </p>
          <p className="mt-0.5 text-xs text-white/45">{meta.blurb}</p>
        </div>
        <p className="text-[11px] font-semibold tabular-nums text-uri-keaney/90">
          {earnedCount} / {views.length} claimed
        </p>
      </header>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
        {views.map((view) => (
          <TrophyPedestal
            key={view.def.id}
            view={view}
            featured={featuredIds.has(view.def.id)}
            onToggleFeatured={view.earned ? () => onToggleFeatured(view.def.id) : undefined}
            showEquipHint
          />
        ))}
      </div>
    </section>
  );
}

export function HallOfLegends({ character, onRefresh }: { character: Character; onRefresh?: () => void }) {
  const [localCharacter, setLocalCharacter] = useState(character);

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
  const legendScore = useMemo(() => computeLegendScore(localCharacter), [localCharacter]);
  const rarest = useMemo(() => getRarestEarnedAchievement(localCharacter), [localCharacter]);
  const featuredIds = useMemo(() => new Set(localCharacter.featuredAchievementIds ?? []), [localCharacter.featuredAchievementIds]);

  const titleOptions = useMemo(
    () =>
      earned
        .filter((v) => v.def.titleUnlock)
        .map((v) => ({ id: v.def.id, label: v.def.titleUnlock! })),
    [earned],
  );

  const earnedTrophyViews = useMemo(() => earned.filter((v) => v.def.trophyKind !== "badge"), [earned]);

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

  const viewsByCategory = useMemo(() => {
    const map = new Map<AchievementCategory, AchievementView[]>();
    for (const cat of CATEGORY_ORDER) {
      map.set(
        cat,
        views.filter((v) => v.def.category === cat),
      );
    }
    return map;
  }, [views]);

  return (
    <div className="cq-hall-of-legends relative min-h-[60vh] overflow-hidden rounded-2xl border border-white/[0.08]">
      <div className="cq-hall-of-legends-bg pointer-events-none absolute inset-0" aria-hidden />
      <div className="cq-hall-of-legends-particles pointer-events-none absolute inset-0" aria-hidden />

      <div className="relative z-[1] px-4 py-5 sm:px-6 sm:py-7">
        <header className="text-center">
          <p className="cq-hall-eyebrow mb-2 font-display text-[11px] font-semibold uppercase tracking-[0.32em] text-uri-keaney/80">
            Collect · Showcase · Become Legend
          </p>
          <h1 className="font-display text-2xl font-black uppercase tracking-[0.12em] text-white sm:text-3xl">
            {HALL_OF_LEGENDS_TITLE}
          </h1>
          <p className="mt-2 text-sm font-medium tracking-wide text-white/55">{HALL_OF_LEGENDS_SUBTITLE}</p>
        </header>

        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <StatPlaque label="Adventurer" value={getAdventurerLabel(localCharacter)} />
          <StatPlaque
            label="Achievements"
            value={`${earned.length} Earned`}
            sub={`of ${ACHIEVEMENT_CATALOG.length} badges`}
          />
          <StatPlaque label="Legend Score" value={legendScore.toLocaleString()} sub="Prestige from rarity" />
          <StatPlaque
            label="Rarest Badge"
            value={rarest?.name ?? "None yet"}
            sub={rarest ? RARITY_CSS[rarest.rarity].label : "Keep questing"}
          />
        </div>

        <section className="cq-hall-showcase mt-6 rounded-2xl border border-uri-gold/20 bg-cq-elevated p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="flex items-center gap-2 font-display text-base font-bold text-white">
                <Star className="h-4 w-4 text-uri-gold" aria-hidden />
                Featured Showcase
              </p>
              <p className="text-xs text-white/45">Equip up to 3 achievements — shown on profile and leaderboards</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[0, 1, 2].map((slot) => {
              const id = localCharacter.featuredAchievementIds?.[slot];
              const view = id ? views.find((v) => v.def.id === id && v.earned) : null;
              return (
                <div
                  key={slot}
                  className={`cq-hall-showcase-slot flex min-h-[7rem] flex-col items-center justify-center rounded-xl border border-dashed p-2 text-center ${
                    view ? "border-uri-gold/40 bg-black/30" : "border-white/15 bg-black/20"
                  }`}
                >
                  {view ? (
                    <>
                      <span className="text-3xl" aria-hidden>
                        {view.def.icon}
                      </span>
                      <p className="mt-1 text-[10px] font-bold leading-tight text-white sm:text-xs">{view.def.name}</p>
                    </>
                  ) : (
                    <p className="text-[10px] font-medium uppercase tracking-wider text-white/30">Empty slot</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <Crown className="h-4 w-4 text-uri-gold" aria-hidden />
            <h2 className="font-display text-base font-bold text-white">Equipped Title</h2>
          </div>
          <p className="mb-3 text-xs text-white/45">One title appears under your username across CampusQuest.</p>
          {titleOptions.length === 0 ? (
            <p className="text-sm text-white/40">Earn achievements with titles to unlock this slot.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleTitleChange("")}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  !localCharacter.equippedTitleId
                    ? "border-uri-keaney/50 bg-uri-keaney/20 text-white"
                    : "border-white/15 text-white/50 hover:text-white"
                }`}
              >
                None
              </button>
              {titleOptions.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleTitleChange(t.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    localCharacter.equippedTitleId === t.id
                      ? "border-uri-gold/50 bg-uri-gold/15 text-uri-gold"
                      : "border-white/15 text-white/60 hover:border-uri-keaney/35 hover:text-white"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="cq-hall-trophy-room mt-6 rounded-2xl border border-white/[0.08] bg-cq-card p-4 sm:p-5">
          <header className="mb-4 text-center sm:text-left">
            <p className="flex items-center justify-center gap-2 font-display text-lg font-bold text-white sm:justify-start">
              <Sparkles className="h-5 w-5 text-uri-gold" aria-hidden />
              Trophy Room
            </p>
            <p className="mt-1 text-xs text-white/45">
              Trophies, medals, banners, and relics from your legend — not a spreadsheet.
            </p>
          </header>
          {earnedTrophyViews.length === 0 ? (
            <p className="rounded-xl border border-white/10 bg-black/25 px-4 py-8 text-center text-sm text-white/40">
              Your display cases are waiting. Complete challenges to fill the hall with light.
            </p>
          ) : (
            <div className="cq-hall-trophy-grid grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {earnedTrophyViews.map((view) => (
                <TrophyPedestal
                  key={view.def.id}
                  view={view}
                  featured={featuredIds.has(view.def.id)}
                  onToggleFeatured={() => handleToggleFeatured(view.def.id)}
                />
              ))}
            </div>
          )}
        </section>

        <div className="mt-6 space-y-5">
          {CATEGORY_ORDER.map((cat) => {
            const catViews = viewsByCategory.get(cat) ?? [];
            if (catViews.length === 0) return null;
            return (
              <CategorySection
                key={cat}
                category={cat}
                views={catViews}
                featuredIds={featuredIds}
                onToggleFeatured={handleToggleFeatured}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
