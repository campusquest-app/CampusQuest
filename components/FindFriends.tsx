"use client";

import { useState, useCallback, useEffect } from "react";
import {
  avatarFromConnectionProfile,
  cancelOutgoingConnectionRequest,
  fetchConnections,
  fetchIncomingConnectionRequests,
  fetchOutgoingConnectionRequests,
  formatRequestSentAt,
  respondToConnectionRequest,
  type ConnectionItem,
  type ConnectionRequestItem,
} from "@/lib/client/socialConnectionsClient";
import { requestConnection } from "@/lib/client/connectionRequestActions";
import { emitSocialSync, subscribeSocialSync } from "@/lib/client/socialSync";
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
import type { Character, Friend, Guild, GuildInterest } from "@/lib/types";
import { STAT_KEYS, STAT_LABELS, STAT_ICONS } from "@/lib/types";
import { AvatarDisplay } from "./AvatarDisplay";
import { GuildCard } from "./GuildCard";
import { CreateGuildModal } from "./CreateGuildModal";
import { ViewGuildModal } from "./ViewGuildModal";

export function FindFriends({
  character,
  onRefresh,
  onOpenDm,
  onViewProfile,
}: {
  character: Character;
  onRefresh?: () => void;
  onOpenDm?: (other: { userId: string; username: string; name: string; avatar: string }) => void;
  onViewProfile?: (userId: string) => void;
}) {
  const [usernameInput, setUsernameInput] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<ConnectionRequestItem[]>([]);
  const [outgoing, setOutgoing] = useState<ConnectionRequestItem[]>([]);
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [socialLoading, setSocialLoading] = useState(true);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [showCreateGuild, setShowCreateGuild] = useState(false);
  const [viewGuild, setViewGuild] = useState<Guild | null>(null);
  const [guildSearchQuery, setGuildSearchQuery] = useState("");
  const [pendingOpen, setPendingOpen] = useState(false);

  const refreshSocial = useCallback(async () => {
    setSocialError(null);
    try {
      const [incomingRows, outgoingRows, connectionPayload] = await Promise.all([
        fetchIncomingConnectionRequests(),
        fetchOutgoingConnectionRequests(),
        fetchConnections(),
      ]);
      setIncoming(incomingRows);
      setOutgoing(outgoingRows);
      setConnections(connectionPayload.connections);
    } catch (loadError) {
      setSocialError(loadError instanceof Error ? loadError.message : "Could not load connections.");
    } finally {
      setSocialLoading(false);
    }
    onRefresh?.();
  }, [onRefresh]);

  useEffect(() => {
    void refreshSocial();
    const unsubscribe = subscribeSocialSync(() => void refreshSocial());
    const intervalId = window.setInterval(() => void refreshSocial(), 25_000);
    return () => {
      unsubscribe();
      window.clearInterval(intervalId);
    };
  }, [refreshSocial]);

  useEffect(() => {
    if (!actionToast) return undefined;
    const tid = window.setTimeout(() => setActionToast(null), 2800);
    return () => window.clearTimeout(tid);
  }, [actionToast]);

  async function handleSendRequest(e: React.FormEvent) {
    e.preventDefault();
    setSendError(null);
    const targetUsername = usernameInput.trim().toLowerCase();
    if (!targetUsername) {
      setSendError("Enter a username.");
      return;
    }
    setSendingRequest(true);
    try {
      const outcome = await requestConnection({
        username: targetUsername,
        connections,
        outgoing,
      });
      setUsernameInput("");
      setActionToast(outcome.toastMessage);
      await refreshSocial();
      emitSocialSync({ source: "friends" });
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Could not send request.";
      setSendError(message.replace(/^Backend request failed:[^.]*\.\s*/i, ""));
    } finally {
      setSendingRequest(false);
    }
  }

  async function handleAccept(request: ConnectionRequestItem) {
    setRespondingId(request.requestId);
    setSocialError(null);
    try {
      await respondToConnectionRequest(request.requestId, "accept");
      setActionToast(`You are now following ${request.username}`);
      await refreshSocial();
      emitSocialSync({ source: "friends" });
    } catch (acceptError) {
      setSocialError(acceptError instanceof Error ? acceptError.message : "Could not accept request.");
    } finally {
      setRespondingId(null);
    }
  }

  async function handleDecline(requestId: string) {
    setRespondingId(requestId);
    setSocialError(null);
    try {
      await respondToConnectionRequest(requestId, "decline");
      setActionToast("Follow request declined");
      await refreshSocial();
      emitSocialSync({ source: "friends" });
    } catch (declineError) {
      setSocialError(declineError instanceof Error ? declineError.message : "Could not decline request.");
    } finally {
      setRespondingId(null);
    }
  }

  async function handleUnsend(requestId: string) {
    setSocialError(null);
    try {
      await cancelOutgoingConnectionRequest(requestId);
      await refreshSocial();
      emitSocialSync({ source: "friends" });
    } catch (cancelError) {
      setSocialError(cancelError instanceof Error ? cancelError.message : "Could not unsend request.");
    }
  }

  function refresh() {
    void refreshSocial();
  }

  const friends: Friend[] = connections.map((connection) => ({
    userId: connection.userId,
    username: connection.username,
    name: connection.displayName,
    avatar: avatarFromConnectionProfile(connection),
    level: 1,
    totalXP: 0,
    streakDays: 0,
    stats: {
      strength: 0,
      stamina: 0,
      knowledge: 0,
      social: 0,
      focus: 0,
    },
    addedAt: Date.now(),
  }));

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
    <section className="cq-tab-shell space-y-6 pb-8">
      <header className="cq-screen-header">
        <p className="cq-screen-header__eyebrow">Campus Connections</p>
        <h1 className="cq-screen-header__title">Friends &amp; Guilds</h1>
        <p className="cq-screen-header__subtitle">
          Follow classmates, accept requests, and team up in guilds for bonus XP.
        </p>
      </header>
      {actionToast ? (
        <div className="fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-xl border border-uri-keaney/40 bg-uri-navy/95 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          {actionToast}
        </div>
      ) : null}

      {incoming.length > 0 && (
        <div className="card p-4 sm:p-5">
          <h3 className="font-display font-semibold text-cq-foreground mb-3 flex items-center gap-2">
            <span aria-hidden>📬</span> Follow Requests ({incoming.length})
          </h3>
          <ul className="space-y-3">
            {incoming.map((req) => (
              <li
                key={req.requestId}
                className="flex items-start gap-3 p-3 rounded-xl bg-cq-elevated border border-cq-border border-l-[3px] border-l-uri-keaney"
              >
                {onViewProfile ? (
                  <button
                    type="button"
                    onClick={() => onViewProfile(req.userId)}
                    className="w-12 h-12 rounded-xl bg-cq-card flex items-center justify-center border border-cq-border flex-shrink-0 overflow-hidden touch-manipulation transition hover:opacity-90"
                    aria-label={`View ${req.displayName}'s profile`}
                  >
                    <AvatarDisplay avatar={avatarFromConnectionProfile(req)} size={48} />
                  </button>
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-cq-card flex items-center justify-center border border-cq-border flex-shrink-0 overflow-hidden">
                    <AvatarDisplay avatar={avatarFromConnectionProfile(req)} size={48} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {onViewProfile ? (
                    <button
                      type="button"
                      onClick={() => onViewProfile(req.userId)}
                      className="text-left font-medium text-cq-foreground truncate transition hover:text-uri-keaney"
                    >
                      {req.displayName}
                    </button>
                  ) : (
                    <p className="font-medium text-cq-foreground truncate">{req.displayName}</p>
                  )}
                  {onViewProfile ? (
                    <button
                      type="button"
                      onClick={() => onViewProfile(req.userId)}
                      className="text-left text-sm text-uri-keaney/90 transition hover:text-uri-keaney"
                    >
                      @{req.username}
                    </button>
                  ) : (
                    <p className="text-sm text-uri-keaney/90">@{req.username}</p>
                  )}
                  {typeof req.mutualFriendsCount === "number" && req.mutualFriendsCount > 0 ? (
                    <p className="text-xs text-cq-muted mt-0.5">
                      {req.mutualFriendsCount} mutual connection{req.mutualFriendsCount === 1 ? "" : "s"}
                    </p>
                  ) : null}
                  <p className="text-[11px] text-cq-muted mt-1">{formatRequestSentAt(req.createdAt)}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    type="button"
                    disabled={respondingId === req.requestId}
                    onClick={() => void handleAccept(req)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-uri-keaney text-white hover:bg-uri-keaney/90 disabled:opacity-60"
                  >
                    Follow Back
                  </button>
                  <button
                    type="button"
                    disabled={respondingId === req.requestId}
                    onClick={() => void handleDecline(req.requestId)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 border border-cq-border disabled:opacity-60"
                  >
                    Deny
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {socialError ? (
        <div className="rounded-xl border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          {socialError}
        </div>
      ) : null}

      {weeklyRace.length > 0 && (
        <div className="rounded-2xl border border-uri-gold/40 bg-gradient-to-r from-uri-gold/10 to-transparent p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-uri-gold mb-2">⚔️ Guild vs guild (this week)</h3>
          <p className="text-[11px] text-cq-muted mb-2">#1 guild next Monday: members get +10% XP for the week. Every log adds race points.</p>
          <ol className="space-y-1">
            {weeklyRace.map((row, i) => {
              const g = getGuildById(row.guildId);
              return (
                <li key={row.guildId} className="flex justify-between text-sm text-slate-800">
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
        <h2 className="font-display font-semibold text-cq-foreground mb-2 flex items-center gap-2">
          <span aria-hidden>👋</span> Find People
        </h2>
        <p className="text-sm text-cq-muted mb-4">
          Search by username and tap <strong className="text-cq-muted">Follow</strong> to send a follow request. Once they accept, you&apos;ll follow each other and see their posts on The Quad.
        </p>
        <form onSubmit={handleSendRequest} className="flex gap-2 flex-wrap">
          <input
            type="text"
            value={usernameInput}
            onChange={(e) => { setUsernameInput(e.target.value.toLowerCase().replace(/\s+/g, "_")); setSendError(null); }}
            placeholder="e.g. alex_rhody"
            className="flex-1 min-w-[140px] px-3 py-2.5 rounded-xl bg-white border border-cq-border text-cq-foreground placeholder:text-cq-muted focus:outline-none focus:ring-2 focus:ring-uri-keaney/60"
          />
          <button
            type="submit"
            disabled={sendingRequest}
            className="px-4 py-2.5 rounded-xl font-semibold bg-uri-keaney text-white hover:bg-uri-keaney/90 transition-colors disabled:opacity-60"
          >
            {sendingRequest ? "Sending..." : "Follow"}
          </button>
        </form>
        {sendError && <p className="text-sm text-amber-400 mt-2">{sendError}</p>}
      </div>

      {outgoing.length > 0 && (
        <div className="card p-4 sm:p-5">
          <button
            type="button"
            onClick={() => setPendingOpen((o) => !o)}
            className="w-full flex items-center justify-between gap-2 text-left rounded-lg -mx-1 px-1 py-1 hover:bg-cq-elevated transition-colors"
            aria-expanded={pendingOpen}
          >
            <span className="font-display font-semibold text-cq-foreground flex items-center gap-2">
              <span aria-hidden>📤</span> Pending Sent Requests ({outgoing.length})
            </span>
            <span className="text-cq-muted text-sm" aria-hidden>{pendingOpen ? "▼" : "▶"}</span>
          </button>
          {pendingOpen && (
            <ul className="space-y-2 mt-3 pt-3 border-t border-cq-border">
              {outgoing.map((req) => (
                <li
                  key={req.requestId}
                  className="flex items-center gap-3 p-2.5 rounded-xl bg-cq-elevated border border-cq-border"
                >
                  <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 border border-cq-border">
                    <AvatarDisplay avatar={avatarFromConnectionProfile(req)} size={36} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-800 truncate">{req.displayName}</p>
                    <p className="text-xs text-uri-keaney/80">@{req.username}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleUnsend(req.requestId)}
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
        <h2 className="font-display font-semibold text-cq-foreground mb-2 flex items-center gap-2">
          <span aria-hidden>🛡️</span> Find Guilds
        </h2>
        <p className="text-sm text-cq-muted mb-4">
          Search by guild name or interest. Browse recommended guilds below.
        </p>
        <input
          type="text"
          value={guildSearchQuery}
          onChange={(e) => setGuildSearchQuery(e.target.value)}
          placeholder="e.g. Library, Fitness, Study..."
          className="w-full px-3 py-2.5 rounded-xl bg-white border border-cq-border text-cq-foreground placeholder:text-cq-muted focus:outline-none focus:ring-2 focus:ring-uri-keaney/60"
          aria-label="Search guilds"
        />
      </div>

      {/* Guilds banner + section */}
      <div className="rounded-2xl border border-cq-border bg-cq-card p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="font-display font-semibold text-cq-foreground mb-1 flex items-center gap-2">
              <span aria-hidden>🛡️</span> Guilds
            </h2>
            <p className="text-sm text-slate-700">Join a Guild, earn bonus XP together.</p>
          </div>
          <button
            type="button"
            onClick={() => character.totalXP >= 300 && setShowCreateGuild(true)}
            disabled={character.totalXP < 300}
            title={character.totalXP < 300 ? "Reach 300 total XP to create a guild" : undefined}
            className={`px-4 py-2.5 rounded-xl font-semibold border shrink-0 transition-colors ${
              character.totalXP >= 300
                ? "bg-uri-keaney text-white hover:bg-uri-keaney/90 border-uri-keaney/40 cursor-pointer"
                : "bg-slate-100 text-cq-muted border-cq-border cursor-not-allowed"
            }`}
          >
            {character.totalXP < 300 ? "🔒 Create guild (Unlock at 300 XP)" : "Create Guild"}
          </button>
        </div>

        <p className="text-xs text-cq-muted mt-4 mb-3">Recommended Guilds for You</p>
        <div className="space-y-4">
          {recommendedByInterest.map(({ interest, guilds }) =>
            guilds.length > 0 ? (
              <div key={interest}>
                <h3 className="text-xs font-medium text-cq-muted uppercase tracking-wider mb-2">
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

      <div className="card p-4 sm:p-5">
        <h3 className="font-display font-semibold text-cq-foreground mb-3 flex items-center gap-2">
          <span aria-hidden>🦌</span> Connections ({friends.length})
        </h3>
        {socialLoading ? (
          <p className="text-sm text-cq-muted">Loading connections...</p>
        ) : friends.length === 0 ? (
          <p className="text-sm text-cq-muted">No connections yet. Follow someone or accept a request — you&apos;ll follow each other once they accept.</p>
        ) : (
          <ul className="space-y-4">
            {friends.map((friend) => (
              <FriendCard
                key={friend.userId}
                friend={friend}
                onMessage={onOpenDm ? () => onOpenDm({ userId: friend.userId, username: friend.username, name: friend.name, avatar: friend.avatar }) : undefined}
                onViewProfile={onViewProfile}
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
  onMessage,
  onViewProfile,
}: {
  friend: Friend;
  onMessage?: () => void;
  onViewProfile?: (userId: string) => void;
}) {
  return (
    <li className="p-4 rounded-xl bg-cq-card border border-cq-border">
      <div className="flex items-start gap-3">
        {onViewProfile ? (
          <button
            type="button"
            onClick={() => onViewProfile(friend.userId)}
            className="w-14 h-14 rounded-xl bg-cq-elevated flex items-center justify-center border border-cq-border flex-shrink-0 overflow-hidden touch-manipulation transition hover:opacity-90"
            aria-label={`View ${friend.name}'s profile`}
          >
            <AvatarDisplay avatar={friend.avatar} size={56} />
          </button>
        ) : (
          <div className="w-14 h-14 rounded-xl bg-cq-elevated flex items-center justify-center border border-cq-border flex-shrink-0 overflow-hidden">
            <AvatarDisplay avatar={friend.avatar} size={56} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {onViewProfile ? (
              <button
                type="button"
                onClick={() => onViewProfile(friend.userId)}
                className="font-semibold text-cq-foreground truncate transition hover:text-uri-keaney"
              >
                {friend.name}
              </button>
            ) : (
              <p className="font-semibold text-cq-foreground truncate">{friend.name}</p>
            )}
            <span className="text-xs font-medium text-uri-keaney/90 px-2 py-0.5 rounded bg-uri-keaney/15 border border-uri-keaney/30">Following</span>
          </div>
          {onViewProfile ? (
            <button
              type="button"
              onClick={() => onViewProfile(friend.userId)}
              className="text-left text-sm text-uri-keaney/90 transition hover:text-uri-keaney"
            >
              @{friend.username}
            </button>
          ) : (
            <p className="text-sm text-uri-keaney/90">@{friend.username}</p>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-uri-keaney font-mono text-sm font-semibold bg-uri-keaney/15 px-1.5 py-0.5 rounded">
              Lv.{friend.level}
            </span>
            <span className="text-cq-muted text-sm font-mono">{friend.totalXP} XP</span>
            {friend.streakDays > 0 && (
              <span className="text-amber-400/90 text-xs">🔥 {friend.streakDays}d streak</span>
            )}
          </div>
          <div className="flex gap-2 mt-2 flex-wrap">
            {onMessage && (
              <button
                type="button"
                onClick={onMessage}
                className="text-xs font-medium bg-uri-keaney/15 hover:bg-uri-keaney/25 text-uri-keaney px-2.5 py-1.5 rounded-lg border border-uri-keaney/40"
              >
                💬 Message
              </button>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-x-3 gap-y-1.5">
            {STAT_KEYS.map((key) => (
              <div key={key} className="flex items-center gap-1.5 text-xs">
                <span title={STAT_LABELS[key]}>{STAT_ICONS[key]}</span>
                <span className="text-cq-muted">{STAT_LABELS[key]}</span>
                <span className="font-mono text-slate-800">{friend.stats[key] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </li>
  );
}
