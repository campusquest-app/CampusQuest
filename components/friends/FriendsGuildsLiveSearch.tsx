"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  avatarFromPeopleSearchResult,
  isLiveSearchQueryActive,
  joinGuildRemote,
  searchGuildsLive,
  searchPeopleLive,
  type GuildSearchResult,
  type PeopleSearchResult,
} from "@/lib/client/friendsGuildsSearchClient";
import {
  respondToConnectionRequest,
  type ConnectionItem,
  type ConnectionRequestItem,
} from "@/lib/client/socialConnectionsClient";
import { requestConnection } from "@/lib/client/connectionRequestActions";
import { hasRequestedInvite, joinGuild as joinLocalGuild } from "@/lib/guildStore";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import { GuildEmblem } from "@/components/guild/GuildEmblem";
import type { Character, GuildInterest } from "@/lib/types";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LEN = 2;

type PeopleConnectionState = "follow" | "requested" | "friends" | "follow_back";

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function resolvePeopleConnectionState(args: {
  userId: string;
  username: string;
  connections: ConnectionItem[];
  outgoing: ConnectionRequestItem[];
  incoming: ConnectionRequestItem[];
  optimisticRequestedUserIds: Set<string>;
}): PeopleConnectionState {
  const { userId, username, connections, outgoing, incoming, optimisticRequestedUserIds } = args;
  const normalized = username.trim().toLowerCase();

  if (connections.some((row) => row.userId === userId)) return "friends";
  if (optimisticRequestedUserIds.has(userId)) return "requested";
  if (outgoing.some((row) => row.userId === userId || row.username.trim().toLowerCase() === normalized)) {
    return "requested";
  }
  if (incoming.some((row) => row.userId === userId || row.username.trim().toLowerCase() === normalized)) {
    return "follow_back";
  }
  return "follow";
}

function PeopleConnectionButton({
  state,
  disabled,
  onClick,
}: {
  state: PeopleConnectionState;
  disabled?: boolean;
  onClick: () => void;
}) {
  if (state === "friends") {
    return (
      <span className="cq-live-search-action cq-live-search-action--muted shrink-0" aria-live="polite">
        Friends
      </span>
    );
  }

  if (state === "requested") {
    return (
      <span className="cq-live-search-action cq-live-search-action--muted shrink-0" aria-live="polite">
        Requested
      </span>
    );
  }

  const label = state === "follow_back" ? "Follow Back" : "Follow";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="cq-live-search-action cq-live-search-action--primary shrink-0 touch-manipulation disabled:opacity-60"
    >
      {disabled ? "..." : label}
    </button>
  );
}

function GuildJoinButton({
  joined,
  requested,
  disabled,
  onClick,
}: {
  joined: boolean;
  requested: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  if (joined) {
    return (
      <span className="cq-live-search-action cq-live-search-action--muted shrink-0" aria-live="polite">
        Joined
      </span>
    );
  }
  if (requested) {
    return (
      <span className="cq-live-search-action cq-live-search-action--muted shrink-0" aria-live="polite">
        Requested
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="cq-live-search-action cq-live-search-action--primary shrink-0 touch-manipulation disabled:opacity-60"
    >
      {disabled ? "..." : "Join"}
    </button>
  );
}

export function PeopleLiveSearchField({
  connections,
  outgoing,
  incoming,
  onRefresh,
  onViewProfile,
  onToast,
  onError,
  onClearError,
}: {
  connections: ConnectionItem[];
  outgoing: ConnectionRequestItem[];
  incoming: ConnectionRequestItem[];
  onRefresh: () => Promise<void>;
  onViewProfile?: (userId: string) => void;
  onToast: (message: string) => void;
  onError: (message: string) => void;
  onClearError: () => void;
}) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, DEBOUNCE_MS);
  const [results, setResults] = useState<PeopleSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [optimisticRequestedUserIds, setOptimisticRequestedUserIds] = useState<Set<string>>(() => new Set());

  const showPanel = isLiveSearchQueryActive(query);
  const awaitingDebounce = showPanel && query.trim() !== debouncedQuery.trim();
  const showLoading = loading || awaitingDebounce;

  useEffect(() => {
    const active = isLiveSearchQueryActive(debouncedQuery);
    if (!active) {
      setResults([]);
      setLoading(false);
      setSearched(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setSearched(false);

    void searchPeopleLive(debouncedQuery)
      .then((rows) => {
        if (cancelled) return;
        setResults(rows);
        setSearched(true);
      })
      .catch((error) => {
        if (cancelled) return;
        setResults([]);
        setSearched(true);
        onError(error instanceof Error ? error.message : "Could not search people.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, onError]);

  const handlePeopleAction = useCallback(
    async (row: PeopleSearchResult, connectionState: PeopleConnectionState) => {
      setActionUserId(row.userId);
      onClearError();
      try {
        if (connectionState === "follow_back") {
          const incomingRequest = incoming.find((req) => req.userId === row.userId);
          if (!incomingRequest) {
            onError("This follow request is no longer available.");
            return;
          }
          await respondToConnectionRequest(incomingRequest.requestId, "accept");
          onToast(`You are now following ${row.username}`);
        } else {
          const outcome = await requestConnection({
            username: row.username,
            connections,
            outgoing,
          });
          if (outcome.status === "sent" || outcome.status === "already_sent") {
            setOptimisticRequestedUserIds((prev) => new Set(prev).add(row.userId));
          }
          onToast(outcome.toastMessage);
        }
        await onRefresh();
      } catch (error) {
        onError(
          error instanceof Error
            ? error.message.replace(/^Backend request failed:[^.]*\.\s*/i, "")
            : "Could not update connection.",
        );
      } finally {
        setActionUserId(null);
      }
    },
    [connections, incoming, onClearError, onError, onRefresh, onToast, outgoing],
  );

  return (
    <div className="cq-live-search">
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onClearError();
        }}
        placeholder="Search by name or username…"
        autoComplete="off"
        spellCheck={false}
        className="cq-search-input w-full px-3 py-2.5 rounded-xl focus:outline-none"
        aria-label="Search people"
        aria-expanded={showPanel}
        aria-controls="people-live-search-results"
      />

      {showPanel ? (
        <div id="people-live-search-results" className="cq-live-search-panel" role="listbox" aria-label="People search results">
          {showLoading ? (
            <p className="cq-live-search-message">Searching…</p>
          ) : searched && results.length === 0 ? (
            <p className="cq-live-search-message">No users found.</p>
          ) : (
            <ul className="cq-live-search-list">
              {results.map((row) => {
                const connectionState = resolvePeopleConnectionState({
                  userId: row.userId,
                  username: row.username,
                  connections,
                  outgoing,
                  incoming,
                  optimisticRequestedUserIds,
                });
                const profileLink = onViewProfile ? (
                  <button
                    type="button"
                    onClick={() => onViewProfile(row.userId)}
                    className="cq-live-search-row-main touch-manipulation"
                  >
                    <div className="cq-avatar-slot h-10 w-10 border border-white/10">
                      <AvatarDisplay avatar={avatarFromPeopleSearchResult(row)} fitParent size={40} />
                    </div>
                    <div className="min-w-0 flex-1 text-left">
                      <p className="truncate text-sm font-semibold text-white">{row.displayName}</p>
                      <p className="truncate text-xs text-uri-keaney/90">@{row.username}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-white/55">
                        <span>Lv.{row.level}</span>
                        {row.mutualFriendsCount > 0 ? (
                          <span>
                            {row.mutualFriendsCount} mutual connection{row.mutualFriendsCount === 1 ? "" : "s"}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                ) : (
                  <div className="cq-live-search-row-main">
                    <div className="cq-avatar-slot h-10 w-10 border border-white/10">
                      <AvatarDisplay avatar={avatarFromPeopleSearchResult(row)} fitParent size={40} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{row.displayName}</p>
                      <p className="truncate text-xs text-uri-keaney/90">@{row.username}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-white/55">
                        <span>Lv.{row.level}</span>
                        {row.mutualFriendsCount > 0 ? (
                          <span>
                            {row.mutualFriendsCount} mutual connection{row.mutualFriendsCount === 1 ? "" : "s"}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );

                return (
                  <li key={row.userId} className="cq-live-search-row" role="option">
                    {profileLink}
                    <PeopleConnectionButton
                      state={connectionState}
                      disabled={
                        actionUserId === row.userId ||
                        connectionState === "friends" ||
                        connectionState === "requested"
                      }
                      onClick={() => void handlePeopleAction(row, connectionState)}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function categoryLabelToInterest(label: string | null): GuildInterest {
  switch ((label ?? "").toLowerCase()) {
    case "fitness":
      return "fitness";
    case "networking":
      return "networking";
    case "clubs":
      return "clubs";
    default:
      return "study";
  }
}

export function GuildLiveSearchField({
  character,
  onRefresh,
  onViewGuild,
  onToast,
  onError,
  onClearError,
}: {
  character: Character;
  onRefresh: () => void;
  onViewGuild?: (guildId: string) => void;
  onToast: (message: string) => void;
  onError: (message: string) => void;
  onClearError: () => void;
}) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, DEBOUNCE_MS);
  const [results, setResults] = useState<GuildSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [actionGuildId, setActionGuildId] = useState<string | null>(null);
  const [optimisticJoinedIds, setOptimisticJoinedIds] = useState<Set<string>>(() => new Set());

  const userGuildIds = useMemo(
    () => new Set([...(character.guildIds ?? []), ...Array.from(optimisticJoinedIds)]),
    [character.guildIds, optimisticJoinedIds],
  );

  const showPanel = isLiveSearchQueryActive(query);
  const awaitingDebounce = showPanel && query.trim() !== debouncedQuery.trim();
  const showLoading = loading || awaitingDebounce;

  useEffect(() => {
    const active = isLiveSearchQueryActive(debouncedQuery);
    if (!active) {
      setResults([]);
      setLoading(false);
      setSearched(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setSearched(false);

    void searchGuildsLive(debouncedQuery)
      .then((rows) => {
        if (cancelled) return;
        setResults(rows);
        setSearched(true);
      })
      .catch((error) => {
        if (cancelled) return;
        setResults([]);
        setSearched(true);
        onError(error instanceof Error ? error.message : "Could not search guilds.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, onError]);

  const handleJoin = useCallback(
    async (row: GuildSearchResult) => {
      setActionGuildId(row.guildId);
      onClearError();
      try {
        if (row.source === "local") {
          joinLocalGuild(character.id, row.guildId);
        } else {
          await joinGuildRemote(row.guildId);
        }
        setOptimisticJoinedIds((prev) => new Set(prev).add(row.guildId));
        onToast(`Joined ${row.name}`);
        onRefresh();
      } catch (error) {
        onError(error instanceof Error ? error.message : "Could not join guild.");
      } finally {
        setActionGuildId(null);
      }
    },
    [character.id, onClearError, onError, onRefresh, onToast],
  );

  return (
    <div className="cq-live-search">
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onClearError();
        }}
        placeholder="e.g. Library, Fitness, Study..."
        autoComplete="off"
        spellCheck={false}
        className="cq-search-input w-full px-3 py-2.5 rounded-xl focus:outline-none"
        aria-label="Search guilds"
        aria-expanded={showPanel}
        aria-controls="guild-live-search-results"
      />

      {showPanel ? (
        <div id="guild-live-search-results" className="cq-live-search-panel" role="listbox" aria-label="Guild search results">
          {showLoading ? (
            <p className="cq-live-search-message">Searching guilds…</p>
          ) : searched && results.length === 0 ? (
            <p className="cq-live-search-message">No guilds found.</p>
          ) : (
            <ul className="cq-live-search-list">
              {results.map((row) => {
                const joined = userGuildIds.has(row.guildId);
                const requested = !joined && hasRequestedInvite(character.id, row.guildId);
                const emblem = row.source === "local" ? (
                  <GuildEmblem
                    interest={categoryLabelToInterest(row.categoryLabel)}
                    crest={row.crest ?? "🛡️"}
                    size="md"
                    className="shrink-0"
                  />
                ) : row.logoUrl ? (
                  <div className="cq-avatar-slot h-10 w-10 border border-white/10 bg-white/5">
                    <img src={row.logoUrl} alt="" className="avatar-display-img" />
                  </div>
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-lg">
                    🛡️
                  </div>
                );

                const profileLink = onViewGuild ? (
                  <button
                    type="button"
                    onClick={() => onViewGuild(row.guildId)}
                    className="cq-live-search-row-main touch-manipulation"
                  >
                    {emblem}
                    <div className="min-w-0 flex-1 text-left">
                      <p className="truncate text-sm font-semibold text-white">{row.name}</p>
                      {row.categoryLabel ? (
                        <p className="truncate text-xs text-uri-keaney/85">{row.categoryLabel}</p>
                      ) : null}
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-white/55">
                        <span>Lv.{row.level}</span>
                        <span>
                          {row.memberCount} member{row.memberCount === 1 ? "" : "s"}
                        </span>
                        {row.totalXp > 0 ? <span>{row.totalXp.toLocaleString()} XP</span> : null}
                      </div>
                    </div>
                  </button>
                ) : (
                  <div className="cq-live-search-row-main">
                    {emblem}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{row.name}</p>
                      {row.categoryLabel ? (
                        <p className="truncate text-xs text-uri-keaney/85">{row.categoryLabel}</p>
                      ) : null}
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-white/55">
                        <span>Lv.{row.level}</span>
                        <span>
                          {row.memberCount} member{row.memberCount === 1 ? "" : "s"}
                        </span>
                        {row.totalXp > 0 ? <span>{row.totalXp.toLocaleString()} XP</span> : null}
                      </div>
                    </div>
                  </div>
                );

                return (
                  <li key={`${row.source}-${row.guildId}`} className="cq-live-search-row" role="option">
                    {profileLink}
                    <GuildJoinButton
                      joined={joined}
                      requested={requested}
                      disabled={actionGuildId === row.guildId || joined || requested}
                      onClick={() => void handleJoin(row)}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

export { MIN_QUERY_LEN, DEBOUNCE_MS };
