"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { Clock, Trophy } from "lucide-react";
import { getCharacterById } from "@/lib/friendsStore";
import { getGuildDisplayLevel, getGuilds, GUILD_INTEREST_LABELS } from "@/lib/guildStore";
import type { Guild } from "@/lib/types";
import { GuildEmblem } from "@/components/guild/GuildEmblem";
import { fetchAuthed } from "@/lib/client/dashboardApi";
import { scheduleNonCriticalWork } from "@/lib/client/deferNonCriticalWork";
import { refreshPlayerSnapshotFromServer } from "@/lib/client/refreshPlayerSnapshot";
import { PullToRefresh } from "@/components/PullToRefresh";
import type { Character } from "@/lib/types";
import { STAT_KEYS, STAT_LABELS, STAT_ICONS } from "@/lib/types";
import { AvatarDisplay } from "./AvatarDisplay";
import { AchievementShowcaseStrip } from "./achievements/AchievementShowcaseStrip";

type SortBy = "level" | (typeof STAT_KEYS)[number] | "bossesDefeated" | "finalBossesDefeated" | "guildLevel";

const SORT_OPTIONS: { value: SortBy; label: string; icon: string }[] = [
  { value: "level", label: "Level", icon: "⭐" },
  ...STAT_KEYS.map((key) => ({ value: key as SortBy, label: STAT_LABELS[key], icon: STAT_ICONS[key] })),
  { value: "bossesDefeated", label: "Bosses defeated", icon: "⚔️" },
  { value: "finalBossesDefeated", label: "Final bosses defeated", icon: "👑" },
  { value: "guildLevel", label: "Guild level", icon: "🛡️" },
];

const SCHOLAR_GUILDS = [
  { id: "arts_sciences", name: "College of Arts & Sciences", crest: "📚" },
  { id: "business", name: "College of Business", crest: "💼" },
  { id: "education", name: "College of Education", crest: "🧑‍🏫" },
  { id: "engineering", name: "College of Engineering", crest: "⚙️" },
  { id: "health_sciences", name: "College of Health Sciences", crest: "🩺" },
  { id: "environment_life_sciences", name: "College of Environment & Life Sciences", crest: "🌿" },
  { id: "nursing", name: "College of Nursing", crest: "💙" },
  { id: "pharmacy", name: "College of Pharmacy", crest: "💊" },
  { id: "undecided", name: "Undecided Scholars", crest: "🎓" },
];

const SCHOLAR_GUILD_SEED_MEMBERS = [
  // Arts & Sciences
  { guildId: "arts_sciences", name: "Alex Carter", totalXP: 420, avatar: "📘" },
  { guildId: "arts_sciences", name: "Priya Desai", totalXP: 380, avatar: "📗" },
  { guildId: "arts_sciences", name: "Evan Morales", totalXP: 360, avatar: "📙" },
  { guildId: "arts_sciences", name: "Jordan Li", totalXP: 340, avatar: "📖" },
  { guildId: "arts_sciences", name: "Sofia Ramirez", totalXP: 325, avatar: "🖋️" },
  { guildId: "arts_sciences", name: "Logan Bennett", totalXP: 310, avatar: "🎨" },
  { guildId: "arts_sciences", name: "Hannah Cole", totalXP: 295, avatar: "🎭" },
  { guildId: "arts_sciences", name: "Mateo Silva", totalXP: 280, avatar: "📚" },
  { guildId: "arts_sciences", name: "Grace Young", totalXP: 265, avatar: "✏️" },
  { guildId: "arts_sciences", name: "Omar Aziz", totalXP: 250, avatar: "📜" },
  { guildId: "arts_sciences", name: "Avery Ross", totalXP: 235, avatar: "📒" },

  // Business
  { guildId: "business", name: "Jordan Reyes", totalXP: 430, avatar: "📊" },
  { guildId: "business", name: "Lena Howard", totalXP: 390, avatar: "💳" },
  { guildId: "business", name: "Marcus Allen", totalXP: 370, avatar: "💹" },
  { guildId: "business", name: "Emily Chen", totalXP: 350, avatar: "🏦" },
  { guildId: "business", name: "Tyler Scott", totalXP: 330, avatar: "📈" },
  { guildId: "business", name: "Riya Kapoor", totalXP: 310, avatar: "🧾" },
  { guildId: "business", name: "Dylan Price", totalXP: 295, avatar: "💼" },
  { guildId: "business", name: "Bella Martinez", totalXP: 280, avatar: "📋" },
  { guildId: "business", name: "Owen Carter", totalXP: 265, avatar: "💰" },
  { guildId: "business", name: "Chloe Nguyen", totalXP: 250, avatar: "📌" },
  { guildId: "business", name: "Isaac Lopez", totalXP: 235, avatar: "🧮" },

  // Education
  { guildId: "education", name: "Sam Patel", totalXP: 360, avatar: "📝" },
  { guildId: "education", name: "Mia Robinson", totalXP: 340, avatar: "📓" },
  { guildId: "education", name: "Aiden Brooks", totalXP: 325, avatar: "📎" },
  { guildId: "education", name: "Lila Gomez", totalXP: 310, avatar: "📚" },
  { guildId: "education", name: "Ethan Wright", totalXP: 295, avatar: "🧑‍🏫" },
  { guildId: "education", name: "Nora Hayes", totalXP: 280, avatar: "✏️" },
  { guildId: "education", name: "Caleb Morris", totalXP: 265, avatar: "📒" },
  { guildId: "education", name: "Riley James", totalXP: 250, avatar: "📘" },
  { guildId: "education", name: "Zoe Carter", totalXP: 235, avatar: "📗" },
  { guildId: "education", name: "Noah Green", totalXP: 220, avatar: "📙" },
  { guildId: "education", name: "Isla Ford", totalXP: 205, avatar: "📖" },

  // Engineering
  { guildId: "engineering", name: "Riley Nguyen", totalXP: 440, avatar: "🔧" },
  { guildId: "engineering", name: "Diego Alvarez", totalXP: 420, avatar: "🛠️" },
  { guildId: "engineering", name: "Linh Tran", totalXP: 400, avatar: "📐" },
  { guildId: "engineering", name: "Mason Clark", totalXP: 385, avatar: "📏" },
  { guildId: "engineering", name: "Sara Khan", totalXP: 370, avatar: "💡" },
  { guildId: "engineering", name: "Leo Turner", totalXP: 355, avatar: "⚙️" },
  { guildId: "engineering", name: "Ariana Flores", totalXP: 340, avatar: "🔩" },
  { guildId: "engineering", name: "Jasper Lin", totalXP: 325, avatar: "🧪" },
  { guildId: "engineering", name: "Mila Brooks", totalXP: 310, avatar: "🧰" },
  { guildId: "engineering", name: "Hudson Lee", totalXP: 295, avatar: "🔬" },
  { guildId: "engineering", name: "Ivy Sanders", totalXP: 280, avatar: "🛰️" },

  // Health Sciences
  { guildId: "health_sciences", name: "Casey Ortiz", totalXP: 380, avatar: "🧬" },
  { guildId: "health_sciences", name: "Nia Thompson", totalXP: 360, avatar: "🫀" },
  { guildId: "health_sciences", name: "Griffin Shaw", totalXP: 345, avatar: "🧫" },
  { guildId: "health_sciences", name: "Aaliyah Stone", totalXP: 330, avatar: "🧬" },
  { guildId: "health_sciences", name: "Logan Pierce", totalXP: 315, avatar: "🧪" },
  { guildId: "health_sciences", name: "Ruby Adams", totalXP: 300, avatar: "💊" },
  { guildId: "health_sciences", name: "Owen Fisher", totalXP: 285, avatar: "🩺" },
  { guildId: "health_sciences", name: "Chase Rivera", totalXP: 270, avatar: "🩹" },
  { guildId: "health_sciences", name: "Lena Brooks", totalXP: 255, avatar: "🧻" },
  { guildId: "health_sciences", name: "Faith Long", totalXP: 240, avatar: "🧴" },
  { guildId: "health_sciences", name: "Eli Parker", totalXP: 225, avatar: "🧼" },

  // Environment & Life Sciences
  { guildId: "environment_life_sciences", name: "Morgan Lee", totalXP: 360, avatar: "🌎" },
  { guildId: "environment_life_sciences", name: "Owen Brooks", totalXP: 340, avatar: "🌱" },
  { guildId: "environment_life_sciences", name: "Hazel Kim", totalXP: 325, avatar: "🌿" },
  { guildId: "environment_life_sciences", name: "River James", totalXP: 310, avatar: "🌊" },
  { guildId: "environment_life_sciences", name: "Sienna Lopez", totalXP: 295, avatar: "🌤️" },
  { guildId: "environment_life_sciences", name: "Theo Grant", totalXP: 280, avatar: "🦋" },
  { guildId: "environment_life_sciences", name: "Lila Stone", totalXP: 265, avatar: "🍃" },
  { guildId: "environment_life_sciences", name: "Arlo King", totalXP: 250, avatar: "🌾" },
  { guildId: "environment_life_sciences", name: "Jun Park", totalXP: 235, avatar: "🍀" },
  { guildId: "environment_life_sciences", name: "Piper Cruz", totalXP: 220, avatar: "🌻" },
  { guildId: "environment_life_sciences", name: "Rowan Hill", totalXP: 205, avatar: "🌲" },

  // Nursing
  { guildId: "nursing", name: "Taylor Kim", totalXP: 390, avatar: "🩹" },
  { guildId: "nursing", name: "Isabella Rossi", totalXP: 370, avatar: "🧑‍⚕️" },
  { guildId: "nursing", name: "Quinn Foster", totalXP: 355, avatar: "🩺" },
  { guildId: "nursing", name: "Liam Torres", totalXP: 340, avatar: "💊" },
  { guildId: "nursing", name: "Amara Singh", totalXP: 325, avatar: "🩻" },
  { guildId: "nursing", name: "Brooke Hayes", totalXP: 310, avatar: "🧴" },
  { guildId: "nursing", name: "Kai Morgan", totalXP: 295, avatar: "💉" },
  { guildId: "nursing", name: "Olivia Shaw", totalXP: 280, avatar: "🧼" },
  { guildId: "nursing", name: "Elias Ward", totalXP: 265, avatar: "🧪" },
  { guildId: "nursing", name: "Sage Bell", totalXP: 250, avatar: "🧫" },
  { guildId: "nursing", name: "Maya Cruz", totalXP: 235, avatar: "🩺" },

  // Pharmacy
  { guildId: "pharmacy", name: "Jamie Park", totalXP: 385, avatar: "🧪" },
  { guildId: "pharmacy", name: "Noah Clarke", totalXP: 365, avatar: "💉" },
  { guildId: "pharmacy", name: "Ava Mitchell", totalXP: 350, avatar: "💊" },
  { guildId: "pharmacy", name: "Ethan Rivera", totalXP: 335, avatar: "🧫" },
  { guildId: "pharmacy", name: "Lily Chen", totalXP: 320, avatar: "🧴" },
  { guildId: "pharmacy", name: "Carter James", totalXP: 305, avatar: "🧪" },
  { guildId: "pharmacy", name: "Zoey Carter", totalXP: 290, avatar: "📘" },
  { guildId: "pharmacy", name: "Miles Brown", totalXP: 275, avatar: "📗" },
  { guildId: "pharmacy", name: "Aria Lee", totalXP: 260, avatar: "📙" },
  { guildId: "pharmacy", name: "Jude Foster", totalXP: 245, avatar: "📚" },
  { guildId: "pharmacy", name: "Nolan Price", totalXP: 230, avatar: "📒" },

  // Undecided
  { guildId: "undecided", name: "Chris Allen", totalXP: 210, avatar: "🎒" },
  { guildId: "undecided", name: "Harper Green", totalXP: 200, avatar: "📎" },
  { guildId: "undecided", name: "Rory Blake", totalXP: 190, avatar: "📓" },
  { guildId: "undecided", name: "Skyler Jones", totalXP: 180, avatar: "🧠" },
  { guildId: "undecided", name: "Peyton Hall", totalXP: 170, avatar: "📘" },
  { guildId: "undecided", name: "Jules Carter", totalXP: 160, avatar: "📗" },
  { guildId: "undecided", name: "River Fox", totalXP: 150, avatar: "📙" },
  { guildId: "undecided", name: "Blake Simmons", totalXP: 140, avatar: "📚" },
  { guildId: "undecided", name: "Emerson Lee", totalXP: 130, avatar: "📒" },
  { guildId: "undecided", name: "Kendall Watts", totalXP: 120, avatar: "📝" },
  { guildId: "undecided", name: "Sasha Nguyen", totalXP: 110, avatar: "📎" },
];

type XpLeaderboardRowUi = {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  level: number;
  totalXp: number;
  avatar: string;
  strength: number;
  stamina: number;
  knowledge: number;
  social: number;
  focus: number;
  bossesDefeated: number;
  finalBossesDefeated: number;
};

type XpLeaderboardPayload = {
  topUsers: XpLeaderboardRowUi[];
  currentUserRank: number | null;
  currentUserEntry: XpLeaderboardRowUi | null;
  totalRankedUsers: number;
};

function xpLeaderboardMetricProps(sortBy: SortBy, row: XpLeaderboardRowUi) {
  if (sortBy === "guildLevel" || sortBy === "level") {
    return { sortBy: "level" as const };
  }
  const map: Partial<Record<SortBy, { key: keyof XpLeaderboardRowUi; label: string }>> = {
    strength: { key: "strength", label: STAT_LABELS.strength },
    stamina: { key: "stamina", label: STAT_LABELS.stamina },
    knowledge: { key: "knowledge", label: STAT_LABELS.knowledge },
    social: { key: "social", label: STAT_LABELS.social },
    focus: { key: "focus", label: STAT_LABELS.focus },
    bossesDefeated: { key: "bossesDefeated", label: "Bosses defeated" },
    finalBossesDefeated: { key: "finalBossesDefeated", label: "Final bosses defeated" },
  };
  const spec = map[sortBy];
  if (!spec) return { sortBy: "level" as const };
  const raw = row[spec.key];
  const statValue = typeof raw === "number" ? raw : Number(raw ?? 0);
  return { sortBy, statValue, statLabel: spec.label };
}

export function Leaderboards({
  character,
  onRefresh,
  onViewProfile,
}: {
  character: Character;
  onRefresh?: () => void;
  onViewProfile?: (userId: string) => void;
}) {
  const [sortBy, setSortBy] = useState<SortBy>("level");
  const [expandedGuildId, setExpandedGuildId] = useState<string | null>(null);
  const [expandedScholarGuildId, setExpandedScholarGuildId] = useState<string | null>(null);
  const [xpTab, setXpTab] = useState<"campus" | "friends">("campus");
  const [campusLb, setCampusLb] = useState<XpLeaderboardPayload | null>(null);
  const [friendsLb, setFriendsLb] = useState<XpLeaderboardPayload | null>(null);
  const [xpLoading, setXpLoading] = useState(false);
  const [xpError, setXpError] = useState<string | null>(null);

  const scholarGuildsRanked = useMemo(() => {
    return SCHOLAR_GUILDS.map((g) => {
      const baseMembers = SCHOLAR_GUILD_SEED_MEMBERS.filter((m) => m.guildId === g.id);
      const members = [...baseMembers];
      if (character.scholarGuildId === g.id || (!character.scholarGuildId && g.id === "undecided")) {
        members.push({
          guildId: g.id,
          name: character.name,
          totalXP: character.totalXP,
          avatar: character.avatar,
        });
      }
      const totalXP = members.reduce((sum, m) => sum + m.totalXP, 0);
      return {
        id: g.id,
        name: g.name,
        crest: g.crest,
        totalXP,
        members,
      };
    }).sort((a, b) => b.totalXP - a.totalXP);
  }, [character]);

  const guildsSorted = useMemo(() => {
    const list = getGuilds();
    return [...list].sort((a, b) => {
      const levelA = getGuildDisplayLevel(a);
      const levelB = getGuildDisplayLevel(b);
      if (levelB !== levelA) return levelB - levelA;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }, []);

  const userGuildRank = useMemo(() => {
    const ids = character.guildIds ?? [];
    if (ids.length === 0 || guildsSorted.length === 0) return null;
    let best: { guild: Guild; rank: number } | null = null;
    for (const guildId of ids) {
      const index = guildsSorted.findIndex((g) => g.id === guildId);
      if (index < 0) continue;
      const rank = index + 1;
      if (!best || rank < best.rank) {
        best = { guild: guildsSorted[index], rank };
      }
    }
    return best;
  }, [character.guildIds, guildsSorted]);

  const loadXpLeaderboards = useCallback(async () => {
    if (sortBy === "guildLevel") return;
    setXpLoading(true);
    setXpError(null);
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    try {
      const qs = new URLSearchParams({ sort: sortBy }).toString();
      const [c, f] = await Promise.all([
        fetchAuthed<XpLeaderboardPayload>(`/api/leaderboards/campus?${qs}`),
        fetchAuthed<XpLeaderboardPayload>(`/api/leaderboards/friends?${qs}`),
      ]);
      setCampusLb(c);
      setFriendsLb(f);
      const campusMe = c.currentUserEntry;
      const friendsMe = f.currentUserEntry;
      if (campusMe || friendsMe) {
        console.info("[cq][leaderboard] profile vs leaderboard", {
          profileLevel: character.level,
          profileTotalXp: character.totalXP,
          campusLevel: campusMe?.level ?? null,
          campusTotalXp: campusMe?.totalXp ?? null,
          friendsLevel: friendsMe?.level ?? null,
          friendsTotalXp: friendsMe?.totalXp ?? null,
        });
      }
      if (typeof performance !== "undefined") {
        console.log("[cq:load] leaderboards campus+friends", Math.round(performance.now() - t0), "ms");
      }
    } catch (err) {
      setXpError(err instanceof Error ? err.message : "Could not load leaderboards.");
      setCampusLb(null);
      setFriendsLb(null);
    } finally {
      setXpLoading(false);
    }
  }, [sortBy, character.level, character.totalXP]);

  const handlePullRefresh = useCallback(async () => {
    await Promise.all([loadXpLeaderboards(), refreshPlayerSnapshotFromServer()]);
    onRefresh?.();
  }, [loadXpLeaderboards, onRefresh]);

  useEffect(() => {
    if (sortBy === "guildLevel") return;
    let cancelled = false;
    const deferId = scheduleNonCriticalWork(() => {
      if (cancelled) return;
      void loadXpLeaderboards();
    });
    return () => {
      cancelled = true;
      window.clearTimeout(deferId);
    };
  }, [loadXpLeaderboards, sortBy]);

  const xpActive = xpTab === "campus" ? campusLb : friendsLb;
  const xpFriendsEmpty =
    xpTab === "friends" && !xpLoading && !xpError && (xpActive?.totalRankedUsers ?? 0) === 0;
  const xpCampusEmpty = xpTab === "campus" && !xpLoading && !xpError && (xpActive?.totalRankedUsers ?? 0) === 0;
  const xpHasBoard = Boolean(!xpLoading && !xpError && xpActive != null && xpActive.totalRankedUsers > 0);

  const xpInTopSlice = xpActive?.topUsers.some((row) => row.userId === character.id) ?? false;

  const xpShowPinnedCard = xpHasBoard && xpActive?.currentUserEntry != null && !xpInTopSlice;

  const xpSortLabel = useMemo(
    () => SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? "Level",
    [sortBy],
  );

  const podiumUsers = useMemo(() => {
    if (!xpActive?.topUsers.length) return [];
    return ([2, 1, 3] as const)
      .map((rank) => xpActive.topUsers.find((row) => row.rank === rank))
      .filter((row): row is XpLeaderboardRowUi => row != null);
  }, [xpActive?.topUsers]);

  const listUsers = useMemo(() => {
    if (!xpActive?.topUsers.length) return [];
    return xpActive.topUsers.filter((row) => row.rank > 3);
  }, [xpActive?.topUsers]);

  const statSortOptions = SORT_OPTIONS.filter((opt) => opt.value !== "level" && opt.value !== "guildLevel");

  return (
    <PullToRefresh onRefresh={handlePullRefresh} disabled={xpLoading}>
    <section className="cq-lb-shell cq-tab-shell">
      <header className="cq-lb-header cq-screen-header sticky top-0 z-10">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="cq-screen-header__title">Leaderboard</h1>
            <p className="cq-screen-header__subtitle">Compete with other Rams</p>
          </div>
          <button
            type="button"
            className="cq-lb-timeframe cq-lb-timeframe--active shrink-0"
            aria-label="Leaderboard timeframe: all time"
            aria-pressed="true"
          >
            <Clock className="h-3 w-3" aria-hidden strokeWidth={2.25} />
            All time
          </button>
        </div>
      </header>

      <div className="cq-lb-filters" data-no-drawer-swipe="true" data-cq-gesture-block="all">
        <div className="cq-lb-filters-row" role="tablist" aria-label="Leaderboard category">
          <button
            type="button"
            role="tab"
            aria-selected={sortBy !== "guildLevel"}
            onClick={() => {
              if (sortBy === "guildLevel") setSortBy("level");
            }}
            className={`cq-lb-filter ${sortBy !== "guildLevel" ? "cq-lb-filter--active" : ""}`}
          >
            Overall XP
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sortBy === "guildLevel"}
            onClick={() => setSortBy("guildLevel")}
            className={`cq-lb-filter ${sortBy === "guildLevel" ? "cq-lb-filter--active" : ""}`}
          >
            Guilds
          </button>
        </div>

        {sortBy !== "guildLevel" ? (
          <>
            <div className="cq-lb-scope-track" role="tablist" aria-label="Leaderboard scope">
              <button
                type="button"
                role="tab"
                aria-selected={xpTab === "campus"}
                onClick={() => setXpTab("campus")}
                className={`cq-lb-scope flex-1 ${xpTab === "campus" ? "cq-lb-scope--active" : ""}`}
              >
                Campus
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={xpTab === "friends"}
                onClick={() => setXpTab("friends")}
                className={`cq-lb-scope flex-1 ${xpTab === "friends" ? "cq-lb-scope--active" : ""}`}
              >
                Friends
              </button>
            </div>
            <LeaderboardStatFilterScroll sortBy={sortBy} onSortByChange={setSortBy} options={statSortOptions} />
          </>
        ) : null}
      </div>

      {sortBy === "guildLevel" ? (
        <div className="cq-lb-panel cq-lb-guild-panel p-3 sm:p-4">
          <div className="cq-lb-guild-intro">
            <h2 className="cq-lb-guild-intro-title">Guild leaderboard</h2>
            <p className="cq-lb-guild-intro-copy">
              Guilds level up when members quest, post, and scan together. Climb as a team.
            </p>
          </div>

          {guildsSorted.length === 0 ? (
            <LeaderboardEmptyState message="No guilds yet." detail="Create or join one in Find Friends to start climbing rankings." />
          ) : (
            <div className="space-y-3">
              <GuildChampionHero guild={guildsSorted[0]} />

              {userGuildRank ? (
                <GuildYourPositionBanner
                  rank={userGuildRank.rank}
                  guildName={userGuildRank.guild.name}
                  totalGuilds={guildsSorted.length}
                  isChampion={userGuildRank.rank === 1}
                />
              ) : null}

              {guildsSorted.length > 1 ? (
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50">Rankings</h3>
                    <span className="text-[10px] text-white/40 tabular-nums">{guildsSorted.length} guilds</span>
                  </div>
                  <ul className="space-y-2 cq-lb-guild-list" aria-label="Guild rankings">
                    {guildsSorted.slice(1).map((guild, index) => (
                      <GuildRankRow
                        key={guild.id}
                        guild={guild}
                        rank={index + 2}
                        isMember={character.guildIds?.includes(guild.id) ?? false}
                        isExpanded={expandedGuildId === guild.id}
                        onToggle={() => setExpandedGuildId(expandedGuildId === guild.id ? null : guild.id)}
                      />
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="cq-lb-arena space-y-3">
            {xpError ? (
              <div className="cq-lb-state cq-lb-state--error" role="alert">
                <p className="font-medium text-rose-100">Couldn&apos;t load leaderboard.</p>
                <p className="text-sm text-rose-100/80 mt-1">Pull to refresh or try again.</p>
              </div>
            ) : null}

            {xpLoading ? (
              <div className="cq-lb-state" role="status" aria-live="polite">
                <p className="text-white/70">Loading leaderboard…</p>
                <XpLeaderboardSkeleton />
              </div>
            ) : xpFriendsEmpty ? (
              <LeaderboardEmptyState
                message="No leaderboard data yet."
                detail={`Add friends to compare rankings by ${xpSortLabel.toLowerCase()}.`}
              />
            ) : xpCampusEmpty ? (
              <LeaderboardEmptyState
                message="No leaderboard data yet."
                detail="As more students verify their school email, the campus leaderboard fills in."
              />
            ) : xpHasBoard && xpActive ? (
              <div className="space-y-3">
                {podiumUsers.length > 0 ? (
                  <TopThreePodium
                    users={podiumUsers}
                    currentUserId={character.id}
                    sortBy={sortBy}
                    character={character}
                    onViewProfile={onViewProfile}
                    metricProps={xpLeaderboardMetricProps}
                  />
                ) : null}

                {xpActive.currentUserRank != null ? (
                  <XpRankHighlight
                    rank={xpActive.currentUserRank}
                    totalRanked={xpActive.totalRankedUsers}
                    mode={xpTab}
                    sortLabel={xpSortLabel}
                  />
                ) : null}

                {xpShowPinnedCard && xpActive.currentUserEntry ? (
                  <div className="cq-lb-you-card rounded-xl border border-uri-keaney/35 bg-uri-keaney/[0.08] p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-uri-keaney mb-1.5">Your rank</p>
                    <LeaderboardRow
                      userId={xpActive.currentUserEntry.userId}
                      rank={xpActive.currentUserEntry.rank}
                      name={xpActive.currentUserEntry.displayName}
                      username={xpActive.currentUserEntry.username}
                      avatar={xpActive.currentUserEntry.avatar}
                      level={xpActive.currentUserEntry.level}
                      totalXP={xpActive.currentUserEntry.totalXp}
                      isCurrentUser
                      showcaseCharacter={character}
                      onViewProfile={onViewProfile}
                      {...xpLeaderboardMetricProps(sortBy, xpActive.currentUserEntry)}
                    />
                  </div>
                ) : null}

                {listUsers.length > 0 ? (
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50">Rankings</h3>
                      <span className="text-[10px] text-white/40 tabular-nums">
                        {xpActive.topUsers.length} · {xpSortLabel}
                      </span>
                    </div>
                    <ul className="space-y-2" aria-label="Leaderboard rankings">
                      {listUsers.map((row) => (
                        <LeaderboardRow
                          key={row.userId}
                          userId={row.userId}
                          rank={row.rank}
                          name={row.displayName}
                          username={row.username}
                          avatar={row.avatar}
                          level={row.level}
                          totalXP={row.totalXp}
                          isCurrentUser={row.userId === character.id}
                          showcaseCharacter={row.userId === character.id ? character : undefined}
                          onViewProfile={onViewProfile}
                          {...xpLeaderboardMetricProps(sortBy, row)}
                        />
                      ))}
                    </ul>
                  </div>
                ) : null}

              </div>
            ) : null}
          </div>

          <details className="cq-lb-scholars">
            <summary className="cq-lb-scholars-summary">Scholars Guild rankings</summary>
            <div className="cq-lb-scholars-body">
            <ul className="space-y-2" aria-label="Scholars guild rankings">
              {scholarGuildsRanked.map((g, index) => {
                const isExpanded = expandedScholarGuildId === g.id;
                return (
                  <li key={g.id} className={`cq-lb-guild-row cq-lb-guild-row--animated overflow-hidden ${guildRowRankClass(index + 1)}`}>
                    <button
                      type="button"
                      onClick={() => setExpandedScholarGuildId(isExpanded ? null : g.id)}
                      className="w-full flex items-center gap-3 px-3 py-3 text-left min-h-[68px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-uri-keaney/60"
                      aria-expanded={isExpanded}
                    >
                      <RankBadge rank={index + 1} />
                      <GuildEmblem scholarGuildId={g.id} crest={g.crest} size="md" rank={index + 1 <= 3 ? (index + 1 as 1 | 2 | 3) : undefined} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white truncate">{g.name}</p>
                        <p className="text-xs text-white/50">
                          {g.members.length} scholars ·{" "}
                          <span className="font-mono text-uri-keaney font-semibold tabular-nums">
                            {g.totalXP.toLocaleString()} XP
                          </span>
                        </p>
                      </div>
                      <span className="text-white/40 text-xs flex-shrink-0" aria-hidden>
                        {isExpanded ? "▾" : "▸"}
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-white/10 bg-black/20 px-3 py-3">
                        <p className="text-xs font-semibold text-white/45 uppercase tracking-wider mb-2">
                          Example scholars
                        </p>
                        <ul className="space-y-1.5">
                          {g.members.map((m) => (
                            <li
                              key={`${g.id}-${m.name}`}
                              className="flex items-center gap-2 rounded-lg bg-white/[0.04] border border-white/10 px-2.5 py-2"
                            >
                              <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center text-lg flex-shrink-0">
                                {m.avatar}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white truncate">{m.name}</p>
                              </div>
                              <span className="text-xs font-mono text-uri-keaney flex-shrink-0 tabular-nums">
                                {m.totalXP.toLocaleString()} XP
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            </div>
          </details>
        </>
      )}
    </section>
    </PullToRefresh>
  );
}

function LeaderboardEmptyState({ message, detail }: { message: string; detail?: string }) {
  return (
    <div className="cq-lb-state text-center py-10 px-4" role="status">
      <p className="text-base font-semibold text-white">{message}</p>
      {detail ? <p className="text-sm text-white/55 mt-2 max-w-sm mx-auto leading-relaxed">{detail}</p> : null}
    </div>
  );
}

function RankBadge({ rank, large = false }: { rank: number; large?: boolean }) {
  const tone =
    rank === 1 ? "cq-lb-rank--gold" : rank === 2 ? "cq-lb-rank--silver" : rank === 3 ? "cq-lb-rank--bronze" : "";
  return (
    <span
      className={`cq-lb-rank ${tone} ${large ? "cq-lb-rank--lg" : ""}`}
      aria-label={`Rank ${rank}`}
    >
      #{rank}
    </span>
  );
}

function guildRowRankClass(rank: number): string {
  if (rank === 1) return "cq-lb-guild-row--gold";
  if (rank === 2) return "cq-lb-guild-row--silver";
  if (rank === 3) return "cq-lb-guild-row--bronze";
  return "";
}

function GuildChampionHero({ guild }: { guild: Guild }) {
  const level = getGuildDisplayLevel(guild);
  return (
    <div className="cq-lb-guild-hero" aria-label={`Rank 1 guild, ${guild.name}, level ${level}`}>
      <div className="cq-lb-guild-hero-glow" aria-hidden />
      <p className="cq-lb-guild-hero-eyebrow">
        <Trophy className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
        Reigning champion
      </p>
      <GuildEmblem interest={guild.interest} crest={guild.crest} size="hero" rank={1} />
      <h3 className="cq-lb-guild-hero-name">{guild.name}</h3>
      <p className="cq-lb-guild-hero-meta">
        <span className="cq-lb-level-badge">Lv.{level}</span>
        <span className="cq-lb-guild-hero-dot" aria-hidden />
        <span>{guild.memberIds.length} members</span>
      </p>
      <span className="cq-lb-guild-hero-badge">Guild Champion</span>
      <p className="cq-lb-guild-hero-interest">{GUILD_INTEREST_LABELS[guild.interest]}</p>
    </div>
  );
}

function GuildYourPositionBanner({
  rank,
  guildName,
  totalGuilds,
  isChampion,
}: {
  rank: number;
  guildName: string;
  totalGuilds: number;
  isChampion: boolean;
}) {
  return (
    <div
      className={`cq-lb-guild-you ${isChampion ? "cq-lb-guild-you--champion" : ""}`}
      aria-label={`Your guild ${guildName} is rank ${rank}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {isChampion ? (
          <span className="cq-lb-champion-trophy" aria-hidden>
            <Trophy className="h-5 w-5" strokeWidth={2.25} />
          </span>
        ) : (
          <RankBadge rank={rank} large={rank <= 3} />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-uri-keaney/90">Your guild</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-white">{guildName}</p>
          <p className="mt-0.5 text-xs text-white/50">
            {isChampion
              ? "Your guild leads the campus — defend the crown."
              : `Rank #${rank} of ${totalGuilds} · keep questing to climb.`}
          </p>
        </div>
      </div>
    </div>
  );
}

function GuildRankRow({
  guild,
  rank,
  isMember,
  isExpanded,
  onToggle,
}: {
  guild: Guild;
  rank: number;
  isMember: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const level = getGuildDisplayLevel(guild);
  const rankTone = guildRowRankClass(rank);
  const emblemRank = rank <= 3 ? (rank as 1 | 2 | 3) : undefined;

  return (
    <li className={`cq-lb-guild-row cq-lb-guild-row--animated overflow-hidden ${rankTone} ${isMember ? "cq-lb-guild-row--yours" : ""}`}>
      <button
        type="button"
        onClick={onToggle}
        className="cq-lb-guild-row-btn w-full flex items-center gap-3 p-3.5 text-left min-h-[72px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-uri-keaney/60"
        aria-expanded={isExpanded}
      >
        <RankBadge rank={rank} />
        <GuildEmblem interest={guild.interest} crest={guild.crest} size="md" rank={emblemRank} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-white truncate">
            {guild.name}
            {isMember ? <span className="ml-1.5 text-[10px] font-semibold text-uri-keaney">(yours)</span> : null}
          </p>
          <p className="text-xs text-white/50">{GUILD_INTEREST_LABELS[guild.interest]}</p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-uri-keaney font-semibold tabular-nums">Lv.{level}</p>
          <p className="text-xs text-white/50">{guild.memberIds.length} members</p>
        </div>
        <span className="text-white/40 text-xs flex-shrink-0" aria-hidden>
          {isExpanded ? "▾" : "▸"}
        </span>
      </button>
      {isExpanded ? (
        <div className="border-t border-white/10 bg-black/20 px-3 py-3">
          <p className="text-xs font-semibold text-white/45 uppercase tracking-wider mb-2">Members</p>
          <ul className="space-y-2">
            {guild.memberIds.length === 0 ? (
              <li className="text-sm text-white/50">No members yet.</li>
            ) : (
              guild.memberIds.map((memberId) => {
                const member = getCharacterById(memberId);
                const isCreator = memberId === guild.createdByUserId;
                return (
                  <li
                    key={memberId}
                    className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.04] border border-white/10"
                  >
                    <div className="w-9 h-9 rounded-lg bg-white/[0.06] flex items-center justify-center overflow-hidden flex-shrink-0 border border-white/10">
                      {member ? <AvatarDisplay avatar={member.avatar} size={36} /> : <span className="text-lg text-white/40">?</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-white text-sm truncate">{member ? member.name : "Unknown"}</p>
                      <p className="text-xs text-white/50 truncate">{member ? `@${member.username}` : memberId}</p>
                    </div>
                    {isCreator ? (
                      <span className="text-[10px] font-semibold text-uri-gold px-1.5 py-0.5 rounded bg-uri-gold/15 flex-shrink-0">Founder</span>
                    ) : null}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

function TopThreePodium({
  users,
  currentUserId,
  sortBy,
  character,
  onViewProfile,
  metricProps,
}: {
  users: XpLeaderboardRowUi[];
  currentUserId: string;
  sortBy: SortBy;
  character: Character;
  onViewProfile?: (userId: string) => void;
  metricProps: (sortBy: SortBy, row: XpLeaderboardRowUi) => ReturnType<typeof xpLeaderboardMetricProps>;
}) {
  return (
    <div className="cq-lb-podium" role="list" aria-label="Top three players">
      {users.map((user) => (
        <PodiumCard
          key={user.userId}
          user={user}
          isCurrentUser={user.userId === currentUserId}
          showcaseCharacter={user.userId === currentUserId ? character : undefined}
          onViewProfile={onViewProfile}
          {...metricProps(sortBy, user)}
        />
      ))}
    </div>
  );
}

function PodiumCard({
  user,
  isCurrentUser,
  showcaseCharacter,
  sortBy,
  statValue,
  statLabel,
  onViewProfile,
}: {
  user: XpLeaderboardRowUi;
  isCurrentUser: boolean;
  showcaseCharacter?: Character;
  sortBy?: SortBy;
  statValue?: number;
  statLabel?: string;
  onViewProfile?: (userId: string) => void;
}) {
  const place = user.rank as 1 | 2 | 3;
  const cardClass = `cq-lb-podium-card cq-lb-podium-card--${place} ${isCurrentUser ? "cq-lb-podium-card--you" : ""}`;
  const aria = `Rank ${user.rank}, ${user.displayName}, level ${user.level}, ${user.totalXp.toLocaleString()} XP`;
  const body = (
    <>
      {place === 1 ? (
        <span className="cq-lb-podium-crown" aria-hidden>
          <Trophy className="h-4 w-4" strokeWidth={2.25} />
        </span>
      ) : null}
      <RankBadge rank={user.rank} large={place === 1} />
      <div className={`cq-lb-podium-avatar cq-lb-podium-avatar--${place}`}>
        <AvatarDisplay avatar={user.avatar} size={place === 1 ? 52 : place === 2 ? 44 : 40} />
      </div>
      <p className="cq-lb-podium-name truncate">{user.displayName}</p>
      <p className="cq-lb-podium-username truncate">@{user.username}</p>
      {showcaseCharacter ? <AchievementShowcaseStrip character={showcaseCharacter} compact /> : null}
      <div className="cq-lb-podium-stats">
        <span className="cq-lb-level-badge">Lv.{user.level}</span>
        {sortBy !== "level" && statLabel != null && statValue != null ? (
          <span className="text-[11px] text-white/55 tabular-nums">
            {statValue.toLocaleString()} {statLabel}
          </span>
        ) : null}
        <span className="text-xs font-semibold text-uri-keaney tabular-nums">{user.totalXp.toLocaleString()} XP</span>
      </div>
    </>
  );

  if (onViewProfile) {
    return (
      <button
        type="button"
        onClick={() => onViewProfile(user.userId)}
        className={cardClass}
        role="listitem"
        aria-label={aria}
      >
        {body}
      </button>
    );
  }

  return (
    <div className={cardClass} role="listitem" aria-label={aria}>
      {body}
    </div>
  );
}

function XpRankHighlight({
  rank,
  totalRanked,
  mode,
  sortLabel,
}: {
  rank: number;
  totalRanked: number;
  mode: "campus" | "friends";
  sortLabel: string;
}) {
  const peopleWord =
    mode === "campus" ? (totalRanked === 1 ? "student" : "students") : totalRanked === 1 ? "friend" : "friends";
  const championTitle = mode === "campus" ? "Campus Champion" : "Friends Champion";
  const isChampion = rank === 1;

  return (
    <div
      className={`cq-lb-you-banner ${isChampion ? "cq-lb-you-banner--champion" : ""}`}
      aria-label={`Your rank is ${rank}`}
    >
      <div className="flex items-center gap-3">
        {isChampion ? (
          <span className="cq-lb-champion-trophy" aria-hidden>
            <Trophy className="h-5 w-5" strokeWidth={2.25} />
          </span>
        ) : (
          <RankBadge rank={rank} large />
        )}
        <div className="min-w-0 flex-1">
          {isChampion ? (
            <>
              <p className="cq-lb-champion-title">
                <span aria-hidden>🏆</span> {championTitle}
              </p>
              <p className="cq-lb-champion-rank">Rank #1</p>
              <p className="cq-lb-champion-meta">
                {totalRanked <= 1
                  ? `First on the board — invite more ${mode === "campus" ? "classmates" : "friends"} to compete.`
                  : `Out of ${totalRanked.toLocaleString()} ${peopleWord}`}
              </p>
            </>
          ) : (
            <>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-uri-keaney/90">Your rank</p>
              <p className="mt-0.5 text-sm font-semibold text-white">Rank #{rank}</p>
              <p className="mt-0.5 text-xs text-white/50">
                {totalRanked <= 1
                  ? `Climb higher as more ${peopleWord} join.`
                  : `Out of ${totalRanked.toLocaleString()} ${peopleWord} · ${sortLabel.toLowerCase()}`}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function XpLeaderboardSkeleton() {
  return (
    <ul className="space-y-2 mt-4" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <li key={i} className="cq-lb-skeleton-row flex items-center gap-3 p-3.5 rounded-xl">
          <div className="w-9 h-7 rounded-md animate-pulse shrink-0" />
          <div className="w-11 h-11 rounded-xl animate-pulse shrink-0" />
          <div className="flex-1 space-y-2 min-w-0">
            <div className="h-4 w-36 max-w-full rounded animate-pulse" />
            <div className="h-3 w-24 max-w-full rounded animate-pulse" />
          </div>
          <div className="space-y-2 text-right shrink-0 w-16">
            <div className="h-4 w-full rounded animate-pulse ml-auto" />
            <div className="h-3 w-full rounded animate-pulse ml-auto" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function LeaderboardRow({
  userId,
  rank,
  name,
  username,
  avatar,
  level,
  totalXP,
  isCurrentUser,
  showcaseCharacter,
  sortBy,
  statValue,
  statLabel,
  actions,
  onViewProfile,
}: {
  userId: string;
  rank: number;
  name: string;
  username: string;
  avatar: string;
  level: number;
  totalXP: number;
  isCurrentUser: boolean;
  showcaseCharacter?: Character;
  sortBy?: SortBy;
  statValue?: number;
  statLabel?: string;
  actions?: React.ReactNode;
  onViewProfile?: (userId: string) => void;
}) {
  const rowClass = `cq-leaderboard-row cq-lb-row ${isCurrentUser ? "cq-lb-row--you" : ""}`;
  const inner = (
    <>
      <RankBadge rank={rank} />
      <span className="cq-lb-row-avatar">
        <AvatarDisplay avatar={avatar} size={40} />
      </span>
      <div className="flex-1 min-w-0 text-left">
        <p className="font-medium text-white truncate">
          {name}
          {isCurrentUser ? <span className="text-xs text-uri-keaney font-normal ml-1.5">(you)</span> : null}
        </p>
        <p className="text-xs text-white/50 truncate">@{username}</p>
        {showcaseCharacter ? <AchievementShowcaseStrip character={showcaseCharacter} compact /> : null}
        {actions != null ? <div className="mt-1.5 sm:hidden">{actions}</div> : null}
      </div>
      <div className="flex-shrink-0 text-right min-w-[5.25rem]">
        <span className="cq-lb-level-badge inline-block mb-1">Lv.{level}</span>
        {sortBy !== "level" && statLabel != null && statValue != null ? (
          <>
            <p className="text-sm font-bold text-white tabular-nums leading-none">{statValue.toLocaleString()}</p>
            <p className="text-[10px] text-uri-keaney mt-0.5">{statLabel}</p>
            <p className="text-[10px] text-white/45 mt-1 tabular-nums">{totalXP.toLocaleString()} XP</p>
          </>
        ) : (
          <p className="text-sm font-semibold text-uri-keaney tabular-nums">{totalXP.toLocaleString()} XP</p>
        )}
      </div>
      {actions != null ? <div className="flex-shrink-0 hidden sm:block">{actions}</div> : null}
    </>
  );

  if (onViewProfile) {
    return (
      <li>
        <button
          type="button"
          onClick={() => onViewProfile(userId)}
          className={`${rowClass} w-full flex items-center gap-3 p-3.5 min-h-[72px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-uri-keaney/60`}
          aria-label={`Rank ${rank}, ${name}, level ${level}, ${totalXP.toLocaleString()} XP`}
        >
          {inner}
        </button>
      </li>
    );
  }

  return <li className={`${rowClass} flex items-center gap-3 p-3.5 min-h-[72px]`}>{inner}</li>;
}

function LeaderboardStatFilterScroll({
  sortBy,
  onSortByChange,
  options,
}: {
  sortBy: SortBy;
  onSortByChange: (value: SortBy) => void;
  options: { value: SortBy; label: string }[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [edgeFade, setEdgeFade] = useState({ left: false, right: false });

  const updateEdgeFade = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setEdgeFade({
      left: el.scrollLeft > 6,
      right: maxScroll > 6 && el.scrollLeft < maxScroll - 6,
    });
  }, []);

  useEffect(() => {
    updateEdgeFade();
    const el = scrollRef.current;
    if (!el) return undefined;

    el.addEventListener("scroll", updateEdgeFade, { passive: true });
    const observer = new ResizeObserver(updateEdgeFade);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", updateEdgeFade);
      observer.disconnect();
    };
  }, [updateEdgeFade, options.length, sortBy]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>('[aria-selected="true"]');
    const smooth =
      typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    active?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", inline: "nearest", block: "nearest" });
  }, [sortBy]);

  const chips: { value: SortBy; label: string }[] = [{ value: "level", label: "Level" }, ...options];

  return (
    <div
      className="cq-lb-stat-scroll-wrap leaderboard-filter-row filter-scroll"
      data-no-drawer-swipe="true"
      data-horizontal-scroll="true"
      data-cq-horizontal-scroll="true"
      data-cq-gesture-block="all"
    >
      <div
        className={`cq-lb-stat-scroll-fade cq-lb-stat-scroll-fade--left ${edgeFade.left ? "is-visible" : ""}`}
        aria-hidden
      />
      <div
        className={`cq-lb-stat-scroll-fade cq-lb-stat-scroll-fade--right ${edgeFade.right ? "is-visible" : ""}`}
        aria-hidden
      />
      <div ref={scrollRef} className="cq-lb-stat-scroll" role="tablist" aria-label="Sort by stat">
        {chips.map((chip) => {
          const active = sortBy === chip.value;
          return (
            <button
              key={chip.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSortByChange(chip.value)}
              className={`cq-lb-stat-chip ${active ? "cq-lb-stat-chip--active" : ""}`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
