"use client";

import { useState, useCallback, useEffect } from "react";
import {
  sendFriendRequest,
  getIncomingRequests,
  getOutgoingRequests,
  getFriends,
  getCharacterByUsername,
  acceptRequest,
  declineRequest,
  unsendFriendRequest,
} from "@/lib/friendsStore";
import { follow, unfollow, isFollowing, followByUsername } from "@/lib/followStore";
import {
  getRecommendedGuilds,
  getGuildById,
  joinGuild,
  leaveGuild,
  requestGuildInvite,
  hasRequestedInvite,
  GUILD_INTEREST_LABELS,
} from "@/lib/guildStore";
import { getGuildWeeklyScores } from "@/lib/guildWeeklyRace";
import type { Character, Friend, FriendRequest, Guild, GuildInterest } from "@/lib/types";
import { STAT_KEYS, STAT_LABELS, STAT_ICONS } from "@/lib/types";
import { AvatarDisplay } from "./AvatarDisplay";
import { GuildCard } from "./GuildCard";
import { CreateGuildModal } from "./CreateGuildModal";
import { ViewGuildModal } from "./ViewGuildModal";

export function FindFriends({
  character,
  onRefresh,
  onOpenDm,
}: {
  character: Character;
  onRefresh?: () => void;
  onOpenDm?: (other: { userId: string; username: string; name: string; avatar: string }) => void;
}) {
  const [usernameInput, setUsernameInput] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [showCreateGuild, setShowCreateGuild] = useState(false);
  const [viewGuild, setViewGuild] = useState<Guild | null>(null);
  const [guildSearchQuery, setGuildSearchQuery] = useState("");
  const [pendingOpen, setPendingOpen] = useState(false);

  const refresh = useCallback(() => {
    setIncoming(getIncomingRequests(character.username));
    setOutgoing(getOutgoingRequests(character.id));
    setFriends(getFriends(character.id));
    onRefresh?.();
  }, [character.id, character.username, onRefresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function handleSendRequest(e: React.FormEvent) {
    e.preventDefault();
    setSendError(null);
    const result = sendFriendRequest(character, usernameInput);
    if (result.ok) {
      setUsernameInput("");
      refresh();
    } else {
      setSendError(result.error ?? "Could not send request.");
    }
  }

  function handleAccept(id: string) {
    acceptRequest(id, character);
    refresh();
  }

  function handleDecline(id: string) {
    declineRequest(id);
    refresh();
  }

  function handleJoinGuild(guildId: string) {
    joinGuild(character.id, guildId);
    refresh();
  }

  function handleRequestGuildInvite(guildId: string) {
    requestGuildInvite(character.id, guildId);
    refresh();
  }

  function handleLeaveGuild(guildId: string) {
    leaveGuild(character.id, guildId);
    setViewGuild(null);
    refresh();
  }

  const interests: GuildInterest[] = ["study", "fitness", "networking", "clubs"];
  const recommendedByInterest = interests.map((interest) => {
    let guilds = getRecommendedGuilds(interest);
    const q = guildSearchQuery.trim().toLowerCase();
    if (q) {
      guilds = guilds.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          GUILD_INTEREST_LABELS[interest].toLowerCase().includes(q)
      );
    }
    return { interest, guilds };
  });

  const weeklyRace = getGuildWeeklyScores().slice(0, 5);

  return (
    <section className="space-y-5">
      {weeklyRace.length > 0 && (
        <div className="rounded-2xl border border-uri-gold/40 bg-gradient-to-r from-uri-gold/10 to-transparent p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-uri-gold mb-2">⚔️ Guild vs guild (this week)</h3>
          <p className="text-[11px] text-white/55 mb-2">#1 guild next Monday: members get +10% XP for the week. Every log adds race points.</p>
          <ol className="space-y-1">
            {weeklyRace.map((row, i) => {
              const g = getGuildById(row.guildId);
              return (
                <li key={row.guildId} className="flex justify-between text-sm text-white/90">
                  <span>
                    {i + 1}. {g?.name ?? row.guildId}
                  </span>
                  <span className="font-mono text-uri-keaney">{row.score} pts</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Find Friends — above Guilds */}
      <div className="card p-4 sm:p-5">
        <h2 className="font-display font-semibold text-white mb-2 flex items-center gap-2">
          <span aria-hidden>👋</span> Find Friends
        </h2>
        <p className="text-sm text-white/50 mb-4">
          <strong className="text-white/70">Friends</strong> = mutual (both accept). <strong className="text-white/70">Follow</strong> = see their posts on The Quad.
        </p>
        <form onSubmit={handleSendRequest} className="flex gap-2 flex-wrap">
          <input
            type="text"
            value={usernameInput}
            onChange={(e) => { setUsernameInput(e.target.value.toLowerCase().replace(/\s+/g, "_")); setSendError(null); }}
            placeholder="e.g. alex_rhody"
            className="flex-1 min-w-[140px] px-3 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-uri-keaney/60"
          />
          <button
            type="submit"
            className="px-4 py-2.5 rounded-xl font-semibold bg-uri-keaney text-white hover:bg-uri-keaney/90 transition-colors"
          >
            Send request
          </button>
          <button
            type="button"
            onClick={() => {
              setSendError(null);
              const err = followByUsername(character.id, usernameInput, getCharacterByUsername);
              if (err) setSendError(err);
              else {
                setUsernameInput("");
                refresh();
              }
            }}
            className="px-4 py-2.5 rounded-xl font-semibold bg-white/15 text-white border border-white/25 hover:bg-white/20 transition-colors"
          >
            Follow
          </button>
        </form>
        {sendError && <p className="text-sm text-amber-400 mt-2">{sendError}</p>}
      </div>

      {/* Pending (sent) friend requests — dropdown with usernames */}
      {outgoing.length > 0 && (
        <div className="card p-4 sm:p-5">
          <button
            type="button"
            onClick={() => setPendingOpen((o) => !o)}
            className="w-full flex items-center justify-between gap-2 text-left rounded-lg -mx-1 px-1 py-1 hover:bg-white/5 transition-colors"
            aria-expanded={pendingOpen}
          >
            <span className="font-display font-semibold text-white flex items-center gap-2">
              <span aria-hidden>📤</span> Pending requests ({outgoing.length})
            </span>
            <span className="text-white/60 text-sm" aria-hidden>{pendingOpen ? "▼" : "▶"}</span>
          </button>
          {pendingOpen && (
            <ul className="space-y-2 mt-3 pt-3 border-t border-white/10">
              {outgoing.map((req) => (
                <li
                  key={req.id}
                  className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 border border-white/10"
                >
                  <span className="text-white/90 truncate min-w-0">@{req.toUsername}</span>
                  <button
                    type="button"
                    onClick={() => { unsendFriendRequest(req.id); refresh(); }}
                    className="flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium text-amber-400/90 border border-amber-400/40 hover:bg-amber-400/10"
                  >
                    Unsend
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Find Guilds */}
      <div className="card p-4 sm:p-5">
        <h2 className="font-display font-semibold text-white mb-2 flex items-center gap-2">
          <span aria-hidden>🛡️</span> Find Guilds
        </h2>
        <p className="text-sm text-white/50 mb-4">
          Search by guild name or interest. Browse recommended guilds below.
        </p>
        <input
          type="text"
          value={guildSearchQuery}
          onChange={(e) => setGuildSearchQuery(e.target.value)}
          placeholder="e.g. Library, Fitness, Study..."
          className="w-full px-3 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-uri-keaney/60"
          aria-label="Search guilds"
        />
      </div>

      {/* Guilds banner + section */}
      <div className="rounded-2xl border border-uri-keaney/25 bg-gradient-to-br from-uri-keaney/10 to-transparent p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="font-display font-semibold text-white mb-1 flex items-center gap-2">
              <span aria-hidden>🛡️</span> Guilds
            </h2>
            <p className="text-sm text-white/80">Join a Guild, earn bonus XP together.</p>
          </div>
          <button
            type="button"
            onClick={() => character.totalXP >= 300 && setShowCreateGuild(true)}
            disabled={character.totalXP < 300}
            title={character.totalXP < 300 ? "Reach 300 total XP to create a guild" : undefined}
            className={`px-4 py-2.5 rounded-xl font-semibold border shrink-0 transition-colors ${
              character.totalXP >= 300
                ? "bg-uri-keaney text-white hover:bg-uri-keaney/90 border-uri-keaney/40 cursor-pointer"
                : "bg-white/10 text-white/50 border-white/20 cursor-not-allowed"
            }`}
          >
            {character.totalXP < 300 ? "🔒 Create guild (Unlock at 300 XP)" : "Create Guild"}
          </button>
        </div>

        <p className="text-xs text-white/50 mt-4 mb-3">Recommended Guilds for You</p>
        <div className="space-y-4">
          {recommendedByInterest.map(({ interest, guilds }) =>
            guilds.length > 0 ? (
              <div key={interest}>
                <h3 className="text-xs font-medium text-white/60 uppercase tracking-wider mb-2">
                  {GUILD_INTEREST_LABELS[interest]}
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {guilds.map((guild) => (
                    <GuildCard
                      key={guild.id}
                      guild={guild}
                      currentUserId={character.id}
                      userGuildIds={character.guildIds ?? []}
                      hasRequestedInvite={hasRequestedInvite(character.id, guild.id)}
                      onJoin={handleJoinGuild}
                      onRequestInvite={handleRequestGuildInvite}
                      onLeave={handleLeaveGuild}
                      onView={setViewGuild}
                    />
                  ))}
                </div>
              </div>
            ) : null
          )}
        </div>
      </div>

      {incoming.length > 0 && (
        <div className="card p-4 sm:p-5">
          <h3 className="font-display font-semibold text-white mb-3 flex items-center gap-2">
            <span aria-hidden>📬</span> Requests ({incoming.length})
          </h3>
          <ul className="space-y-3">
            {incoming.map((req) => (
              <li
                key={req.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10"
              >
                <span className="text-2xl">{req.fromAvatar}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white truncate">{req.fromName}</p>
                  <p className="text-sm text-uri-keaney/90">@{req.fromUsername}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => handleAccept(req.id)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-uri-keaney text-white hover:bg-uri-keaney/90"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDecline(req.id)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium text-white/80 hover:bg-white/10 border border-white/20"
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card p-4 sm:p-5">
        <h3 className="font-display font-semibold text-white mb-3 flex items-center gap-2">
          <span aria-hidden>🦌</span> Friends ({friends.length})
        </h3>
        {friends.length === 0 ? (
          <p className="text-sm text-white/50">No friends yet. Send a request or accept one above. You&apos;re friends only when you both accept.</p>
        ) : (
          <ul className="space-y-4">
            {friends.map((friend) => (
              <FriendCard
                key={friend.userId}
                friend={friend}
                currentUserId={character.id}
                onFollow={() => { follow(character.id, friend.userId); refresh(); }}
                onUnfollow={() => { unfollow(character.id, friend.userId); refresh(); }}
                isFollowing={isFollowing(character.id, friend.userId)}
                onMessage={onOpenDm ? () => onOpenDm({ userId: friend.userId, username: friend.username, name: friend.name, avatar: friend.avatar }) : undefined}
              />
            ))}
          </ul>
        )}
      </div>

      {showCreateGuild && (
        <CreateGuildModal
          characterId={character.id}
          onClose={() => setShowCreateGuild(false)}
          onCreated={refresh}
        />
      )}
      {viewGuild && (
        <ViewGuildModal
          guild={viewGuild}
          currentUserId={character.id}
          onLeave={handleLeaveGuild}
          onClose={() => setViewGuild(null)}
          onDeleted={refresh}
          onUpdated={() => { refresh(); setViewGuild((g) => (g ? getGuildById(g.id) ?? g : null)); }}
        />
      )}
    </section>
  );
}

function FriendCard({
  friend,
  currentUserId,
  onFollow,
  onUnfollow,
  onMessage,
  isFollowing: following,
}: {
  friend: Friend;
  currentUserId: string;
  onFollow: () => void;
  onUnfollow: () => void;
  onMessage?: () => void;
  isFollowing: boolean;
}) {
  return (
    <li className="p-4 rounded-xl bg-white/5 border border-uri-keaney/20">
      <div className="flex items-start gap-3">
        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-uri-keaney/25 to-uri-navy flex items-center justify-center border border-uri-keaney/30 flex-shrink-0 overflow-hidden">
          <AvatarDisplay avatar={friend.avatar} size={56} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-white truncate">{friend.name}</p>
            <span className="text-xs font-medium text-uri-keaney/90 px-2 py-0.5 rounded bg-uri-keaney/15 border border-uri-keaney/30">Friend</span>
            {following && (
              <span className="text-xs text-white/60">· Following (see posts on Quad)</span>
            )}
          </div>
          <p className="text-sm text-uri-keaney/90">@{friend.username}</p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-uri-keaney font-mono text-sm font-semibold bg-uri-keaney/15 px-1.5 py-0.5 rounded">
              Lv.{friend.level}
            </span>
            <span className="text-white/50 text-sm font-mono">{friend.totalXP} XP</span>
            {friend.streakDays > 0 && (
              <span className="text-amber-400/90 text-xs">🔥 {friend.streakDays}d streak</span>
            )}
          </div>
          <div className="flex gap-2 mt-2 flex-wrap">
            {onMessage && (
              <button
                type="button"
                onClick={onMessage}
                className="text-xs font-medium text-white bg-uri-keaney/20 hover:bg-uri-keaney/30 text-uri-keaney px-2.5 py-1.5 rounded-lg border border-uri-keaney/40"
              >
                💬 Message
              </button>
            )}
            {following ? (
              <button
                type="button"
                onClick={onUnfollow}
                className="text-xs font-medium text-white/70 hover:text-white px-2.5 py-1.5 rounded-lg border border-white/20 hover:bg-white/10"
              >
                Unfollow (hide from Quad)
              </button>
            ) : (
              <button
                type="button"
                onClick={onFollow}
                className="text-xs font-medium text-uri-keaney hover:bg-uri-keaney/15 px-2.5 py-1.5 rounded-lg border border-uri-keaney/30"
              >
                Follow (see posts on Quad)
              </button>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-x-3 gap-y-1.5">
            {STAT_KEYS.map((key) => (
              <div key={key} className="flex items-center gap-1.5 text-xs">
                <span title={STAT_LABELS[key]}>{STAT_ICONS[key]}</span>
                <span className="text-white/70">{STAT_LABELS[key]}</span>
                <span className="font-mono text-white/90">{friend.stats[key] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </li>
  );
}
