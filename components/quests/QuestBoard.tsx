"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PullToRefresh } from "@/components/PullToRefresh";
import { refreshPlayerSnapshotFromServer } from "@/lib/client/refreshPlayerSnapshot";
import { Clock, ChevronLeft, Map, QrCode } from "lucide-react";
import type { Character } from "@/lib/types";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import { xpProgressInLevel } from "@/lib/level";
import { QUEST_BOARD_SUBTITLE, QUEST_BOARD_TITLE } from "@/lib/questBoardCatalog";
import { ADMIN_QUEST_FILTER_OPTIONS, type AdminQuestFilter, type UserQuestBoardItem } from "@/lib/adminQuestTypes";
import { buildDailyQuestBoardItems, filterQuestBoardItems } from "@/lib/questBoardDaily";
import { completeAdminQuestRequest, fetchQuestBoardAdminItems } from "@/lib/client/questBoardClient";
import { getAdventurerLabel } from "@/lib/questBoardEngine";
import { queueQuestCelebration } from "@/lib/questBoardCelebration";
import { DIFFICULTY_CSS } from "@/lib/questBoardStyles";
import type { QuestDifficulty } from "@/lib/questBoardCatalog";
import { MobileSwipeBackSurface } from "@/components/mobile/MobileSwipeBackSurface";
import { ApiRequestError } from "@/lib/client/dashboardApi";

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

function questStatusLabel(status: UserQuestBoardItem["status"]): string | null {
  if (status === "available") return "Available";
  if (status === "active" || status === "ready") return "In Progress";
  if (status === "completed") return "Completed";
  if (status === "pending") return "Pending approval";
  return null;
}

function QuestCard({
  item,
  onClaim,
  claiming,
}: {
  item: UserQuestBoardItem;
  onClaim: (item: UserQuestBoardItem) => void;
  claiming: boolean;
}) {
  const style = DIFFICULTY_CSS[item.difficulty as QuestDifficulty] ?? DIFFICULTY_CSS.easy;
  const statusLabel = questStatusLabel(item.status);
  const legendary = item.difficulty === "legendary";
  const showProgress = item.source === "daily" || item.progress.max > 1 || item.progress.current > 0;

  return (
    <article
      className={`cq-quest-card group relative flex flex-col overflow-hidden rounded-2xl border bg-gradient-to-b transition-all duration-300 ${
        legendary
          ? "cq-quest-card-legendary border-amber-400/40 from-amber-500/15 via-cq-card to-fuchsia-500/10 ring-1 ring-amber-400/35"
          : `border-cq-border bg-cq-card shadow-sm ${item.status === "completed" ? "opacity-75" : "hover:-translate-y-0.5"}`
      }`}
    >
      <div className="relative flex flex-1 flex-col p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-cq-subtle">
            {item.source === "daily" ? "📋 Daily" : item.questType.replace("_", " ")}
          </span>
          <span className={`text-[10px] font-bold uppercase tracking-wide ${style.text}`}>{item.difficulty}</span>
        </div>
        <div className="flex items-start gap-3">
          <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl border border-cq-border bg-cq-elevated text-3xl">
            {item.icon}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base font-bold leading-tight text-cq-foreground">{item.name}</h3>
            <p className="mt-1 text-[12px] leading-snug text-cq-muted">{item.description}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-lg border border-uri-gold/35 bg-uri-gold/10 px-2 py-1 text-[11px] font-bold text-uri-gold">
            +{item.xpReward} XP
          </span>
          {item.locationName ? (
            <span className="rounded-lg border border-cq-border bg-cq-elevated px-2 py-1 text-[10px] text-cq-muted">
              📍 {item.locationName}
            </span>
          ) : null}
          {item.requiresQr ? (
            <span className="inline-flex items-center gap-1 rounded-lg border border-cq-border bg-cq-elevated px-2 py-1 text-[10px] text-cq-muted">
              <QrCode className="h-3 w-3" aria-hidden />
              QR required
            </span>
          ) : null}
          {item.endsAt ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-cq-muted">
              <Clock className="h-3 w-3" aria-hidden />
              Ends {new Date(item.endsAt).toLocaleDateString()}
            </span>
          ) : null}
        </div>
        {showProgress ? (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[10px] tabular-nums text-cq-muted">
              <span>
                {item.progress.current} / {item.progress.max}
              </span>
              <span>{item.progress.percent}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-cq-elevated">
              <div
                className="cq-quest-progress h-full rounded-full bg-gradient-to-r from-uri-keaney to-uri-gold transition-all duration-700"
                style={{ width: `${item.progress.percent}%` }}
              />
            </div>
          </div>
        ) : null}
        <div className="mt-4 flex flex-col gap-2">
          {statusLabel ? (
            <p
              className={`text-center text-[11px] font-semibold ${
                item.status === "completed"
                  ? "text-emerald-300/90"
                  : item.status === "pending"
                    ? "text-amber-300/90"
                    : "text-uri-keaney/90"
              }`}
            >
              {statusLabel}
            </p>
          ) : null}
          {item.canClaim && item.source === "admin" ? (
            <button
              type="button"
              disabled={claiming}
              onClick={() => onClaim(item)}
              className="cq-quest-claim w-full rounded-xl bg-gradient-to-b from-uri-gold to-amber-600 py-2.5 text-sm font-bold text-uri-navy shadow-lg transition hover:brightness-110 disabled:opacity-50"
            >
              {claiming ? "Submitting…" : item.completionMethod === "admin_approval" ? "Submit for approval" : "Complete quest"}
            </button>
          ) : null}
          {item.requiresQr && item.status !== "completed" ? (
            <p className="text-center text-[11px] text-cq-subtle">Scan the quest QR code to complete</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function QuestBoard({
  character,
  onRefresh,
  onBack,
}: {
  character: Character;
  onRefresh?: () => void;
  onBack?: () => void;
}) {
  const [filter, setFilter] = useState<AdminQuestFilter>("all");
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
  const allItems = useMemo(() => [...dailyItems, ...adminItems], [dailyItems, adminItems]);
  const filtered = useMemo(
    () => filterQuestBoardItems(allItems, filter, { userLat: userCoords?.lat, userLng: userCoords?.lng }),
    [allItems, filter, userCoords],
  );

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
