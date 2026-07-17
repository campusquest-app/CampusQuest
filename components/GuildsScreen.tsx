"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Lock } from "lucide-react";
import {
  getRecommendedGuilds,
  getGuildById,
  getGuilds,
  joinGuild,
  leaveGuild,
  requestGuildInvite,
  hasRequestedInvite,
  GUILD_INTEREST_LABELS,
} from "@/lib/guildStore";
import { getGuildWeeklyScores } from "@/lib/guildWeeklyRace";
import type { Character, Guild, GuildInterest } from "@/lib/types";
import { GuildCard } from "@/components/GuildCard";
import { CreateGuildModal } from "@/components/CreateGuildModal";
import { ViewGuildModal } from "@/components/ViewGuildModal";
import { GuildLiveSearchField } from "@/components/friends/FriendsGuildsLiveSearch";
import { ScreenDataState } from "@/components/ui/ScreenDataState";
import { ScreenBackHeader } from "@/components/ui/BackButton";
import { MobileSwipeBackSurface } from "@/components/mobile/MobileSwipeBackSurface";

export function GuildsScreen({
  character,
  onRefresh,
  onBack,
}: {
  character: Character;
  onRefresh?: () => void;
  onBack?: () => void;
}) {
  const [showCreateGuild, setShowCreateGuild] = useState(false);
  const [viewGuild, setViewGuild] = useState<Guild | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [guildSearchError, setGuildSearchError] = useState<string | null>(null);
  const [storeTick, setStoreTick] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(() => {
    setStoreTick((n) => n + 1);
    onRefresh?.();
  }, [onRefresh]);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!actionToast) return undefined;
    const tid = window.setTimeout(() => setActionToast(null), 2800);
    return () => window.clearTimeout(tid);
  }, [actionToast]);

  const handleJoinGuild = useCallback(
    (guildId: string) => {
      joinGuild(character.id, guildId);
      refresh();
    },
    [character.id, refresh],
  );

  const handleRequestGuildInvite = useCallback(
    (guildId: string) => {
      requestGuildInvite(character.id, guildId);
      refresh();
    },
    [character.id, refresh],
  );

  const handleLeaveGuild = useCallback(
    (guildId: string) => {
      leaveGuild(character.id, guildId);
      setViewGuild(null);
      refresh();
    },
    [character.id, refresh],
  );

  const interests: GuildInterest[] = ["study", "fitness", "networking", "clubs"];

  const { recommendedByInterest, joinedGuilds, weeklyRace, canCreateGuild, browseEmpty } = useMemo(() => {
    void storeTick;
    const all = getGuilds();
    const fromIds = new Set(character.guildIds ?? []);
    const joined = all.filter((g) => g.memberIds.includes(character.id) || fromIds.has(g.id));
    const joinedIdSet = new Set(joined.map((g) => g.id));
    const byInterest = interests.map((interest) => ({
      interest,
      guilds: getRecommendedGuilds(interest).filter((g) => !joinedIdSet.has(g.id)),
    }));
    return {
      recommendedByInterest: byInterest,
      joinedGuilds: joined,
      weeklyRace: getGuildWeeklyScores().slice(0, 5),
      canCreateGuild: character.totalXP >= 300,
      browseEmpty: byInterest.every(({ guilds }) => guilds.length === 0) && all.length === 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- storeTick forces re-read of localStorage guilds
  }, [character.guildIds, character.id, character.totalXP, storeTick]);

  const content = (
    <section className="space-y-6 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
      {onBack ? <ScreenBackHeader title="Guilds" onBack={onBack} /> : null}

      <header className="cq-screen-header">
        <p className="cq-screen-header__eyebrow">Campus Community</p>
        <h1 className="cq-screen-header__title">Guilds</h1>
        <p className="cq-screen-header__subtitle">
          Team up with classmates, earn bonus XP together, and climb the weekly guild race.
        </p>
      </header>

      {actionToast ? (
        <div className="fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-xl border border-uri-keaney/40 bg-uri-navy/95 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          {actionToast}
        </div>
      ) : null}

      {!hydrated ? (
        <ScreenDataState variant="loading" message="Loading guilds…" compact />
      ) : (
        <>
          {weeklyRace.length > 0 ? (
            <div className="rounded-2xl border border-uri-gold/40 bg-gradient-to-r from-uri-gold/10 to-transparent p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-uri-gold mb-2">
                ⚔️ Guild vs guild (this week)
              </h3>
              <p className="text-[11px] text-cq-muted mb-2">
                #1 guild next Monday: members get +10% XP for the week. Every log adds race points.
              </p>
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
          ) : null}

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

          <div className="rounded-2xl border border-cq-border bg-cq-card p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="font-display font-semibold text-cq-foreground mb-1 flex items-center gap-2">
                  <span aria-hidden>🛡️</span> Your Guilds
                </h2>
                <p className="text-sm text-slate-700">Guilds you have joined on campus.</p>
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

            {joinedGuilds.length === 0 ? (
              <div className="mt-4">
                <ScreenDataState
                  variant="empty"
                  message="You haven't joined a guild yet."
                  detail={
                    canCreateGuild
                      ? "Search above, browse below, or create a guild to get started."
                      : "Search or browse to join a guild. Create unlocks at 300 XP."
                  }
                  compact
                />
              </div>
            ) : (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {joinedGuilds.map((guild) => (
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
            )}
          </div>

          <div className="rounded-2xl border border-cq-border bg-cq-card p-4 sm:p-5">
            <h2 className="font-display font-semibold text-cq-foreground mb-1 flex items-center gap-2">
              <span aria-hidden>🔍</span> Browse Guilds
            </h2>
            <p className="text-sm text-slate-700 mb-4">Discover guilds by interest and join the ones that fit you.</p>

            {browseEmpty ? (
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
            ) : recommendedByInterest.every(({ guilds }) => guilds.length === 0) ? (
              <ScreenDataState
                variant="empty"
                message="You're in every available guild."
                detail="Create a new guild or wait for more to appear on campus."
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
                  ) : null,
                )}
              </div>
            )}
          </div>
        </>
      )}

      {showCreateGuild ? (
        <CreateGuildModal
          characterId={character.id}
          onClose={() => setShowCreateGuild(false)}
          onCreated={refresh}
        />
      ) : null}
      {viewGuild ? (
        <ViewGuildModal
          guild={viewGuild}
          currentUserId={character.id}
          onLeave={handleLeaveGuild}
          onClose={() => setViewGuild(null)}
          onDeleted={refresh}
          onUpdated={() => {
            refresh();
            setViewGuild((g) => (g ? getGuildById(g.id) ?? g : null));
          }}
        />
      ) : null}
    </section>
  );

  if (onBack) {
    return (
      <MobileSwipeBackSurface onBack={onBack} className="min-h-0">
        {content}
      </MobileSwipeBackSurface>
    );
  }

  return content;
}
