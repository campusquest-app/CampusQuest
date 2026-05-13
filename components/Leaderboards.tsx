"use client";

import { useMemo, useState, useEffect } from "react";
import { getCharacterById } from "@/lib/friendsStore";
import { getGuilds, GUILD_INTEREST_LABELS } from "@/lib/guildStore";
import { fetchAuthed } from "@/lib/client/dashboardApi";
import type { Character } from "@/lib/types";
import { STAT_KEYS, STAT_LABELS, STAT_ICONS } from "@/lib/types";
import { AvatarDisplay } from "./AvatarDisplay";

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
};

type XpLeaderboardPayload = {
  topUsers: XpLeaderboardRowUi[];
  currentUserRank: number | null;
  currentUserEntry: XpLeaderboardRowUi | null;
  totalRankedUsers: number;
};

export function Leaderboards({ character }: { character: Character }) {
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

  useEffect(() => {
    if (sortBy === "guildLevel") return;
    let cancelled = false;
    setXpLoading(true);
    setXpError(null);
    (async () => {
      try {
        const [c, f] = await Promise.all([
          fetchAuthed<XpLeaderboardPayload>("/api/leaderboards/campus"),
          fetchAuthed<XpLeaderboardPayload>("/api/leaderboards/friends"),
        ]);
        if (cancelled) return;
        setCampusLb(c);
        setFriendsLb(f);
      } catch (err) {
        if (!cancelled) {
          setXpError(err instanceof Error ? err.message : "Could not load leaderboards.");
          setCampusLb(null);
          setFriendsLb(null);
        }
      } finally {
        if (!cancelled) setXpLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sortBy]);

  const xpActive = xpTab === "campus" ? campusLb : friendsLb;
  const xpFriendsEmpty =
    xpTab === "friends" && !xpLoading && !xpError && (xpActive?.totalRankedUsers ?? 0) === 0;
  const xpCampusEmpty = xpTab === "campus" && !xpLoading && !xpError && (xpActive?.totalRankedUsers ?? 0) === 0;
  const xpHasBoard = Boolean(!xpLoading && !xpError && xpActive != null && xpActive.totalRankedUsers > 0);

  const xpRankLine =
    xpHasBoard && xpActive!.currentUserRank != null
      ? xpTab === "campus"
        ? `You are ranked #${xpActive!.currentUserRank} on campus.`
        : `You are ranked #${xpActive!.currentUserRank} among friends.`
      : null;

  const xpInTopSlice = xpActive?.topUsers.some((row) => row.userId === character.id) ?? false;

  const xpShowPinnedCard = xpHasBoard && xpActive?.currentUserEntry != null && !xpInTopSlice;

  return (
    <section className="space-y-6">
      {/* Filter by stat */}
      <div className="card p-4 sm:p-5">
        <h2 className="font-display font-semibold text-white mb-2 flex items-center gap-2">
          <span aria-hidden>🏆</span> Rank by
        </h2>
        <p className="text-sm text-white/50 mb-3">
          {sortBy === "guildLevel"
            ? "Guild level shows guilds only, sorted by highest level."
            : "Campus and friends rankings use verified classmates and connections, sorted by total XP."}
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
          <div className="card p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display font-semibold text-white mb-2 flex flex-wrap items-center gap-2">
                  <span aria-hidden>🏛️</span> Student rankings
                </h2>
                <p className="text-sm text-white/50">
                  Total XP leaderboard for your verified campus. Friends view includes accepted campus connections only.
                </p>
              </div>
            </div>

            <div className="flex rounded-xl bg-white/[0.06] border border-white/12 p-1 gap-1 w-full max-w-md">
              <button
                type="button"
                onClick={() => setXpTab("campus")}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors min-h-[44px] ${
                  xpTab === "campus"
                    ? "bg-uri-keaney text-white shadow-sm"
                    : "text-white/75 hover:bg-white/10"
                }`}
              >
                Campus
              </button>
              <button
                type="button"
                onClick={() => setXpTab("friends")}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors min-h-[44px] ${
                  xpTab === "friends"
                    ? "bg-uri-keaney text-white shadow-sm"
                    : "text-white/75 hover:bg-white/10"
                }`}
              >
                Friends
              </button>
            </div>

            {xpError ? (
              <div className="rounded-xl border border-rose-400/35 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{xpError}</div>
            ) : null}

            {xpLoading ? (
              <XpLeaderboardSkeleton />
            ) : xpFriendsEmpty ? (
              <div className="cq-empty-state rounded-xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center">
                <p className="text-xl mb-1.5" aria-hidden>🤝</p>
                <p className="text-sm font-semibold text-white/70">Add friends to compare progress.</p>
                <p className="text-xs text-white/50 mt-1">Accepted campus-only connections appear here, ranked by total XP.</p>
              </div>
            ) : xpCampusEmpty ? (
              <div className="cq-empty-state rounded-xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center">
                <p className="text-xl mb-1.5" aria-hidden>🏫</p>
                <p className="text-sm font-semibold text-white/70">No campus rankings yet.</p>
                <p className="text-xs text-white/50 mt-1">Campus leaderboard appears once classmates verify their school emails.</p>
              </div>
            ) : xpHasBoard && xpActive ? (
              <div className="space-y-4">
                {xpRankLine ? (
                  <p className="text-sm font-medium text-white/85 border border-white/12 rounded-xl px-3 py-2 bg-white/[0.04]">
                    {xpRankLine}{" "}
                    <span className="text-xs font-normal text-white/45">
                      ({xpActive.totalRankedUsers.toLocaleString()} ranked)
                    </span>
                  </p>
                ) : null}

                {xpShowPinnedCard && xpActive.currentUserEntry ? (
                  <div className="rounded-xl border border-uri-keaney/45 bg-uri-keaney/15 p-3">
                    <p className="text-[11px] font-semibold text-uri-keaney uppercase tracking-wide mb-2">Your rank</p>
                    <LeaderboardRow
                      rank={xpActive.currentUserEntry.rank}
                      name={xpActive.currentUserEntry.displayName}
                      username={xpActive.currentUserEntry.username}
                      avatar={xpActive.currentUserEntry.avatar}
                      level={xpActive.currentUserEntry.level}
                      totalXP={xpActive.currentUserEntry.totalXp}
                      isCurrentUser
                      sortBy="level"
                    />
                  </div>
                ) : null}

                <div>
                  <p className="text-xs font-semibold text-white/45 uppercase tracking-wider mb-2">
                    Top-ranked · Total XP ({xpActive.topUsers.length.toLocaleString()} shown)
                  </p>
                  <ul className="space-y-2">
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
                        sortBy="level"
                      />
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
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
  );
}

function XpLeaderboardSkeleton() {
  return (
    <ul className="space-y-2" aria-hidden>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <li key={i} className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/5">
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
  sortBy?: SortBy;
  statValue?: number;
  statLabel?: string;
  actions?: React.ReactNode;
}) {
  const rankStyle = rank === 1 ? "font-bold text-amber-300 drop-shadow-[0_0_10px_rgba(251,191,36,0.9)]" : rank === 2 ? "font-bold text-slate-200 drop-shadow-[0_0_8px_rgba(226,232,240,0.8)]" : rank === 3 ? "font-bold text-amber-600 drop-shadow-[0_0_10px_rgba(217,119,6,0.8)]" : "text-white/60 font-mono";
  const podiumGlow = rank <= 3 ? RANK_GLOW[rank as 1 | 2 | 3] : "";
  return (
    <li
      className={`cq-leaderboard-row flex items-center gap-2.5 sm:gap-3 p-3 rounded-xl border transition-colors ${
        rank <= 3 ? podiumGlow : isCurrentUser ? "bg-uri-keaney/15 border-uri-keaney/40" : "bg-white/5 border-white/10"
      }`}
    >
      <span className={`cq-rank-badge w-8 text-center text-sm ${rankStyle}`}>#{rank}</span>
      <span className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0 border border-white/15 overflow-hidden">
        <AvatarDisplay avatar={avatar} size={40} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-white truncate flex items-center gap-1.5">
          {name}
          {isCurrentUser && <span className="text-xs text-uri-keaney font-normal">(you)</span>}
        </p>
        <p className="text-xs text-white/50 truncate">@{username}</p>
        {actions != null && <div className="mt-1.5 sm:hidden">{actions}</div>}
      </div>
      <div className="flex-shrink-0 text-right min-w-[5.5rem] sm:min-w-[6rem]">
        {sortBy !== "level" && statLabel != null && statValue != null ? (
          <>
            <p className="text-uri-keaney font-semibold text-sm">{statLabel} {statValue}</p>
            <p className="text-xs text-white/50">
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
