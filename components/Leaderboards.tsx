"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { getCharacterById } from "@/lib/friendsStore";
import { getGuilds, GUILD_INTEREST_LABELS } from "@/lib/guildStore";
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
}: {
  character: Character;
  onRefresh?: () => void;
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
      const levelA = a.xp != null ? 1 + Math.floor(a.xp / 100) : a.level;
      const levelB = b.xp != null ? 1 + Math.floor(b.xp / 100) : b.level;
      if (levelB !== levelA) return levelB - levelA;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }, []);

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

  return (
    <PullToRefresh onRefresh={handlePullRefresh} disabled={xpLoading}>
    <section className="space-y-6">
      {/* Filter by stat */}
      <div className="card p-4 sm:p-5">
        <h2 className="font-display font-semibold text-white mb-2 flex items-center gap-2">
          <span aria-hidden>🏆</span> Rank by
        </h2>
        <p className="text-sm text-white/50 mb-3">
          {sortBy === "guildLevel"
            ? "Guild level shows guilds only, sorted by highest level."
            : "Campus and friends rankings use verified classmates and connections. Pick a stat to sort the live board."}
        </p>
        <div className="flex flex-wrap gap-2">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSortBy(opt.value)}
              className={`cq-chip-pop flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                sortBy === opt.value
                  ? "bg-uri-keaney text-white"
                  : "bg-white/10 text-white/80 hover:bg-white/15 border border-white/15"
              }`}
            >
              <span>{opt.icon}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {sortBy === "guildLevel" ? (
        /* Guild leaderboard — guild names only, sorted by level */
        <div className="card p-4 sm:p-5">
          <h2 className="font-display font-semibold text-white mb-2 flex items-center gap-2">
            <span aria-hidden>🛡️</span> Guild leaderboard
          </h2>
          <p className="text-sm text-white/50 mb-4">
            Guilds ranked by level (highest first). Ties sorted by name.
          </p>
          {guildsSorted.length === 0 ? (
            <div className="cq-empty-state rounded-xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center">
              <p className="text-xl mb-1.5" aria-hidden>🛡️</p>
              <p className="text-sm font-semibold text-white/70">No guilds yet.</p>
              <p className="text-xs text-white/50 mt-1">Create or join one in Find Friends to start climbing rankings.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {guildsSorted.map((guild, index) => {
                const level = guild.xp != null ? 1 + Math.floor(guild.xp / 100) : guild.level;
                const rank = index + 1;
                const podiumGlow = rank <= 3 ? RANK_GLOW[rank as 1 | 2 | 3] : "";
                const rankStyle = rank === 1 ? "font-bold text-amber-300 drop-shadow-[0_0_10px_rgba(251,191,36,0.9)]" : rank === 2 ? "font-bold text-slate-200 drop-shadow-[0_0_8px_rgba(226,232,240,0.8)]" : rank === 3 ? "font-bold text-amber-600 drop-shadow-[0_0_10px_rgba(217,119,6,0.8)]" : "text-white/60 font-mono";
                const isExpanded = expandedGuildId === guild.id;
                return (
                  <li
                    key={guild.id}
                    className={`rounded-xl border overflow-hidden ${rank <= 3 ? podiumGlow : "bg-white/5 border-white/10"}`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedGuildId(isExpanded ? null : guild.id)}
                      className="w-full flex items-center gap-3 p-3 text-left hover:bg-white/5 transition-colors"
                      aria-expanded={isExpanded}
                    >
                      <span className={`w-8 text-sm font-mono flex-shrink-0 ${rankStyle}`}>
                        #{rank}
                      </span>
                      <span className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-2xl border border-uri-keaney/30 flex-shrink-0">
                        {guild.crest}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white truncate">{guild.name}</p>
                        <p className="text-xs text-white/50">{GUILD_INTEREST_LABELS[guild.interest]}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-uri-keaney font-semibold">Lv.{level}</p>
                        <p className="text-xs text-white/50">{guild.memberIds.length} members</p>
                      </div>
                      <span className="text-white/50 text-sm flex-shrink-0" aria-hidden>
                        {isExpanded ? "▼" : "▶"}
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-white/10 bg-black/20 px-3 py-3">
                        <p className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-2">Members</p>
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
                                  className="flex items-center gap-3 p-2 rounded-lg bg-white/5 border border-white/10"
                                >
                                  <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center overflow-hidden flex-shrink-0 border border-uri-keaney/30">
                                    {member ? <AvatarDisplay avatar={member.avatar} size={36} /> : <span className="text-lg opacity-60">👤</span>}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium text-white text-sm truncate">{member ? member.name : "Unknown"}</p>
                                    <p className="text-xs text-white/50 truncate">{member ? `@${member.username}` : memberId}</p>
                                  </div>
                                  {isCreator && (
                                    <span className="text-[10px] font-semibold text-uri-gold px-1.5 py-0.5 rounded bg-uri-gold/20 flex-shrink-0">Founder</span>
                                  )}
                                </li>
                              );
                            })
                          )}
                        </ul>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-cq-card shadow-[0_20px_50px_-20px_rgba(0,0,0,0.55)]">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.2] bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(104,171,232,0.12),transparent_55%)]"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -right-24 top-0 h-56 w-56 rounded-full bg-uri-keaney/8 blur-3xl"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -left-24 bottom-0 h-48 w-48 rounded-full bg-amber-400/10 blur-3xl"
              aria-hidden
            />
            <div className="relative p-5 sm:p-6 space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex gap-4 min-w-0">
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cq-elevated text-xl ring-1 ring-white/10"
                    aria-hidden
                  >
                    🏛️
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-display text-xl font-bold tracking-tight text-white sm:text-2xl">Student rankings</h2>
                    <p className="mt-1 text-sm leading-relaxed text-white/55 max-w-xl">
                      See how you stack up by <span className="text-white/80">{xpSortLabel}</span>. Campus uses your
                      school-verified cohort; Friends only includes mutual campus connections you&apos;ve accepted.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div
                  className="inline-flex w-full max-w-md rounded-2xl border border-white/10 bg-black/25 p-1 ring-1 ring-black/30"
                  role="tablist"
                  aria-label="Leaderboard scope"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={xpTab === "campus"}
                    onClick={() => setXpTab("campus")}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all min-h-[48px] ${
                      xpTab === "campus"
                        ? "bg-gradient-to-b from-uri-keaney to-uri-keaney/85 text-uri-navy shadow-md ring-1 ring-white/20"
                        : "text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <span className="text-base" aria-hidden>
                      🏫
                    </span>
                    Campus
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={xpTab === "friends"}
                    onClick={() => setXpTab("friends")}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all min-h-[48px] ${
                      xpTab === "friends"
                        ? "bg-gradient-to-b from-uri-keaney to-uri-keaney/85 text-uri-navy shadow-md ring-1 ring-white/20"
                        : "text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <span className="text-base" aria-hidden>
                      👥
                    </span>
                    Friends
                  </button>
                </div>
                <p className="text-[11px] text-white/40 sm:max-w-[14rem] sm:text-right leading-snug">
                  {xpTab === "campus"
                    ? "Everyone at your school with a verified email."
                    : "You and friends you have connected with on CampusQuest."}
                </p>
              </div>

            {xpError ? (
              <div className="rounded-xl border border-rose-400/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {xpError}
              </div>
            ) : null}

            {xpLoading ? (
              <XpLeaderboardSkeleton />
            ) : xpFriendsEmpty ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-10 text-center">
                <p className="text-3xl mb-2" aria-hidden>
                  🤝
                </p>
                <p className="text-base font-semibold text-white/90">Add friends to compare</p>
                <p className="text-sm text-white/50 mt-2 max-w-sm mx-auto leading-relaxed">
                  When you connect with classmates, they&apos;ll show up here—ranked by {xpSortLabel.toLowerCase()}.
                </p>
              </div>
            ) : xpCampusEmpty ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-10 text-center">
                <p className="text-3xl mb-2" aria-hidden>
                  🏫
                </p>
                <p className="text-base font-semibold text-white/90">Campus board unlocks with peers</p>
                <p className="text-sm text-white/50 mt-2 max-w-sm mx-auto leading-relaxed">
                  As more students verify their school email, the campus leaderboard fills in.
                </p>
              </div>
            ) : xpHasBoard && xpActive ? (
              <div className="space-y-5">
                {xpActive.currentUserRank != null ? (
                  <XpRankHighlight
                    rank={xpActive.currentUserRank}
                    totalRanked={xpActive.totalRankedUsers}
                    mode={xpTab}
                    sortLabel={xpSortLabel}
                  />
                ) : null}

                {xpShowPinnedCard && xpActive.currentUserEntry ? (
                  <div className="rounded-2xl border border-white/[0.08] border-l-[3px] border-l-uri-keaney bg-cq-elevated p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-uri-keaney mb-3">
                      Your position · outside top slice
                    </p>
                    <LeaderboardRow
                      rank={xpActive.currentUserEntry.rank}
                      name={xpActive.currentUserEntry.displayName}
                      username={xpActive.currentUserEntry.username}
                      avatar={xpActive.currentUserEntry.avatar}
                      level={xpActive.currentUserEntry.level}
                      totalXP={xpActive.currentUserEntry.totalXp}
                      isCurrentUser
                      showcaseCharacter={character}
                      {...xpLeaderboardMetricProps(sortBy, xpActive.currentUserEntry)}
                    />
                  </div>
                ) : null}

                <div>
                  <div className="mb-3 flex items-end justify-between gap-3 border-b border-white/10 pb-3">
                    <div>
                      <h3 className="font-display text-sm font-semibold text-white">Leaderboard</h3>
                      <p className="text-[11px] text-white/40 mt-0.5">
                        Sorted by {xpSortLabel.toLowerCase()} · top {xpActive.topUsers.length} shown
                      </p>
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-uri-keaney/90">Live</span>
                  </div>
                  <ul className="space-y-2.5">
                    {xpActive.topUsers.map((row) => (
                      <LeaderboardRow
                        key={row.userId}
                        rank={row.rank}
                        name={row.displayName}
                        username={row.username}
                        avatar={row.avatar}
                        level={row.level}
                        totalXP={row.totalXp}
                        isCurrentUser={row.userId === character.id}
                        showcaseCharacter={row.userId === character.id ? character : undefined}
                        {...xpLeaderboardMetricProps(sortBy, row)}
                      />
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
            </div>
          </div>

          {/* Scholars Guild leaderboard */}
          <div className="card p-4 sm:p-5">
            <h2 className="font-display font-semibold text-white mb-2 flex items-center gap-2">
              <span aria-hidden>🎓</span> Scholars Guild leaderboard
            </h2>
            <p className="text-sm text-white/50 mb-4">
              Colleges ranked by total XP from their scholars (including you). Pick your Scholars Guild when creating your character.
            </p>
            <ul className="space-y-2">
              {scholarGuildsRanked.map((g, index) => {
                const isExpanded = expandedScholarGuildId === g.id;
                return (
                  <li
                    key={g.id}
                    className="rounded-xl border border-white/12 bg-white/5 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedScholarGuildId(isExpanded ? null : g.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/7 transition-colors"
                      aria-expanded={isExpanded}
                    >
                      <span className="w-7 text-sm font-mono text-white/70 flex-shrink-0">#{index + 1}</span>
                      <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-xl border border-uri-keaney/40 flex-shrink-0">
                        {g.crest}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white truncate">{g.name}</p>
                        <p className="text-xs text-white/50">
                          {g.members.length} scholars ·{" "}
                          <span className="font-mono text-uri-keaney font-semibold">
                            {g.totalXP.toLocaleString()} XP
                          </span>
                        </p>
                      </div>
                      <span className="text-white/50 text-sm flex-shrink-0" aria-hidden>
                        {isExpanded ? "▼" : "▶"}
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-white/10 bg-black/20 px-3 py-3">
                        <p className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-2">
                          Example scholars
                        </p>
                        <ul className="space-y-1.5">
                          {g.members.map((m) => (
                            <li
                              key={`${g.id}-${m.name}`}
                              className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-2.5 py-1.5"
                            >
                              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-lg flex-shrink-0">
                                {m.avatar}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white truncate">{m.name}</p>
                              </div>
                              <span className="text-xs font-mono text-uri-keaney flex-shrink-0">
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
        </>
      )}
    </section>
    </PullToRefresh>
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
  const scopeNoun = mode === "campus" ? "verified campus" : "friends list";
  const peopleWord = mode === "campus" ? (totalRanked === 1 ? "student" : "students") : totalRanked === 1 ? "friend" : "friends";
  const medalRing =
    rank === 1
      ? "from-amber-400/35 via-amber-500/20 to-amber-700/25 ring-amber-300/55 shadow-[0_0_28px_rgba(251,191,36,0.35)]"
      : rank === 2
        ? "from-slate-300/25 via-slate-400/15 to-slate-600/25 ring-slate-200/45 shadow-[0_0_24px_rgba(226,232,240,0.25)]"
        : rank === 3
          ? "from-amber-700/30 via-amber-800/15 to-amber-950/20 ring-amber-600/50 shadow-[0_0_22px_rgba(217,119,6,0.3)]"
          : "from-cq-elevated via-cq-card to-cq-app ring-white/15";
  const headline =
    mode === "campus"
      ? rank === 1
        ? "Top of the campus board"
        : "On the campus leaderboard"
      : rank === 1
        ? "Leading your friends"
        : "Among your friends";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-cq-card p-4 sm:p-5">
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4 min-w-0">
          <div
            className={`flex h-[4.75rem] w-[4.75rem] shrink-0 flex-col items-center justify-center rounded-2xl bg-gradient-to-br ring-2 ${medalRing}`}
          >
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/55">Rank</span>
            <span className="font-display text-3xl font-bold tabular-nums leading-none text-white sm:text-[2.125rem]">
              #{rank}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-uri-keaney">Your placement</p>
            <p className="mt-1.5 text-lg font-semibold text-white sm:text-xl leading-snug">{headline}</p>
            <p className="mt-1.5 text-sm text-white/55 leading-relaxed">
              {totalRanked <= 1 ? (
                <>
                  You&apos;re #{rank} — once more {mode === "campus" ? "classmates" : "friends"} join, this board gets
                  competitive.
                </>
              ) : (
                <>
                  Out of{" "}
                  <span className="text-white/80 font-medium tabular-nums">{totalRanked.toLocaleString()}</span>{" "}
                  {peopleWord} on your {scopeNoun}, ordered by {sortLabel.toLowerCase()} (highest first).
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end sm:shrink-0">
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 bg-black/30 px-3 py-2 text-xs text-white/80">
            <span className="text-uri-keaney" aria-hidden>
              ✦
            </span>
            {sortLabel} · live ranking
          </span>
        </div>
      </div>
    </div>
  );
}

function XpLeaderboardSkeleton() {
  return (
    <ul className="space-y-2.5" aria-hidden>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <li
          key={i}
          className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/[0.04]"
        >
          <div className="w-8 h-6 rounded bg-white/10 animate-pulse shrink-0" />
          <div className="w-10 h-10 rounded-xl bg-white/10 animate-pulse shrink-0" />
          <div className="flex-1 space-y-2 min-w-0">
            <div className="h-4 w-36 max-w-full rounded bg-white/10 animate-pulse" />
            <div className="h-3 w-28 max-w-full rounded bg-white/10 animate-pulse" />
          </div>
          <div className="space-y-2 text-right shrink-0 w-14">
            <div className="h-4 w-full rounded bg-white/10 animate-pulse ml-auto" />
            <div className="h-3 w-full rounded bg-white/10 animate-pulse ml-auto" />
          </div>
        </li>
      ))}
    </ul>
  );
}

const RANK_GLOW = {
  1: "ring-2 ring-amber-300 shadow-[0_0_26px_rgba(251,191,36,0.55),0_0_14px_rgba(245,158,11,0.4)] border-amber-400/80 bg-gradient-to-br from-amber-400/20 to-amber-600/10",
  2: "ring-2 ring-slate-200 shadow-[0_0_24px_rgba(226,232,240,0.6),0_0_12px_rgba(203,213,225,0.5)] border-slate-300/80 bg-gradient-to-br from-slate-400/15 to-slate-500/10",
  3: "ring-2 ring-amber-600 shadow-[0_0_24px_rgba(217,119,6,0.5),0_0_12px_rgba(180,83,9,0.4)] border-amber-600/70 bg-gradient-to-br from-amber-700/15 to-amber-800/10",
} as const;

function LeaderboardRow({
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
}: {
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
}) {
  const rankStyle = rank === 1 ? "font-bold text-amber-300 drop-shadow-[0_0_10px_rgba(251,191,36,0.9)]" : rank === 2 ? "font-bold text-slate-200 drop-shadow-[0_0_8px_rgba(226,232,240,0.8)]" : rank === 3 ? "font-bold text-amber-600 drop-shadow-[0_0_10px_rgba(217,119,6,0.8)]" : "text-white/60 font-mono";
  const podiumGlow = rank <= 3 ? RANK_GLOW[rank as 1 | 2 | 3] : "";
  return (
    <li
      className={`cq-leaderboard-row flex items-center gap-2.5 sm:gap-3 p-3 rounded-xl border transition-colors hover:bg-white/[0.06] ${
        rank <= 3 ? podiumGlow : isCurrentUser ? "bg-cq-elevated border-white/[0.08] border-l-[3px] border-l-uri-keaney" : "bg-cq-card border-white/[0.08]"
      }`}
    >
      <span className={`cq-rank-badge w-8 text-center text-sm ${rankStyle}`}>#{rank}</span>
      <span className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0 border border-white/15 overflow-hidden">
        <AvatarDisplay avatar={avatar} size={36} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-white truncate flex items-center gap-1.5">
          {name}
          {isCurrentUser && <span className="text-xs text-uri-keaney font-normal">(you)</span>}
        </p>
        <p className="text-xs text-white/50 truncate">@{username}</p>
        {showcaseCharacter ? <AchievementShowcaseStrip character={showcaseCharacter} compact /> : null}
        {actions != null && <div className="mt-1.5 sm:hidden">{actions}</div>}
      </div>
      <div className="flex-shrink-0 text-right min-w-[5.5rem] sm:min-w-[6rem]">
        {sortBy !== "level" && statLabel != null && statValue != null ? (
          <>
            <p className="text-lg font-bold text-white tabular-nums leading-none">{statValue.toLocaleString()}</p>
            <p className="text-[10px] font-semibold text-uri-keaney/95 mt-1 leading-tight">{statLabel}</p>
            <p className="text-[10px] text-white/45 mt-1">
              Lv.{level} · {totalXP.toLocaleString()} XP
            </p>
          </>
        ) : (
          <>
            <p className="text-uri-keaney font-semibold">Lv.{level}</p>
            <p className="text-xs text-white/50 font-mono">{totalXP.toLocaleString()} XP</p>
          </>
        )}
      </div>
      {actions != null && <div className="flex-shrink-0 hidden sm:block">{actions}</div>}
    </li>
  );
}
