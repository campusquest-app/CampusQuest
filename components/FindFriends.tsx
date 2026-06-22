"use client";

import { useState, useCallback, useEffect } from "react";
import { Lock } from "lucide-react";
import {
  avatarFromConnectionProfile,
  cancelOutgoingConnectionRequest,
  connectionItemToFriend,
  fetchConnections,
  fetchIncomingConnectionRequests,
  fetchOutgoingConnectionRequests,
  formatRequestSentAt,
  respondToConnectionRequest,
  type ConnectionItem,
  type ConnectionRequestItem,
} from "@/lib/client/socialConnectionsClient";
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
import { STAT_KEYS, STAT_LABELS } from "@/lib/types";
import { StatIcon } from "@/components/stats/StatIcon";
import { AvatarDisplay } from "./AvatarDisplay";
import { formatStreakBadge } from "@/lib/streakMessaging";
import { GuildCard } from "./GuildCard";
import { CreateGuildModal } from "./CreateGuildModal";
import { ViewGuildModal } from "./ViewGuildModal";
import { GuildLiveSearchField, PeopleLiveSearchField } from "./friends/FriendsGuildsLiveSearch";
import { ScreenDataState } from "@/components/ui/ScreenDataState";

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
  const [incoming, setIncoming] = useState<ConnectionRequestItem[]>([]);
  const [outgoing, setOutgoing] = useState<ConnectionRequestItem[]>([]);
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [socialLoading, setSocialLoading] = useState(true);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [showCreateGuild, setShowCreateGuild] = useState(false);
  const [viewGuild, setViewGuild] = useState<Guild | null>(null);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [peopleSearchError, setPeopleSearchError] = useState<string | null>(null);
  const [guildSearchError, setGuildSearchError] = useState<string | null>(null);

  const refreshSocial = useCallback(async () => {
    setSocialError(null);
    setSocialLoading(true);
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

  async function handlePeopleSearchRefresh() {
    await refreshSocial();
    emitSocialSync({ source: "friends" });
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

  const friends: Friend[] = connections.map((connection) => connectionItemToFriend(connection));

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
  const recommendedByInterest = interests.map((interest) => ({
    interest,
    guilds: getRecommendedGuilds(interest),
  }));

  const weeklyRace = getGuildWeeklyScores().slice(0, 5);
  const canCreateGuild = character.totalXP >= 300;

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
                    className="cq-avatar-slot w-12 h-12 bg-cq-card border border-cq-border touch-manipulation transition hover:opacity-90"
                    aria-label={`View ${req.displayName}'s profile`}
                  >
                    <AvatarDisplay avatar={avatarFromConnectionProfile(req)} fitParent size={48} />
                  </button>
                ) : (
                  <div className="cq-avatar-slot w-12 h-12 bg-cq-card border border-cq-border">
                    <AvatarDisplay avatar={avatarFromConnectionProfile(req)} fitParent size={48} />
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
        <ScreenDataState
          variant="error"
          message="Could not load friends and connections."
          detail={socialError}
          onRetry={() => void refreshSocial()}
          compact
        />
      ) : null}

      {socialLoading && incoming.length === 0 && outgoing.length === 0 && connections.length === 0 ? (
        <ScreenDataState variant="loading" message="Loading friends and connections…" compact />
      ) : null}

      {!socialLoading || incoming.length > 0 || outgoing.length > 0 || connections.length > 0 ? (
        <>
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
          Start typing to find classmates by name or username. Tap <strong className="text-cq-muted">Follow</strong> on a result to send a request — once they accept, you&apos;ll follow each other and see their posts on The Quad.
        </p>
        <PeopleLiveSearchField
          connections={connections}
          outgoing={outgoing}
          incoming={incoming}
          onRefresh={handlePeopleSearchRefresh}
          onViewProfile={onViewProfile}
          onToast={setActionToast}
          onError={setPeopleSearchError}
          onClearError={() => setPeopleSearchError(null)}
        />
        {peopleSearchError ? <p className="text-sm text-amber-400 mt-2">{peopleSearchError}</p> : null}
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
                  <div className="cq-avatar-slot w-9 h-9 border border-cq-border">
                    <AvatarDisplay avatar={avatarFromConnectionProfile(req)} fitParent size={36} />
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
          Search by guild name or interest. Results appear as you type.
        </p>
        <GuildLiveSearchField
          character={character}
          onRefresh={refresh}
          onViewGuild={(guildId) => {
            const guild = getGuildById(guildId);
            if (guild) setViewGuild(guild);
          }}
          onToast={setActionToast}
          onError={setGuildSearchError}
          onClearError={() => setGuildSearchError(null)}
        />
        {guildSearchError ? <p className="text-sm text-amber-400 mt-2">{guildSearchError}</p> : null}
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
            onClick={() => canCreateGuild && setShowCreateGuild(true)}
            disabled={!canCreateGuild}
            title={!canCreateGuild ? "Reach 300 total XP to create a guild" : undefined}
            className="cq-guild-create-btn"
            aria-label={canCreateGuild ? "Create Guild" : "Create Guild — unlock at 300 XP"}
          >
            {canCreateGuild ? (
              "Create Guild"
            ) : (
              <>
                <Lock className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2.25} />
                Create Guild (Unlock at 300 XP)
              </>
            )}
          </button>
        </div>

        <p className="text-xs text-cq-muted mt-4 mb-3">Browse guilds</p>
        {recommendedByInterest.every(({ guilds }) => guilds.length === 0) ? (
          <ScreenDataState
            variant="empty"
            message="No guilds have been created yet."
            detail={
              canCreateGuild
                ? "Be the first to create a guild, or search above when guilds become available."
                : "Join a guild when guilds become available, or unlock Create Guild at 300 XP."
            }
            compact
          />
        ) : (
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
        )}
      </div>

      <div className="card p-4 sm:p-5">
        <h3 className="font-display font-semibold text-cq-foreground mb-3 flex items-center gap-2">
          <span aria-hidden>🦌</span> Connections ({friends.length})
        </h3>
        {socialLoading ? (
          <ScreenDataState variant="loading" message="Loading connections…" compact />
        ) : friends.length === 0 ? (
          <ScreenDataState
            variant="empty"
            message="No connections yet."
            detail="Follow someone or accept a request — you'll follow each other once they accept."
            compact
          />
        ) : (
          <ul className="space-y-4">
            {friends.map((friend) => {
              const connection = connections.find((row) => row.userId === friend.userId);
              return (
              <FriendCard
                key={friend.userId}
                friend={friend}
                title={connection?.title}
                guild={connection?.guild}
                statsAvailable={connection?.statsAvailable !== false}
                onMessage={onOpenDm ? () => onOpenDm({ userId: friend.userId, username: friend.username, name: friend.name, avatar: friend.avatar }) : undefined}
                onViewProfile={onViewProfile}
              />
              );
            })}
          </ul>
        )}
      </div>
        </>
      ) : null}

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
  title,
  guild,
  statsAvailable = true,
}: {
  friend: Friend;
  onMessage?: () => void;
  onViewProfile?: (userId: string) => void;
  title?: string | null;
  guild?: string | null;
  statsAvailable?: boolean;
}) {
  return (
    <li className="p-4 rounded-xl bg-cq-card border border-cq-border">
      <div className="flex items-start gap-3">
        {onViewProfile ? (
          <button
            type="button"
            onClick={() => onViewProfile(friend.userId)}
            className="cq-avatar-slot w-14 h-14 bg-cq-elevated border border-cq-border touch-manipulation transition hover:opacity-90"
            aria-label={`View ${friend.name}'s profile`}
          >
            <AvatarDisplay avatar={friend.avatar} fitParent size={56} />
          </button>
        ) : (
          <div className="cq-avatar-slot w-14 h-14 bg-cq-elevated border border-cq-border">
            <AvatarDisplay avatar={friend.avatar} fitParent size={56} />
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
            <span className="text-white/60 text-sm font-mono">{friend.totalXP.toLocaleString()} XP</span>
            {(() => {
              const badge = formatStreakBadge(friend.streakDays);
              return badge ? <span className="text-amber-400/90 text-xs">{badge}</span> : null;
            })()}
          </div>
          {(title || guild) && (
            <p className="mt-1.5 text-xs text-white/60">
              {[title, guild].filter(Boolean).join(" · ")}
            </p>
          )}
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
          {statsAvailable ? (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {STAT_KEYS.map((key) => (
                <div
                  key={key}
                  className="flex min-w-0 flex-col gap-1 rounded-[14px] border border-sky-300/[0.18] bg-white/[0.06] px-2.5 py-2"
                >
                  <div className="flex min-w-0 items-center gap-1">
                    <StatIcon stat={key} size="sm" label={STAT_LABELS[key]} />
                    <span className="truncate text-[11px] text-white/[0.78]">{STAT_LABELS[key]}</span>
                  </div>
                  <span className="font-mono text-[15px] font-bold leading-none text-white/[0.95]">
                    {friend.stats[key] ?? 0}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-xs text-white/60">Stats unavailable</p>
          )}
        </div>
      </div>
    </li>
  );
}
