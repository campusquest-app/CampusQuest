"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiRequestError, CQ_MISSING_SESSION_CODE, fetchAuthed } from "@/lib/client/dashboardApi";
import { waitForClientAccessToken } from "@/lib/client/apiSession";

const IS_DEV_PREVIEW = process.env.NODE_ENV !== "production";

type ProfileData = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  streak_days?: number | null;
};

type StatsData = {
  level?: number;
  total_xp?: number;
};

type ActiveQuestData = {
  id: string;
  progress_count: number;
  quest: {
    id: string;
    title: string;
    xp_reward: number;
    target_count: number;
  } | null;
};

type GuildData = {
  guild: {
    id: string;
    name: string;
    total_xp: number;
    member_count: number;
  };
};

type LeaderboardsData = {
  players: Array<{ rank: number; user_id: string; total_xp: number; profiles?: { display_name?: string | null; username?: string | null } | null }>;
};

type InventoryData = {
  inventory: Array<{ item_id: string; quantity: number; item?: { name?: string | null } | null }>;
};

type ActiveBossesData = {
  bosses: Array<{
    id: string;
    name: string;
    min_level: number;
    bossProgress: { remainingHp: number; maxHp: number; defeated: boolean };
  }>;
};

type PreviewState = {
  profile: ProfileData | null;
  stats: StatsData | null;
  quests: ActiveQuestData[];
  guild: GuildData | null;
  leaderboards: LeaderboardsData | null;
  inventory: InventoryData | null;
  bosses: ActiveBossesData | null;
};

const EMPTY_STATE: PreviewState = {
  profile: null,
  stats: null,
  quests: [],
  guild: null,
  leaderboards: null,
  inventory: null,
  bosses: null,
};

/**
 * Rolls up live `/api/me/*`, quests, leaderboard, inventory, bosses for internal QA.
 * Intended only behind admin verification (see Internal Admin), not student dashboards.
 */
export function BackendDashboardPreview() {
  const [state, setState] = useState<PreviewState>(EMPTY_STATE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sessionOk = await waitForClientAccessToken(720);
      if (!sessionOk) {
        if (IS_DEV_PREVIEW) {
          console.info("[cq] backend-dashboard-preview", { sessionPresent: false, action: "skip_fetch_pending_session" });
        }
        setState(EMPTY_STATE);
        return;
      }
      if (IS_DEV_PREVIEW) {
        console.info("[cq] backend-dashboard-preview", { sessionPresent: true, action: "fetch_start" });
      }

      const guildPromise = fetchAuthed<GuildData>("/api/guilds/me").catch((guildError: unknown) => {
        if (guildError instanceof ApiRequestError && guildError.status === 404) {
          return null;
        }
        throw guildError;
      });

      const [profile, stats, quests, guild, leaderboards, inventory, bosses] = await Promise.all([
        fetchAuthed<ProfileData>("/api/me/profile"),
        fetchAuthed<StatsData>("/api/me/stats"),
        fetchAuthed<{ quests: ActiveQuestData[] }>("/api/quests/active?limit=3"),
        guildPromise,
        fetchAuthed<LeaderboardsData>("/api/leaderboards"),
        fetchAuthed<InventoryData>("/api/inventory"),
        fetchAuthed<ActiveBossesData>("/api/bosses/active"),
      ]);

      setState({
        profile,
        stats,
        quests: quests.quests ?? [],
        guild,
        leaderboards,
        inventory,
        bosses,
      });
    } catch (fetchError) {
      if (fetchError instanceof ApiRequestError && fetchError.code === CQ_MISSING_SESSION_CODE) {
        if (IS_DEV_PREVIEW) {
          console.info("[cq] backend-dashboard-preview", { sessionPresent: false, action: "missing_session_throw" });
        }
        setError(null);
        setState(EMPTY_STATE);
      } else {
        const message = fetchError instanceof Error ? fetchError.message : "Failed to load backend dashboard preview.";
        setError(message);
        setState(EMPTY_STATE);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const xpProgress = useMemo(() => {
    const totalXp = Number(state.stats?.total_xp ?? 0);
    const level = Math.max(1, Number(state.stats?.level ?? 1));
    const currentLevelBase = 100 * level * (level - 1);
    const nextLevelBase = 100 * (level + 1) * level;
    const needed = Math.max(100, nextLevelBase - currentLevelBase);
    const current = Math.max(0, totalXp - currentLevelBase);
    const pct = Math.max(0, Math.min(100, Math.round((current / needed) * 100)));
    return { current, needed, pct };
  }, [state.stats?.level, state.stats?.total_xp]);

  const topPlayers = (state.leaderboards?.players ?? []).slice(0, 3);
  const inventoryPreview = (state.inventory?.inventory ?? []).slice(0, 3);
  const bossPreview = (state.bosses?.bosses ?? []).slice(0, 2);

  return (
    <section className="card p-4 sm:p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display font-semibold text-white flex items-center gap-2">
              <span aria-hidden>🔌</span> Backend preview
            </h2>
            <p className="text-xs text-white/55 mt-1">
              Live data from API routes for dashboard rollout.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-uri-keaney/40 text-uri-keaney hover:bg-uri-keaney/10 disabled:opacity-60"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
            {error}
          </div>
        )}

        {!error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs text-white/55 mb-1">Current profile</p>
              <p className="text-white font-medium">
                {state.profile?.display_name ?? state.profile?.username ?? "No profile data"}
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs text-white/55 mb-1">Current stats</p>
              <p className="text-white font-medium">
                Lv.{state.stats?.level ?? 1} · {(state.stats?.total_xp ?? 0).toLocaleString()} XP
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3 sm:col-span-2">
              <p className="text-xs text-white/55 mb-1">XP + level progress</p>
              <p className="text-white/90 text-xs mb-2">
                {xpProgress.current} / {xpProgress.needed} XP to next level
              </p>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-uri-keaney rounded-full" style={{ width: `${xpProgress.pct}%` }} />
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs text-white/55 mb-1">Active quests</p>
              {state.quests.length === 0 ? (
                <p className="text-white/60 text-xs">No active quests.</p>
              ) : (
                <ul className="space-y-1 text-xs text-white/90">
                  {state.quests.map((quest) => (
                    <li key={quest.id}>
                      {quest.quest?.title ?? "Untitled quest"} ({quest.progress_count}/{quest.quest?.target_count ?? 1})
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs text-white/55 mb-1">Current guild</p>
              <p className="text-white font-medium">{state.guild?.guild.name ?? "No guild joined"}</p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs text-white/55 mb-1">Leaderboard preview</p>
              {topPlayers.length === 0 ? (
                <p className="text-white/60 text-xs">No leaderboard data.</p>
              ) : (
                <ul className="space-y-1 text-xs text-white/90">
                  {topPlayers.map((player) => (
                    <li key={player.user_id}>
                      #{player.rank} {player.profiles?.display_name ?? player.profiles?.username ?? "Student"}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs text-white/55 mb-1">Inventory preview</p>
              {inventoryPreview.length === 0 ? (
                <p className="text-white/60 text-xs">Inventory is empty.</p>
              ) : (
                <ul className="space-y-1 text-xs text-white/90">
                  {inventoryPreview.map((item) => (
                    <li key={item.item_id}>
                      {item.item?.name ?? item.item_id} x{item.quantity}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3 sm:col-span-2">
              <p className="text-xs text-white/55 mb-1">Active bosses preview</p>
              {bossPreview.length === 0 ? (
                <p className="text-white/60 text-xs">No active bosses.</p>
              ) : (
                <ul className="space-y-1 text-xs text-white/90">
                  {bossPreview.map((boss) => (
                    <li key={boss.id}>
                      {boss.name} ({boss.bossProgress.remainingHp}/{boss.bossProgress.maxHp} HP)
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
    </section>
  );
}
