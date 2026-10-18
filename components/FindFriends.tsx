"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageCircle, UserCheck } from "lucide-react";
import {
  avatarFromConnectionProfile,
  cancelOutgoingConnectionRequest,
  fetchConnections,
  fetchIncomingConnectionRequests,
  fetchOutgoingConnectionRequests,
  formatRequestSentAt,
  removeConnection,
  respondToConnectionRequest,
  type ConnectionItem,
  type ConnectionRequestItem,
} from "@/lib/client/socialConnectionsClient";
import { requestConnection } from "@/lib/client/connectionRequestActions";
import { emitSocialSync, subscribeSocialSync } from "@/lib/client/socialSync";
import { useUserSearchSuggestions } from "@/lib/client/useUserSearchSuggestions";
import { avatarFromUserSearchResult, type UserSearchResult } from "@/lib/client/userSearchClient";
import {
  connectionIdSets,
  defaultPeopleTab,
  discoverConnectionPreview,
  formatConnectionsHeader,
  peopleContentMode,
  peopleFollowActionLabel,
  resolvePeopleRelationshipState,
  shouldShowDiscoverSeeAll,
  type PeopleRelationshipState,
  type PeopleTab,
} from "@/lib/client/peopleDiscoveryUi";
import type { Character } from "@/lib/types";
import { PeopleRow } from "@/components/people/PeopleRow";
import { PeopleSearchField } from "@/components/people/PeopleSearchField";
import { PeopleSegmentedNav } from "@/components/people/PeopleSegmentedNav";
import { ScreenDataState } from "@/components/ui/ScreenDataState";

type DmTarget = { userId: string; username: string; name: string; avatar: string };

export function FindFriends({
  character: _character,
  onRefresh,
  onOpenDm,
  onViewProfile,
}: {
  character: Character;
  onRefresh?: () => void;
  onOpenDm?: (other: DmTarget) => void;
  onViewProfile?: (userId: string) => void;
}) {
  const [tab, setTab] = useState<PeopleTab>(defaultPeopleTab);
  const [query, setQuery] = useState("");
  const [incoming, setIncoming] = useState<ConnectionRequestItem[]>([]);
  const [outgoing, setOutgoing] = useState<ConnectionRequestItem[]>([]);
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [followingCount, setFollowingCount] = useState(0);
  const [socialLoading, setSocialLoading] = useState(true);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [optimisticRequestedUserIds, setOptimisticRequestedUserIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [outgoingOpen, setOutgoingOpen] = useState(false);

  const search = useUserSearchSuggestions(query);
  const contentMode = peopleContentMode(query);
  const idSets = useMemo(
    () => connectionIdSets({ connections, outgoing, incoming }),
    [connections, outgoing, incoming],
  );

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
      setFollowingCount(connectionPayload.followingCount);
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
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshSocial();
    };
    document.addEventListener("visibilitychange", onVisible);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshSocial();
    }, 60_000);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(intervalId);
    };
  }, [refreshSocial]);

  useEffect(() => {
    if (!actionToast) return undefined;
    const tid = window.setTimeout(() => setActionToast(null), 2800);
    return () => window.clearTimeout(tid);
  }, [actionToast]);

  function relationshipFor(userId: string, username: string): PeopleRelationshipState {
    return resolvePeopleRelationshipState({
      userId,
      username,
      ...idSets,
      optimisticRequestedUserIds,
    });
  }

  async function handleFollowAction(row: {
    userId: string;
    username: string;
    displayName: string;
  }) {
    if (busyId) return;
    const state = relationshipFor(row.userId, row.username);
    if (state === "following") return;
    setBusyId(row.userId);
    setSocialError(null);
    try {
      if (state === "requested") {
        const outgoingRequest = outgoing.find((req) => req.userId === row.userId);
        if (outgoingRequest) {
          await cancelOutgoingConnectionRequest(outgoingRequest.requestId);
          setActionToast("Request cancelled");
        }
        setOptimisticRequestedUserIds((prev) => {
          const next = new Set(prev);
          next.delete(row.userId);
          return next;
        });
      } else if (state === "follow_back") {
        const incomingRequest = incoming.find((req) => req.userId === row.userId);
        if (!incomingRequest) {
          setSocialError("This follow request is no longer available.");
          return;
        }
        await respondToConnectionRequest(incomingRequest.requestId, "accept");
        setActionToast(`You are now following ${row.username}`);
      } else {
        const outcome = await requestConnection({
          username: row.username,
          connections,
          outgoing,
        });
        if (outcome.status === "sent" || outcome.status === "already_sent") {
          setOptimisticRequestedUserIds((prev) => new Set(prev).add(row.userId));
        }
        setActionToast(outcome.toastMessage);
      }
      await refreshSocial();
      emitSocialSync({ source: "friends" });
    } catch (error) {
      setOptimisticRequestedUserIds((prev) => {
        const next = new Set(prev);
        next.delete(row.userId);
        return next;
      });
      setSocialError(error instanceof Error ? error.message : "Could not update connection.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleAccept(request: ConnectionRequestItem) {
    if (busyId) return;
    setBusyId(request.requestId);
    setSocialError(null);
    try {
      await respondToConnectionRequest(request.requestId, "accept");
      setActionToast(`You are now following ${request.username}`);
      await refreshSocial();
      emitSocialSync({ source: "friends" });
    } catch (error) {
      setSocialError(error instanceof Error ? error.message : "Could not accept request.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDecline(requestId: string) {
    if (busyId) return;
    setBusyId(requestId);
    setSocialError(null);
    try {
      await respondToConnectionRequest(requestId, "decline");
      setActionToast("Follow request declined");
      await refreshSocial();
      emitSocialSync({ source: "friends" });
    } catch (error) {
      setSocialError(error instanceof Error ? error.message : "Could not decline request.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleUnsend(requestId: string) {
    if (busyId) return;
    setBusyId(requestId);
    setSocialError(null);
    try {
      await cancelOutgoingConnectionRequest(requestId);
      await refreshSocial();
      emitSocialSync({ source: "friends" });
    } catch (error) {
      setSocialError(error instanceof Error ? error.message : "Could not unsend request.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleUnfollow(connection: ConnectionItem) {
    if (busyId) return;
    const confirmed = window.confirm(`Unfollow @${connection.username}? You will lose this connection.`);
    if (!confirmed) return;
    setBusyId(connection.connectionId);
    setSocialError(null);
    try {
      await removeConnection(connection.connectionId);
      setActionToast(`Unfollowed @${connection.username}`);
      await refreshSocial();
      emitSocialSync({ source: "friends" });
    } catch (error) {
      setSocialError(error instanceof Error ? error.message : "Could not unfollow.");
    } finally {
      setBusyId(null);
    }
  }

  function openProfile(userId: string) {
    onViewProfile?.(userId);
  }

  function openMessage(row: { userId: string; username: string; displayName: string; avatar: string }) {
    onOpenDm?.({
      userId: row.userId,
      username: row.username,
      name: row.displayName,
      avatar: row.avatar,
    });
  }

  const discoverPreview = discoverConnectionPreview(connections);

  return (
    <section className="cq-people-page cq-tab-shell">
      <header className="cq-people-header">
        <h1 className="cq-people-title">Find People</h1>
        <p className="cq-people-subtitle">Connect with your campus community.</p>
      </header>

      {actionToast ? (
        <div className="cq-people-toast" role="status">
          {actionToast}
        </div>
      ) : null}

      <PeopleSearchField value={query} onChange={setQuery} />

      <PeopleSegmentedNav active={tab} incomingCount={incoming.length} onChange={setTab} />

      {socialError && contentMode === "tab" ? (
        <ScreenDataState
          variant="error"
          message="Could not load connections."
          detail={socialError}
          onRetry={() => void refreshSocial()}
          compact
        />
      ) : null}

      {contentMode === "search" ? (
        <SearchResults
          loading={search.loading}
          searched={search.searched}
          error={search.error}
          results={search.results}
          busyId={busyId}
          relationshipFor={relationshipFor}
          onFollow={(row) => void handleFollowAction(row)}
          onOpenProfile={openProfile}
        />
      ) : tab === "discover" ? (
        <DiscoverPanel
          loading={socialLoading}
          preview={discoverPreview}
          connectionCount={connections.length}
          busyId={busyId}
          onSeeAll={() => setTab("following")}
          onOpenProfile={openProfile}
          onMessage={onOpenDm ? openMessage : undefined}
          onUnfollow={(row) => void handleUnfollow(row)}
        />
      ) : tab === "requests" ? (
        <RequestsPanel
          loading={socialLoading}
          incoming={incoming}
          outgoing={outgoing}
          outgoingOpen={outgoingOpen}
          onToggleOutgoing={() => setOutgoingOpen((open) => !open)}
          busyId={busyId}
          onAccept={(req) => void handleAccept(req)}
          onDecline={(id) => void handleDecline(id)}
          onUnsend={(id) => void handleUnsend(id)}
          onOpenProfile={openProfile}
        />
      ) : (
        <FollowingPanel
          loading={socialLoading}
          connections={connections}
          followingCount={followingCount}
          busyId={busyId}
          onOpenProfile={openProfile}
          onMessage={onOpenDm ? openMessage : undefined}
          onUnfollow={(row) => void handleUnfollow(row)}
        />
      )}
    </section>
  );
}

function FollowButton({
  state,
  busy,
  username,
  onClick,
}: {
  state: PeopleRelationshipState;
  busy: boolean;
  username: string;
  onClick: () => void;
}) {
  if (state === "following") {
    return (
      <span className="cq-people-btn cq-people-btn--quiet" aria-label={`Following @${username}`}>
        Following
      </span>
    );
  }
  const requested = state === "requested";
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={`cq-people-btn ${requested ? "cq-people-btn--quiet" : "cq-people-btn--primary"}`}
      aria-label={
        requested
          ? `Cancel follow request to @${username}`
          : `${peopleFollowActionLabel(state)} @${username}`
      }
    >
      {busy ? "…" : peopleFollowActionLabel(state)}
    </button>
  );
}

function MessageIconButton({
  username,
  onClick,
}: {
  username: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="cq-people-icon-btn"
      onClick={onClick}
      aria-label={`Message @${username}`}
    >
      <MessageCircle className="h-5 w-5" aria-hidden strokeWidth={2} />
    </button>
  );
}

function UnfollowButton({
  username,
  busy,
  onClick,
}: {
  username: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="cq-people-icon-btn"
      disabled={busy}
      onClick={onClick}
      aria-label={`Unfollow @${username}`}
      title="Unfollow"
    >
      <UserCheck className="h-5 w-5" aria-hidden strokeWidth={2} />
    </button>
  );
}

function SearchResults({
  loading,
  searched,
  error,
  results,
  busyId,
  relationshipFor,
  onFollow,
  onOpenProfile,
}: {
  loading: boolean;
  searched: boolean;
  error: string | null;
  results: UserSearchResult[];
  busyId: string | null;
  relationshipFor: (userId: string, username: string) => PeopleRelationshipState;
  onFollow: (row: UserSearchResult) => void;
  onOpenProfile: (userId: string) => void;
}) {
  if (error) {
    return (
      <ScreenDataState variant="error" message="Could not search students." detail={error} compact />
    );
  }
  if (loading) {
    return (
      <ul className="cq-people-list" aria-busy="true" aria-label="Search results">
        <PeopleRow skeleton displayName="" username="" />
        <PeopleRow skeleton displayName="" username="" />
        <PeopleRow skeleton displayName="" username="" />
      </ul>
    );
  }
  if (searched && results.length === 0) {
    return (
      <div className="cq-people-empty">
        <p>No students match that search.</p>
      </div>
    );
  }
  return (
    <ul className="cq-people-list" aria-label="Search results">
      {results.map((row) => {
        const state = relationshipFor(row.userId, row.username);
        return (
          <PeopleRow
            key={row.userId}
            avatar={avatarFromUserSearchResult(row)}
            displayName={row.displayName}
            username={row.username}
            subtitle={
              row.mutualFriendsCount > 0
                ? `${row.mutualFriendsCount} mutual connection${row.mutualFriendsCount === 1 ? "" : "s"}`
                : null
            }
            onOpenProfile={() => onOpenProfile(row.userId)}
            actions={
              <FollowButton
                state={state}
                busy={busyId === row.userId}
                username={row.username}
                onClick={() => onFollow(row)}
              />
            }
          />
        );
      })}
    </ul>
  );
}

function DiscoverPanel({
  loading,
  preview,
  connectionCount,
  busyId,
  onSeeAll,
  onOpenProfile,
  onMessage,
  onUnfollow,
}: {
  loading: boolean;
  preview: ConnectionItem[];
  connectionCount: number;
  busyId: string | null;
  onSeeAll: () => void;
  onOpenProfile: (userId: string) => void;
  onMessage?: (row: ConnectionItem & { avatar: string }) => void;
  onUnfollow: (row: ConnectionItem) => void;
}) {
  if (loading && preview.length === 0) {
    return (
      <ul className="cq-people-list" aria-busy="true" aria-label="Discover">
        <PeopleRow skeleton displayName="" username="" />
        <PeopleRow skeleton displayName="" username="" />
      </ul>
    );
  }

  return (
    <div id="cq-people-panel-discover" role="tabpanel" aria-labelledby="cq-people-tab-discover">
      <div className="cq-people-empty cq-people-empty--discover">
        <p>Search for classmates by name or username to follow them.</p>
      </div>
      {preview.length > 0 ? (
        <div className="cq-people-preview">
          <div className="cq-people-section-head">
            <h2 className="cq-people-section-title">Your Connections</h2>
            {shouldShowDiscoverSeeAll(connectionCount) ? (
              <button type="button" className="cq-people-see-all" onClick={onSeeAll}>
                See all
              </button>
            ) : null}
          </div>
          <ul className="cq-people-list">
            {preview.map((row) => {
              const avatar = avatarFromConnectionProfile(row);
              return (
                <PeopleRow
                  key={row.userId}
                  avatar={avatar}
                  displayName={row.displayName}
                  username={row.username}
                  onOpenProfile={() => onOpenProfile(row.userId)}
                  actions={
                    <>
                      {onMessage ? (
                        <MessageIconButton
                          username={row.username}
                          onClick={() => onMessage({ ...row, avatar })}
                        />
                      ) : null}
                      <UnfollowButton
                        username={row.username}
                        busy={busyId === row.connectionId}
                        onClick={() => onUnfollow(row)}
                      />
                    </>
                  }
                />
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function RequestsPanel({
  loading,
  incoming,
  outgoing,
  outgoingOpen,
  onToggleOutgoing,
  busyId,
  onAccept,
  onDecline,
  onUnsend,
  onOpenProfile,
}: {
  loading: boolean;
  incoming: ConnectionRequestItem[];
  outgoing: ConnectionRequestItem[];
  outgoingOpen: boolean;
  onToggleOutgoing: () => void;
  busyId: string | null;
  onAccept: (request: ConnectionRequestItem) => void;
  onDecline: (requestId: string) => void;
  onUnsend: (requestId: string) => void;
  onOpenProfile: (userId: string) => void;
}) {
  if (loading && incoming.length === 0 && outgoing.length === 0) {
    return (
      <ul className="cq-people-list" aria-busy="true" aria-label="Requests">
        <PeopleRow skeleton displayName="" username="" />
        <PeopleRow skeleton displayName="" username="" />
      </ul>
    );
  }

  return (
    <div id="cq-people-panel-requests" role="tabpanel" aria-labelledby="cq-people-tab-requests">
      {incoming.length === 0 ? (
        <div className="cq-people-empty">
          <p>No incoming requests.</p>
        </div>
      ) : (
        <ul className="cq-people-list" aria-label="Incoming requests">
          {incoming.map((req) => (
            <PeopleRow
              key={req.requestId}
              avatar={avatarFromConnectionProfile(req)}
              displayName={req.displayName}
              username={req.username}
              subtitle={formatRequestSentAt(req.createdAt)}
              onOpenProfile={() => onOpenProfile(req.userId)}
              actions={
                <>
                  <button
                    type="button"
                    disabled={busyId === req.requestId}
                    onClick={() => onAccept(req)}
                    className="cq-people-btn cq-people-btn--primary"
                  >
                    {busyId === req.requestId ? "…" : "Accept"}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === req.requestId}
                    onClick={() => onDecline(req.requestId)}
                    className="cq-people-btn cq-people-btn--ghost"
                  >
                    Decline
                  </button>
                </>
              }
            />
          ))}
        </ul>
      )}

      {outgoing.length > 0 ? (
        <div className="cq-people-outgoing">
          <button
            type="button"
            className="cq-people-outgoing-toggle"
            aria-expanded={outgoingOpen}
            onClick={onToggleOutgoing}
          >
            Sent ({outgoing.length})
          </button>
          {outgoingOpen ? (
            <ul className="cq-people-list" aria-label="Outgoing requests">
              {outgoing.map((req) => (
                <PeopleRow
                  key={req.requestId}
                  avatar={avatarFromConnectionProfile(req)}
                  displayName={req.displayName}
                  username={req.username}
                  onOpenProfile={() => onOpenProfile(req.userId)}
                  actions={
                    <button
                      type="button"
                      disabled={busyId === req.requestId}
                      onClick={() => onUnsend(req.requestId)}
                      className="cq-people-btn cq-people-btn--ghost"
                    >
                      Unsend
                    </button>
                  }
                />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FollowingPanel({
  loading,
  connections,
  followingCount,
  busyId,
  onOpenProfile,
  onMessage,
  onUnfollow,
}: {
  loading: boolean;
  connections: ConnectionItem[];
  followingCount: number;
  busyId: string | null;
  onOpenProfile: (userId: string) => void;
  onMessage?: (row: ConnectionItem & { avatar: string }) => void;
  onUnfollow: (row: ConnectionItem) => void;
}) {
  return (
    <div id="cq-people-panel-following" role="tabpanel" aria-labelledby="cq-people-tab-following">
      <h2 className="cq-people-section-title cq-people-section-title--page">
        {formatConnectionsHeader(followingCount)}
      </h2>
      {loading && connections.length === 0 ? (
        <ul className="cq-people-list" aria-busy="true" aria-label="Following">
          <PeopleRow skeleton displayName="" username="" />
          <PeopleRow skeleton displayName="" username="" />
          <PeopleRow skeleton displayName="" username="" />
        </ul>
      ) : connections.length === 0 ? (
        <div className="cq-people-empty">
          <p>No connections yet. Search to find classmates.</p>
        </div>
      ) : (
        <ul className="cq-people-list" aria-label="Your connections">
          {connections.map((row) => {
            const avatar = avatarFromConnectionProfile(row);
            return (
              <PeopleRow
                key={row.userId}
                avatar={avatar}
                displayName={row.displayName}
                username={row.username}
                onOpenProfile={() => onOpenProfile(row.userId)}
                actions={
                  <>
                    {onMessage ? (
                      <MessageIconButton
                        username={row.username}
                        onClick={() => onMessage({ ...row, avatar })}
                      />
                    ) : null}
                    <UnfollowButton
                      username={row.username}
                      busy={busyId === row.connectionId}
                      onClick={() => onUnfollow(row)}
                    />
                  </>
                }
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
