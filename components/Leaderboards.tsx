"use client";

import { useMemo, useState, useCallback } from "react";
import { getFriends, getCharacterByUsername, getOutgoingRequests, sendFriendRequest, getCharacterById } from "@/lib/friendsStore";
import { unfollow, isFollowing, follow, followByUsername } from "@/lib/followStore";
import { getGuilds, getMaxGuildLevelForCharacter, GUILD_INTEREST_LABELS } from "@/lib/guildStore";
import { CAMPUS_LEADERBOARD_PLACEHOLDERS } from "@/lib/campusLeaderboard";
import type { Character } from "@/lib/types";
import type { Friend } from "@/lib/types";
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

function getSortValueFriend(f: Friend, sortBy: SortBy, getGuildLevel: (userId: string) => number): number {
  if (sortBy === "level") return f.level;
  if (sortBy === "bossesDefeated") return f.bossesDefeatedCount ?? 0;
  if (sortBy === "finalBossesDefeated") return f.finalBossesDefeatedCount ?? 0;
  if (sortBy === "guildLevel") return getGuildLevel(f.userId);
  return f.stats[sortBy] ?? 0;
}

function getSortLabel(sortBy: SortBy): string {
  if (sortBy === "level") return "Level";
  if (sortBy === "bossesDefeated") return "Bosses defeated";
  if (sortBy === "finalBossesDefeated") return "Final bosses defeated";
  if (sortBy === "guildLevel") return "Guild level";
  return STAT_LABELS[sortBy];
}

function getSortValueCampus(
  e: { level: number; stats: Record<string, number>; bossesDefeatedCount?: number; finalBossesDefeatedCount?: number; highestGuildLevel?: number },
  sortBy: SortBy
): number {
  if (sortBy === "level") return e.level;
  if (sortBy === "bossesDefeated") return e.bossesDefeatedCount ?? 0;
  if (sortBy === "finalBossesDefeated") return e.finalBossesDefeatedCount ?? 0;
  if (sortBy === "guildLevel") return e.highestGuildLevel ?? 0;
  return e.stats[sortBy] ?? 0;
}

export function Leaderboards({ character }: { character: Character }) {
  const [sortBy, setSortBy] = useState<SortBy>("level");
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedGuildId, setExpandedGuildId] = useState<string | null>(null);
  const [expandedScholarGuildId, setExpandedScholarGuildId] = useState<string | null>(null);

  const getGuildLevel = (userId: string) => getMaxGuildLevelForCharacter(userId);
  const currentUserGuildLevel = getMaxGuildLevelForCharacter(character.id);

  const friends = useMemo(() => {
    const list = getFriends(character.id);
    return [...list].sort((a, b) => {
      const va = getSortValueFriend(a, sortBy, getGuildLevel);
      const vb = getSortValueFriend(b, sortBy, getGuildLevel);
      if (vb !== va) return vb - va;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }, [character.id, sortBy, refreshKey]);

  const campusSorted = useMemo(() => {
    return [...CAMPUS_LEADERBOARD_PLACEHOLDERS].sort((a, b) => {
      const va = getSortValueCampus(a, sortBy);
      const vb = getSortValueCampus(b, sortBy);
      if (vb !== va) return vb - va;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }, [sortBy]);

  const sortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? "Level";

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

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

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
            : "Filter leaderboards by stat or level."}
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
          {/* Friends leaderboard */}
          <div className="card p-4 sm:p-5">
            <h2 className="font-display font-semibold text-white mb-2 flex items-center gap-2">
              <span aria-hidden>🦌</span> Friends leaderboard
            </h2>
            <p className="text-sm text-white/50 mb-4">
              Ranked by {sortLabel}. Only your accepted friends.
            </p>
            {friends.length === 0 ? (
              <div className="cq-empty-state rounded-xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center">
                <p className="text-xl mb-1.5" aria-hidden>🤝</p>
                <p className="text-sm font-semibold text-white/70">No friends on your board yet.</p>
                <p className="text-xs text-white/50 mt-1">Add friends in Find Friends to unlock social leaderboards.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {friends.map((friend, index) => {
              const following = isFollowing(character.id, friend.userId);
              return (
                <LeaderboardRow
                  key={friend.userId}
                  rank={index + 1}
                  name={friend.name}
                  username={friend.username}
                  avatar={friend.avatar}
                  level={friend.level}
                  totalXP={friend.totalXP}
                  isCurrentUser={false}
                  sortBy={sortBy}
                  statValue={
                    sortBy === "level"
                      ? undefined
                      : getSortValueFriend(friend, sortBy, getGuildLevel)
                  }
                  statLabel={sortBy === "level" ? undefined : getSortLabel(sortBy)}
                  actions={
                    <div className="flex flex-col items-end gap-1">
                      {following ? (
                        <button
                          type="button"
                          onClick={() => { unfollow(character.id, friend.userId); refresh(); }}
                          className="text-xs font-medium text-white/70 hover:text-white px-2.5 py-1 rounded-lg border border-white/20 hover:bg-white/10"
                        >
                          Unfollow
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { follow(character.id, friend.userId); refresh(); }}
                          className="text-xs font-medium text-uri-keaney hover:bg-uri-keaney/15 px-2.5 py-1 rounded-lg border border-uri-keaney/30"
                        >
                          Follow
                        </button>
                      )}
                    </div>
                  }
                />
              );
            })}
          </ul>
        )}
      </div>

      {/* Campus leaderboard */}
      <div className="card p-4 sm:p-5">
        <h2 className="font-display font-semibold text-white mb-2 flex items-center gap-2">
          <span aria-hidden>🏛️</span> Campus leaderboard
        </h2>
        <p className="text-sm text-white/50 mb-4">
          Top students by {sortLabel}. (Placeholder data.)
        </p>
        <ul className="space-y-2">
          {campusSorted.map((entry, index) => {
            const isCurrentUser = character.username.toLowerCase() === entry.username.toLowerCase();
            const friendsList = getFriends(character.id);
            const targetChar = getCharacterByUsername(entry.username);
            const targetId = targetChar?.id;
            const isFriend = friendsList.some((f) => f.username.toLowerCase() === entry.username.toLowerCase());
            const outgoingRequests = getOutgoingRequests(character.id);
            const hasOutgoingRequest = outgoingRequests.some((r) => r.toUsername === entry.username.toLowerCase());
            const following = targetId != null && isFollowing(character.id, targetId);
            const campusEntryForSort: Parameters<typeof getSortValueCampus>[0] = isCurrentUser
              ? { level: character.level, stats: { ...character.stats }, bossesDefeatedCount: character.bossesDefeatedCount, finalBossesDefeatedCount: character.finalBossesDefeatedCount, highestGuildLevel: currentUserGuildLevel }
              : entry;
            const statValue = sortBy === "level" ? undefined : getSortValueCampus(campusEntryForSort, sortBy);
            const statLabel = sortBy === "level" ? undefined : getSortLabel(sortBy);
            return (
              <LeaderboardRow
                key={entry.id}
                rank={index + 1}
                name={entry.name}
                username={entry.username}
                avatar={entry.avatar}
                level={entry.level}
                totalXP={entry.totalXP}
                isCurrentUser={isCurrentUser}
                sortBy={sortBy}
                statValue={statValue}
                statLabel={statLabel}
                actions={
                  isCurrentUser ? undefined : (
                    <div className="flex flex-col items-end gap-1">
                      {!isFriend && (
                        hasOutgoingRequest ? (
                          <span className="text-xs text-white/50">Pending</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              sendFriendRequest(character, entry.username);
                              refresh();
                            }}
                            className="text-xs font-medium text-uri-keaney hover:bg-uri-keaney/15 px-2.5 py-1 rounded-lg border border-uri-keaney/30"
                          >
                            Add friend
                          </button>
                        )
                      )}
                      {targetId != null ? (
                        following ? (
                          <button
                            type="button"
                            onClick={() => { unfollow(character.id, targetId); refresh(); }}
                            className="text-xs font-medium text-white/70 hover:text-white px-2.5 py-1 rounded-lg border border-white/20 hover:bg-white/10"
                          >
                            Unfollow
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              followByUsername(character.id, entry.username, getCharacterByUsername);
                              refresh();
                            }}
                            className="text-xs font-medium text-uri-keaney hover:bg-uri-keaney/15 px-2.5 py-1 rounded-lg border border-uri-keaney/30"
                          >
                            Follow
                          </button>
                        )
                      ) : null}
                    </div>
                  )
                }
              />
            );
          })}
        </ul>
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
            <p className="text-xs text-white/50">Lv.{level} · {totalXP} XP</p>
          </>
        ) : (
          <>
            <p className="text-uri-keaney font-semibold">Lv.{level}</p>
            <p className="text-xs text-white/50 font-mono">{totalXP} XP</p>
          </>
        )}
      </div>
      {actions != null && <div className="flex-shrink-0 hidden sm:block">{actions}</div>}
    </li>
  );
}
