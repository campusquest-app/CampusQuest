"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { Clock, Trophy } from "lucide-react";
import { getCharacterById } from "@/lib/friendsStore";
import { getGuildDisplayLevel, getGuilds, GUILD_INTEREST_LABELS } from "@/lib/guildStore";
import {
  compareScholarGuildMemberEntries,
  sortAndRankXpEntries,
} from "@/lib/leaderboardRanking";
import type { Guild } from "@/lib/types";
import { GuildEmblem } from "@/components/guild/GuildEmblem";
import { fetchAuthed } from "@/lib/client/dashboardApi";
import { scheduleNonCriticalWork } from "@/lib/client/deferNonCriticalWork";
import { refreshPlayerSnapshotFromServer } from "@/lib/client/refreshPlayerSnapshot";
import { PullToRefresh } from "@/components/PullToRefresh";
import type { Character } from "@/lib/types";
import { UserAvatar } from "./UserAvatar";
import { AchievementShowcaseStrip } from "./achievements/AchievementShowcaseStrip";
import {
  collapsedAvatarString,
  normalizeUserAvatarFields,
  type UserAvatarType,
} from "@/lib/userAvatar";
import { ScreenDataState } from "@/components/ui/ScreenDataState";

type SortBy = "totalXp" | "guildLevel";

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

type ServerGuildLeaderboardRow = {
  rank: number;
  id: string;
  name: string;
  description: string;
  total_xp: number;
  member_count: number;
  is_public: boolean;
  created_at: string;
};

type GuildLeaderboardItem = {
  id: string;
  name: string;
  crest: string;
  interest: Guild["interest"];
  level: number;
  memberCount: number;
  description?: string;
  source: "server" | "local";
  localGuild?: Guild;
};

type ScholarGuildMember = {
  guildId: string;
  userId: string;
  name: string;
  username: string;
  totalXP: number;
  avatar: string;
  profileImageUrl: string | null;
  avatarImageUrl: string | null;
  avatarType: UserAvatarType;
};

const GUILD_XP_PER_LEVEL = 100;

function guildLevelFromTotalXp(totalXp: number): number {
  return 1 + Math.floor(Math.max(0, totalXp) / GUILD_XP_PER_LEVEL);
}

function scholarGuildIdForUser(scholarGuildId: string | null | undefined): string {
  const g = scholarGuildId?.trim();
  return g && g !== "undecided" ? g : "undecided";
}

function serverGuildToLeaderboardItem(row: ServerGuildLeaderboardRow): GuildLeaderboardItem {
  return {
    id: row.id,
    name: row.name,
    crest: "🛡️",
    interest: "clubs",
    level: guildLevelFromTotalXp(row.total_xp),
    memberCount: row.member_count,
    description: row.description,
    source: "server",
  };
}

function localGuildToLeaderboardItem(guild: Guild): GuildLeaderboardItem {
  return {
    id: guild.id,
    name: guild.name,
    crest: guild.crest,
    interest: guild.interest,
    level: getGuildDisplayLevel(guild),
    memberCount: guild.memberIds.length,
    description: guild.weeklyQuestGoal,
    source: "local",
    localGuild: guild,
  };
}

function mergeGuildLeaderboardItems(server: ServerGuildLeaderboardRow[], local: Guild[]): GuildLeaderboardItem[] {
  const serverItems = server.map(serverGuildToLeaderboardItem);
  const serverNames = new Set(server.map((g) => g.name.trim().toLowerCase()));
  const localItems = local
    .filter((g) => !serverNames.has(g.name.trim().toLowerCase()))
    .map(localGuildToLeaderboardItem);
  return [...serverItems, ...localItems].sort((a, b) => {
    if (b.level !== a.level) return b.level - a.level;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

type XpLeaderboardRowUi = {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  level: number;
  totalXp: number;
  avatar: string;
  profileImageUrl: string | null;
  avatarImageUrl: string | null;
  avatarType: UserAvatarType;
  scholarGuildId?: string | null;
  strength: number;
  stamina: number;
  knowledge: number;
  social: number;
  focus: number;
  bossesDefeated: number;
  finalBossesDefeated: number;
};

function sanitizeLeaderboardRow(row: XpLeaderboardRowUi): XpLeaderboardRowUi {
  const normalized = normalizeUserAvatarFields({
    displayName: row.displayName,
    username: row.username,
    profileImageUrl: row.profileImageUrl,
    avatarImageUrl: row.avatarImageUrl,
    avatar: row.avatar,
  });
  return {
    ...row,
    displayName: normalized.displayName || row.displayName,
    username: normalized.username || row.username,
    profileImageUrl: normalized.profileImageUrl,
    avatarImageUrl: normalized.avatarImageUrl,
    avatarType: normalized.avatarType,
    avatar: collapsedAvatarString(normalized),
  };
}

function sanitizeLeaderboardPayload(payload: XpLeaderboardPayload): XpLeaderboardPayload {
  return {
    ...payload,
    topUsers: payload.topUsers.map(sanitizeLeaderboardRow),
    currentUserEntry: payload.currentUserEntry ? sanitizeLeaderboardRow(payload.currentUserEntry) : null,
  };
}

type XpLeaderboardPayload = {
  topUsers: XpLeaderboardRowUi[];
  currentUserRank: number | null;
  currentUserEntry: XpLeaderboardRowUi | null;
  totalRankedUsers: number;
  acceptedFriendCount?: number;
};

function xpLeaderboardMetricProps(_sortBy: SortBy, _row: XpLeaderboardRowUi) {
  return { sortBy: "totalXp" as const };
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
  const [sortBy, setSortBy] = useState<SortBy>("totalXp");
  const [expandedGuildId, setExpandedGuildId] = useState<string | null>(null);
  const [expandedScholarGuildId, setExpandedScholarGuildId] = useState<string | null>(null);
  const [xpTab, setXpTab] = useState<"campus" | "friends">("campus");
  const [campusLb, setCampusLb] = useState<XpLeaderboardPayload | null>(null);
  const [friendsLb, setFriendsLb] = useState<XpLeaderboardPayload | null>(null);
  const [xpLoading, setXpLoading] = useState(false);
  const [xpError, setXpError] = useState<string | null>(null);
  const [guildLbLoading, setGuildLbLoading] = useState(false);
  const [guildLbError, setGuildLbError] = useState<string | null>(null);
  const [serverGuilds, setServerGuilds] = useState<ServerGuildLeaderboardRow[]>([]);
  const [myServerGuildId, setMyServerGuildId] = useState<string | null>(null);

  const scholarGuildsRanked = useMemo(() => {
    if (!campusLb) return [];
    const users = campusLb.topUsers;
    const me = campusLb.currentUserEntry;
    const allRows = me && !users.some((u) => u.userId === me.userId) ? [...users, me] : users;
    if (allRows.length === 0) return [];

    return SCHOLAR_GUILDS.map((g) => {
      const members: ScholarGuildMember[] = allRows
        .filter((u) => scholarGuildIdForUser(u.scholarGuildId) === g.id)
        .map((u) => ({
          guildId: g.id,
          userId: u.userId,
          name: u.displayName,
          username: u.username,
          totalXP: u.totalXp,
          avatar: u.avatar,
          profileImageUrl: u.profileImageUrl,
          avatarImageUrl: u.avatarImageUrl,
          avatarType: u.avatarType,
        }))
        .sort(compareScholarGuildMemberEntries);
      const totalXP = members.reduce((sum, m) => sum + m.totalXP, 0);
      return { id: g.id, name: g.name, crest: g.crest, totalXP, members };
    })
      .filter((g) => g.members.length > 0)
      .sort((a, b) => b.totalXP - a.totalXP);
  }, [campusLb]);

  const guildsSorted = useMemo(() => mergeGuildLeaderboardItems(serverGuilds, getGuilds()), [serverGuilds]);

  const userGuildIds = useMemo(() => {
    const ids = new Set(character.guildIds ?? []);
    if (myServerGuildId) ids.add(myServerGuildId);
    return ids;
  }, [character.guildIds, myServerGuildId]);

  const userGuildRank = useMemo(() => {
    if (userGuildIds.size === 0 || guildsSorted.length === 0) return null;
    let best: { guild: GuildLeaderboardItem; rank: number } | null = null;
    for (const guildId of Array.from(userGuildIds)) {
      const index = guildsSorted.findIndex((g) => g.id === guildId);
      if (index < 0) continue;
      const rank = index + 1;
      if (!best || rank < best.rank) {
        best = { guild: guildsSorted[index], rank };
      }
    }
    return best;
  }, [userGuildIds, guildsSorted]);

  const loadGuildLeaderboard = useCallback(async () => {
    setGuildLbLoading(true);
    setGuildLbError(null);
    try {
      const [guildRes, myGuildRes] = await Promise.all([
        fetchAuthed<{ guilds: ServerGuildLeaderboardRow[] }>("/api/leaderboards/guilds"),
        fetchAuthed<{ guild: { id: string } }>("/api/guilds/me").catch(() => null),
      ]);
      setServerGuilds(guildRes.guilds ?? []);
      setMyServerGuildId(myGuildRes?.guild?.id ?? null);
    } catch (err) {
      setGuildLbError(err instanceof Error ? err.message : "Could not load guild leaderboard.");
      setServerGuilds([]);
      setMyServerGuildId(null);
    } finally {
      setGuildLbLoading(false);
    }
  }, []);

  const loadXpLeaderboards = useCallback(async () => {
    if (sortBy === "guildLevel") return;
    setXpLoading(true);
    setXpError(null);
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    try {
      const qs = new URLSearchParams({ sort: "totalXp" }).toString();
      const [c, f] = await Promise.all([
        fetchAuthed<XpLeaderboardPayload>(`/api/leaderboards/campus?${qs}`),
        fetchAuthed<XpLeaderboardPayload>(`/api/leaderboards/friends?${qs}`),
      ]);
      setCampusLb(sanitizeLeaderboardPayload(c));
      setFriendsLb(sanitizeLeaderboardPayload(f));
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
      if (
        process.env.NODE_ENV !== "production" &&
        (f.acceptedFriendCount ?? 0) > 0 &&
        f.totalRankedUsers === 0
      ) {
        console.error("[cq][leaderboard] friends tab empty but acceptedFriendCount > 0", {
          acceptedFriendCount: f.acceptedFriendCount,
          totalRankedUsers: f.totalRankedUsers,
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
  }, [character.level, character.totalXP]);

  const handlePullRefresh = useCallback(async () => {
    await Promise.all([
      sortBy === "guildLevel" ? loadGuildLeaderboard() : loadXpLeaderboards(),
      refreshPlayerSnapshotFromServer(),
    ]);
    onRefresh?.();
  }, [loadGuildLeaderboard, loadXpLeaderboards, onRefresh, sortBy]);

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

  useEffect(() => {
    if (sortBy !== "guildLevel") return;
    let cancelled = false;
    const deferId = scheduleNonCriticalWork(() => {
      if (cancelled) return;
      void loadGuildLeaderboard();
    });
    return () => {
      cancelled = true;
      window.clearTimeout(deferId);
    };
  }, [loadGuildLeaderboard, sortBy]);

  const xpActive = xpTab === "campus" ? campusLb : friendsLb;
  const xpFriendsAcceptedCount = friendsLb?.acceptedFriendCount ?? 0;
  const xpFriendsEmpty =
    xpTab === "friends" &&
    !xpLoading &&
    !xpError &&
    xpFriendsAcceptedCount === 0 &&
    (xpActive?.totalRankedUsers ?? 0) === 0;
  const xpFriendsDataMissing =
    xpTab === "friends" &&
    !xpLoading &&
    !xpError &&
    xpFriendsAcceptedCount > 0 &&
    (xpActive?.totalRankedUsers ?? 0) === 0;
  const xpCampusEmpty = xpTab === "campus" && !xpLoading && !xpError && (xpActive?.totalRankedUsers ?? 0) === 0;
  const xpHasBoard = Boolean(!xpLoading && !xpError && xpActive != null && xpActive.totalRankedUsers > 0);

  const xpDisplayBoard = useMemo(() => {
    if (!xpActive?.topUsers.length) return xpActive;
    const rerankedTop = sortAndRankXpEntries(
      xpActive.topUsers.map(({ rank: _rank, ...row }) => row),
    );
    const meInTop = rerankedTop.find((row) => row.userId === character.id);
    return {
      ...xpActive,
      topUsers: rerankedTop,
      currentUserEntry: meInTop ?? xpActive.currentUserEntry,
      currentUserRank: meInTop?.rank ?? xpActive.currentUserRank,
    };
  }, [character.id, xpActive]);

  const podiumUsers = useMemo(() => {
    if (!xpDisplayBoard?.topUsers.length) return [];
    return ([2, 1, 3] as const)
      .map((rank) => xpDisplayBoard.topUsers.find((row) => row.rank === rank))
      .filter((row): row is XpLeaderboardRowUi => row != null);
  }, [xpDisplayBoard?.topUsers]);

  const listUsers = useMemo(() => {
    if (!xpDisplayBoard?.topUsers.length) return [];
    return xpDisplayBoard.topUsers.filter((row) => row.rank > 3);
  }, [xpDisplayBoard?.topUsers]);

  return (
    <PullToRefresh onRefresh={handlePullRefresh} disabled={xpLoading}>
    <section className="cq-lb-shell cq-tab-shell">
      <header className="cq-lb-header cq-screen-header sticky top-0 z-10">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="cq-screen-header__title flex items-center gap-2">
              <Trophy className="h-5 w-5 text-uri-gold/90 shrink-0" aria-hidden strokeWidth={2.25} />
              Scholars Leaderboard
            </h1>
            <p className="cq-screen-header__subtitle">Ranked by total XP · all time</p>
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
              if (sortBy === "guildLevel") setSortBy("totalXp");
            }}
            className={`cq-lb-filter ${sortBy !== "guildLevel" ? "cq-lb-filter--active" : ""}`}
          >
            Scholars
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

          {guildLbError ? (
            <ScreenDataState
              variant="error"
              message="Couldn't load guild leaderboard."
              detail="Check your connection and try again."
              onRetry={() => void loadGuildLeaderboard()}
              compact
            />
          ) : guildLbLoading ? (
            <div className="cq-lb-state" role="status" aria-live="polite">
              <p className="text-white/70">Loading guild rankings…</p>
            </div>
          ) : guildsSorted.length === 0 ? (
            <LeaderboardEmptyState
              message="No guilds have been created yet."
              detail="Create a guild in Guilds, or join one when guilds become available."
            />
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
                        isMember={userGuildIds.has(guild.id)}
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
              <ScreenDataState
                variant="error"
                message="Couldn't load leaderboard."
                detail="Check your connection and try again."
                onRetry={() => void loadXpLeaderboards()}
                compact
              />
            ) : null}

            {xpLoading ? (
              <div className="cq-lb-state" role="status" aria-live="polite">
                <p className="text-white/70">Loading leaderboard…</p>
                <XpLeaderboardSkeleton />
              </div>
            ) : xpFriendsDataMissing ? (
              <ScreenDataState
                variant="error"
                message="Couldn't load friend rankings."
                detail={`You have ${xpFriendsAcceptedCount} connected friend${xpFriendsAcceptedCount === 1 ? "" : "s"}, but ranking data didn't load.`}
                onRetry={() => void loadXpLeaderboards()}
                compact
              />
            ) : xpFriendsEmpty ? (
              <LeaderboardEmptyState
                message="Add friends to compare rankings by level."
                detail="Send a friend request from Find Friends, then come back to see how you rank by total XP."
              />
            ) : xpCampusEmpty ? (
              <LeaderboardEmptyState
                message="No leaderboard data yet."
                detail="As more students verify their school email, the campus leaderboard fills in."
              />
            ) : xpHasBoard && xpDisplayBoard ? (
              <div className="space-y-3">
                {xpDisplayBoard.currentUserEntry ? (
                  <ScholarsYourRankCard
                    entry={xpDisplayBoard.currentUserEntry}
                    character={character}
                    totalRanked={xpDisplayBoard.totalRankedUsers}
                    mode={xpTab}
                  />
                ) : null}

                {podiumUsers.length > 0 ? (
                  <TopThreePodium
                    users={podiumUsers}
                    currentUserId={character.id}
                    character={character}
                    onViewProfile={onViewProfile}
                    metricProps={xpLeaderboardMetricProps}
                  />
                ) : null}

                {listUsers.length > 0 ? (
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50">Rankings</h3>
                      <span className="text-[10px] text-white/40 tabular-nums">
                        {xpDisplayBoard.totalRankedUsers.toLocaleString()} scholars · Total XP
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
                          profileImageUrl={row.profileImageUrl}
                          avatarImageUrl={row.avatarImageUrl}
                          level={row.level}
                          totalXP={row.totalXp}
                          isCurrentUser={row.userId === character.id}
                          showcaseCharacter={row.userId === character.id ? character : undefined}
                          onViewProfile={onViewProfile}
                          {...xpLeaderboardMetricProps("totalXp", row)}
                        />
                      ))}
                    </ul>
                  </div>
                ) : null}

              </div>
            ) : null}
          </div>

          {scholarGuildsRanked.length > 0 ? (
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
                          Scholars
                        </p>
                        <ul className="space-y-1.5">
                          {g.members.map((m, memberIndex) => (
                            <li
                              key={`${g.id}-${m.userId}`}
                              className="flex items-center gap-2 rounded-lg bg-white/[0.04] border border-white/10 px-2.5 py-2"
                            >
                              <span className="text-[10px] font-semibold text-white/35 w-6 shrink-0 tabular-nums">
                                #{memberIndex + 1}
                              </span>
                              <UserAvatar
                                size="sm"
                                displayName={m.name}
                                username={m.username}
                                profileImageUrl={m.profileImageUrl}
                                avatarImageUrl={m.avatarImageUrl}
                                avatar={m.avatar}
                              />
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
          ) : null}
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

function RankBadge({ rank, large = false, showMedal = true }: { rank: number; large?: boolean; showMedal?: boolean }) {
  const tone =
    rank === 1 ? "cq-lb-rank--gold" : rank === 2 ? "cq-lb-rank--silver" : rank === 3 ? "cq-lb-rank--bronze" : "";
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
  return (
    <span
      className={`cq-lb-rank ${tone} ${large ? "cq-lb-rank--lg" : ""}`}
      aria-label={`Rank ${rank}`}
    >
      {showMedal && medal ? <span className="cq-lb-rank-medal" aria-hidden>{medal}</span> : null}
      #{rank}
    </span>
  );
}

function ScholarsYourRankCard({
  entry,
  character,
  totalRanked,
  mode,
}: {
  entry: XpLeaderboardRowUi;
  character: Character;
  totalRanked: number;
  mode: "campus" | "friends";
}) {
  const peopleWord = mode === "campus" ? "students" : "friends";
  const isChampion = entry.rank === 1;

  return (
    <div
      className={`cq-lb-your-rank ${isChampion ? "cq-lb-your-rank--champion" : ""}`}
      aria-label={`Your rank is ${entry.rank} with ${entry.totalXp.toLocaleString()} XP`}
    >
      <p className="cq-lb-your-rank-eyebrow">
        <Trophy className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
        Your Rank
      </p>
      <div className="cq-lb-your-rank-body">
        <RankBadge rank={entry.rank} large showMedal />
        <span className="cq-lb-your-rank-avatar">
          <UserAvatar
            size={52}
            displayName={entry.displayName}
            username={entry.username}
            profileImageUrl={entry.profileImageUrl}
            avatarImageUrl={entry.avatarImageUrl}
            avatar={entry.avatar}
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="cq-lb-your-rank-name truncate">{entry.displayName}</p>
          <p className="cq-lb-your-rank-xp tabular-nums">{entry.totalXp.toLocaleString()} XP</p>
          <p className="cq-lb-your-rank-meta tabular-nums">
            Lv.{entry.level}
            {totalRanked > 1 ? ` · #${entry.rank} of ${totalRanked.toLocaleString()} ${peopleWord}` : null}
          </p>
        </div>
        <span className="cq-lb-you-badge shrink-0">YOU</span>
      </div>
      {isChampion ? (
        <p className="cq-lb-your-rank-champion-note">
          🏆 {mode === "campus" ? "Campus Champion" : "Friends Champion"} — you lead the board.
        </p>
      ) : null}
      <AchievementShowcaseStrip character={character} compact />
    </div>
  );
}

function guildRowRankClass(rank: number): string {
  if (rank === 1) return "cq-lb-guild-row--gold";
  if (rank === 2) return "cq-lb-guild-row--silver";
  if (rank === 3) return "cq-lb-guild-row--bronze";
  return "";
}

function GuildChampionHero({ guild }: { guild: GuildLeaderboardItem }) {
  return (
    <div className="cq-lb-guild-hero" aria-label={`Rank 1 guild, ${guild.name}, level ${guild.level}`}>
      <div className="cq-lb-guild-hero-glow" aria-hidden />
      <p className="cq-lb-guild-hero-eyebrow">
        <Trophy className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
        Reigning champion
      </p>
      <GuildEmblem interest={guild.interest} crest={guild.crest} size="hero" rank={1} />
      <h3 className="cq-lb-guild-hero-name">{guild.name}</h3>
      <p className="cq-lb-guild-hero-meta">
        <span className="cq-lb-level-badge">Lv.{guild.level}</span>
        <span className="cq-lb-guild-hero-dot" aria-hidden />
        <span>{guild.memberCount} members</span>
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
  guild: GuildLeaderboardItem;
  rank: number;
  isMember: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const rankTone = guildRowRankClass(rank);
  const emblemRank = rank <= 3 ? (rank as 1 | 2 | 3) : undefined;
  const localGuild = guild.localGuild;

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
          <p className="text-uri-keaney font-semibold tabular-nums">Lv.{guild.level}</p>
          <p className="text-xs text-white/50">{guild.memberCount} members</p>
        </div>
        <span className="text-white/40 text-xs flex-shrink-0" aria-hidden>
          {isExpanded ? "▾" : "▸"}
        </span>
      </button>
      {isExpanded ? (
        <div className="border-t border-white/10 bg-black/20 px-3 py-3">
          <p className="text-xs font-semibold text-white/45 uppercase tracking-wider mb-2">Members</p>
          {localGuild ? (
            <ul className="space-y-2">
              {localGuild.memberIds.length === 0 ? (
                <li className="text-sm text-white/50">No members yet.</li>
              ) : (
                localGuild.memberIds.map((memberId) => {
                  const member = getCharacterById(memberId);
                  const isCreator = memberId === localGuild.createdByUserId;
                  return (
                    <li
                      key={memberId}
                      className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.04] border border-white/10"
                    >
                      <UserAvatar
                        size="compact"
                        displayName={member?.name}
                        username={member?.username}
                        avatar={member?.avatar}
                      />
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
          ) : (
            <p className="text-sm text-white/50">
              {guild.memberCount} member{guild.memberCount === 1 ? "" : "s"}. Open Guilds to view guild details.
            </p>
          )}
        </div>
      ) : null}
    </li>
  );
}

function TopThreePodium({
  users,
  currentUserId,
  character,
  onViewProfile,
  metricProps,
}: {
  users: XpLeaderboardRowUi[];
  currentUserId: string;
  character: Character;
  onViewProfile?: (userId: string) => void;
  metricProps: (sortBy: SortBy, row: XpLeaderboardRowUi) => ReturnType<typeof xpLeaderboardMetricProps>;
}) {
  return (
    <div className="cq-lb-podium" role="list" aria-label="Top three scholars by total XP">
      {users.map((user) => (
        <PodiumCard
          key={user.userId}
          user={user}
          isCurrentUser={user.userId === currentUserId}
          showcaseCharacter={user.userId === currentUserId ? character : undefined}
          onViewProfile={onViewProfile}
          {...metricProps("totalXp", user)}
        />
      ))}
    </div>
  );
}

function PodiumCard({
  user,
  isCurrentUser,
  showcaseCharacter,
  onViewProfile,
}: {
  user: XpLeaderboardRowUi;
  isCurrentUser: boolean;
  showcaseCharacter?: Character;
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
        <UserAvatar
          size={place === 1 ? "podium1" : place === 2 ? "podium2" : "podium3"}
          displayName={user.displayName}
          username={user.username}
          profileImageUrl={user.profileImageUrl}
          avatarImageUrl={user.avatarImageUrl}
          avatar={user.avatar}
        />
      </div>
      <p className="cq-lb-podium-name truncate">
        {user.displayName}
        {isCurrentUser ? <span className="cq-lb-you-badge cq-lb-you-badge--inline">YOU</span> : null}
      </p>
      <p className="cq-lb-podium-username truncate">@{user.username}</p>
      {showcaseCharacter ? <AchievementShowcaseStrip character={showcaseCharacter} compact /> : null}
      <div className="cq-lb-podium-stats">
        <span className="cq-lb-level-badge">Lv.{user.level}</span>
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
  profileImageUrl,
  avatarImageUrl,
  level,
  totalXP,
  isCurrentUser,
  showcaseCharacter,
  actions,
  onViewProfile,
}: {
  userId: string;
  rank: number;
  name: string;
  username: string;
  avatar: string;
  profileImageUrl: string | null;
  avatarImageUrl: string | null;
  level: number;
  totalXP: number;
  isCurrentUser: boolean;
  showcaseCharacter?: Character;
  actions?: React.ReactNode;
  onViewProfile?: (userId: string) => void;
}) {
  const rowClass = `cq-leaderboard-row cq-lb-row ${isCurrentUser ? "cq-lb-row--you" : ""}`;
  const inner = (
    <>
      <RankBadge rank={rank} />
      <span className="cq-lb-row-avatar">
        <UserAvatar
          size="row"
          displayName={name}
          username={username}
          profileImageUrl={profileImageUrl}
          avatarImageUrl={avatarImageUrl}
          avatar={avatar}
        />
      </span>
      <div className="flex-1 min-w-0 text-left">
        <p className="font-medium text-white truncate flex items-center gap-1.5 min-w-0">
          <span className="truncate">{name}</span>
          {isCurrentUser ? <span className="cq-lb-you-badge shrink-0">YOU</span> : null}
        </p>
        <p className="text-xs text-white/50 truncate">@{username}</p>
        {showcaseCharacter ? <AchievementShowcaseStrip character={showcaseCharacter} compact /> : null}
        {actions != null ? <div className="mt-1.5 sm:hidden">{actions}</div> : null}
      </div>
      <div className="flex-shrink-0 text-right min-w-[5.25rem]">
        <span className="cq-lb-level-badge inline-block mb-1">Lv.{level}</span>
        <p className="text-sm font-semibold text-uri-keaney tabular-nums">{totalXP.toLocaleString()} XP</p>
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
