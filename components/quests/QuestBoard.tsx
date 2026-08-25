"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PullToRefresh } from "@/components/PullToRefresh";
import { refreshPlayerSnapshotFromServer } from "@/lib/client/refreshPlayerSnapshot";
import { ChevronLeft, Map } from "lucide-react";
import type { Character } from "@/lib/types";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import { xpProgressInLevel } from "@/lib/level";
import { QUEST_BOARD_SUBTITLE, QUEST_BOARD_TITLE } from "@/lib/questBoardCatalog";
import { ADMIN_QUEST_FILTER_OPTIONS, type AdminQuestFilter, type UserQuestBoardItem } from "@/lib/adminQuestTypes";
import { buildDailyQuestBoardItems, filterQuestBoardItems } from "@/lib/questBoardDaily";
import { filterQuestsForFeatureFlags } from "@/lib/featureFlags";
import { completeAdminQuestRequest, fetchQuestBoardAdminItems } from "@/lib/client/questBoardClient";
import { getAdventurerLabel } from "@/lib/questBoardEngine";
import { queueQuestCelebration } from "@/lib/questBoardCelebration";
import { QuestCard } from "@/components/quests/QuestCard";
import { MobileSwipeBackSurface } from "@/components/mobile/MobileSwipeBackSurface";
import { ApiRequestError } from "@/lib/client/dashboardApi";
import { useRecommendationProfile } from "@/lib/client/useRecommendationProfile";
import {
  questToRecommendationEntity,
  rankRecommendationEntities,
  recommendationTimeBucket,
} from "@/lib/recommendations";

function QuestFilterNav({
  filter,
  onFilterChange,
}: {
  filter: AdminQuestFilter;
  onFilterChange: (next: AdminQuestFilter) => void;
}) {
  return (
    <nav className="cq-quest-filter-nav" aria-label="Quest filters">
      <div className="-mx-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max min-w-full gap-1.5 pr-1">
          {ADMIN_QUEST_FILTER_OPTIONS.map((opt) => {
            const active = filter === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onFilterChange(opt.id)}
                aria-pressed={active}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition touch-manipulation ${
                  active
                    ? "border-uri-keaney/50 bg-uri-keaney text-white shadow-[0_0_16px_-4px_rgba(104,171,232,0.55)]"
                    : "border-cq-border bg-cq-card/60 text-cq-muted hover:border-cq-border-strong hover:text-cq-foreground"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

function QuestBoardHero({
  character,
  xpPct,
  current,
  needed,
  activeCount,
  completedCount,
}: {
  character: Character;
  xpPct: number;
  current: number;
  needed: number;
  activeCount: number;
  completedCount: number;
}) {
  return (
    <section className="cq-hall-content-card cq-quest-board-hero space-y-3 p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <div className="cq-profile-avatar-shell relative h-14 w-14 shrink-0">
          <div className="cq-profile-avatar-inner h-full w-full overflow-hidden rounded-full border border-uri-keaney/35">
            <AvatarDisplay
              avatar={character.avatar}
              fitParent
              size={56}
              className="rounded-full"
              classId={character.classId}
              starterWeapon={character.starterWeapon}
            />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-lg font-bold text-cq-foreground">{character.name}</h2>
          <p className="truncate text-sm text-cq-muted">@{character.username}</p>
        </div>
      </div>
      <p className="text-sm font-semibold text-uri-keaney/95">{getAdventurerLabel(character)}</p>
      <p className="font-display text-xl font-black tabular-nums text-white sm:text-2xl">
        {character.totalXP.toLocaleString()} <span className="text-sm font-bold text-uri-gold/90">XP</span>
      </p>
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] font-medium tabular-nums text-cq-muted">
          <span>
            {current.toLocaleString()} / {needed.toLocaleString()} this level
          </span>
          <span>{xpPct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-cq-elevated">
          <div
            className="cq-quest-progress h-full rounded-full bg-gradient-to-r from-uri-keaney to-uri-gold transition-all duration-700"
            style={{ width: `${xpPct}%` }}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-[11px] font-medium text-cq-subtle">
        <span className="rounded-full border border-cq-border bg-cq-elevated px-2.5 py-1">{activeCount} in progress</span>
        <span className="rounded-full border border-cq-border bg-cq-elevated px-2.5 py-1">{completedCount} completed</span>
      </div>
    </section>
  );
}

export function QuestBoard({
  character,
  onRefresh,
  onBack,
  personalization,
}: {
  character: Character;
  onRefresh?: () => void;
  onBack?: () => void;
  personalization?: {
    interests?: string[];
    communities?: string[];
    institutionId?: string | null;
    studentStatus?: string | null;
  } | null;
}) {
  const [filter, setFilter] = useState<AdminQuestFilter>("all");
  const recProfile = useRecommendationProfile(personalization);
  const [localCharacter, setLocalCharacter] = useState(character);
  const [adminItems, setAdminItems] = useState<UserQuestBoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    setLocalCharacter(character);
  }, [character]);

  const loadBoard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await fetchQuestBoardAdminItems();
      setAdminItems(items);
    } catch (err) {
      if (!(err instanceof ApiRequestError && err.status === 401)) {
        setError(err instanceof Error ? err.message : "Could not load quests.");
      }
      setAdminItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    if (filter !== "nearby" || userCoords) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => undefined,
      { maximumAge: 120_000, timeout: 8000 },
    );
  }, [filter, userCoords]);

  useEffect(() => {
    const onFocus = () => void loadBoard();
    window.addEventListener("focus", onFocus);
    const interval = window.setInterval(() => void loadBoard(), 60_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
    };
  }, [loadBoard]);

  const dailyItems = useMemo(() => buildDailyQuestBoardItems(localCharacter.id), [localCharacter.id, loading]);
  const allItems = useMemo(
    () => filterQuestsForFeatureFlags([...dailyItems, ...adminItems]),
    [dailyItems, adminItems],
  );
  const filtered = useMemo(() => {
    const next = filterQuestBoardItems(allItems, filter, { userLat: userCoords?.lat, userLng: userCoords?.lng });
    if (filter === "nearby") return next;
    return rankRecommendationEntities({
      items: next,
      toEntity: questToRecommendationEntity,
      profile: recProfile,
      nowMs: recommendationTimeBucket(),
    }).map((row) => row.item);
  }, [allItems, filter, userCoords, recProfile]);

  const activeCount = allItems.filter((i) => i.status === "active" || i.status === "ready").length;
  const completedCount = allItems.filter((i) => i.status === "completed").length;
  const { current, needed } = xpProgressInLevel(localCharacter.totalXP);
  const xpPct = Math.min(100, (current / needed) * 100);

  const handlePullRefresh = useCallback(async () => {
    const next = await refreshPlayerSnapshotFromServer();
    if (next) setLocalCharacter({ ...next });
    await loadBoard();
    onRefresh?.();
  }, [loadBoard, onRefresh]);

  const handleClaim = useCallback(
    async (item: UserQuestBoardItem) => {
      if (item.source !== "admin") return;
      setClaimingId(item.id);
      try {
        const result = await completeAdminQuestRequest(item.id);
        queueQuestCelebration({
          questId: item.id,
          questName: item.name,
          icon: item.icon,
          xpReward: result.xpAwarded || item.xpReward,
        });
        await loadBoard();
        const next = await refreshPlayerSnapshotFromServer();
        if (next) setLocalCharacter({ ...next });
        onRefresh?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not complete quest.");
      } finally {
        setClaimingId(null);
      }
    },
    [loadBoard, onRefresh],
  );

  const filterLabel = ADMIN_QUEST_FILTER_OPTIONS.find((f) => f.id === filter)?.label ?? "Quests";

  const boardContent = (
    <div className="cq-quest-board cq-tab-shell relative min-h-[60vh] overflow-hidden rounded-2xl">
      <div className="cq-quest-board-bg pointer-events-none absolute inset-0" aria-hidden />
      <div className="cq-quest-board-particles pointer-events-none absolute inset-0" aria-hidden />

      <div className="relative z-[1] space-y-3 px-4 py-5 sm:px-6 sm:py-6">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="cq-quest-board-back touch-manipulation"
            aria-label="Go back"
          >
            <ChevronLeft className="h-5 w-5 shrink-0" strokeWidth={2.25} aria-hidden />
            Back
          </button>
        ) : null}

        <header className="cq-quest-board-header">
            <p className="cq-quest-eyebrow mb-2 font-display text-[11px] font-semibold uppercase tracking-[0.32em] text-uri-keaney/90">
              Guild Hall · Bounty Board
            </p>
            <h1 className="font-display text-2xl font-black uppercase tracking-[0.12em] text-white sm:text-3xl">
              {QUEST_BOARD_TITLE}
            </h1>
            <p className="mt-2 text-sm font-medium tracking-wide text-white/60">{QUEST_BOARD_SUBTITLE}</p>
          </header>

          <QuestBoardHero
            character={localCharacter}
            xpPct={xpPct}
            current={current}
            needed={needed}
            activeCount={activeCount}
            completedCount={completedCount}
          />

          <section className="cq-hall-content-card cq-quest-filter-panel overflow-hidden">
            <div className="sticky top-0 z-10 border-b border-cq-border/80 bg-cq-card/95 px-4 py-3 backdrop-blur-sm sm:px-5">
              <QuestFilterNav filter={filter} onFilterChange={setFilter} />
            </div>
            <div className="px-4 py-3 sm:px-5 sm:py-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-cq-subtle">{filterLabel}</p>
              {loading ? (
                <p className="rounded-xl border border-cq-border bg-cq-secondary px-4 py-10 text-center text-sm text-cq-subtle">
                  Loading quests…
                </p>
              ) : error ? (
                <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-10 text-center text-sm text-rose-200">
                  {error}
                </p>
              ) : filtered.length === 0 ? (
                <p className="rounded-xl border border-cq-border bg-cq-secondary px-4 py-10 text-center text-sm text-cq-subtle">
                  No quests match this filter. Check back later for new campus quests.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filtered.map((item) => (
                    <QuestCard
                      key={item.id}
                      item={item}
                      onClaim={(q) => void handleClaim(q)}
                      claiming={claimingId === item.id}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>

          <p className="flex items-center justify-center gap-2 pb-1 text-center text-[11px] text-cq-subtle">
            <Map className="h-3.5 w-3.5" aria-hidden />
            Complete daily quests by logging activities. Campus quests are created by admins.
          </p>
        </div>
      </div>
  );

  return (
    <PullToRefresh onRefresh={handlePullRefresh}>
      {onBack ? (
        <MobileSwipeBackSurface onBack={onBack} className="block">
          {boardContent}
        </MobileSwipeBackSurface>
      ) : (
        boardContent
      )}
    </PullToRefresh>
  );
}
