/**
 * Pure Find People UI helpers. Tabs, search overlay, and relationship
 * labels stay in sync with the existing student_connections model.
 */

export const PEOPLE_TABS = ["discover", "requests", "following"] as const;
export type PeopleTab = (typeof PEOPLE_TABS)[number];

export const PEOPLE_DISCOVER_PREVIEW_LIMIT = 4;

export type PeopleRelationshipState = "follow" | "requested" | "following" | "follow_back";

export function isPeopleTab(value: unknown): value is PeopleTab {
  return value === "discover" || value === "requests" || value === "following";
}

export function defaultPeopleTab(): PeopleTab {
  return "discover";
}

/** Incoming badge uses the real incoming count only — never invented. */
export function incomingRequestBadgeCount(incomingCount: number): number {
  if (!Number.isFinite(incomingCount) || incomingCount <= 0) return 0;
  return Math.floor(incomingCount);
}

export function formatIncomingRequestBadge(incomingCount: number): string | null {
  const count = incomingRequestBadgeCount(incomingCount);
  return count > 0 ? String(count) : null;
}

export function isPeopleSearchActive(query: string): boolean {
  return query.trim().length > 0;
}

/** Search results replace tab content; clearing search restores this tab. */
export function peopleContentMode(query: string): "search" | "tab" {
  return isPeopleSearchActive(query) ? "search" : "tab";
}

export function discoverConnectionPreview<T>(connections: readonly T[]): T[] {
  return connections.slice(0, PEOPLE_DISCOVER_PREVIEW_LIMIT);
}

export function shouldShowDiscoverSeeAll(connectionCount: number): boolean {
  return connectionCount > 0;
}

export function formatConnectionsHeader(count: number): string {
  const safe = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return `Your Connections (${safe})`;
}

export function resolvePeopleRelationshipState(args: {
  userId: string;
  username: string;
  connectedUserIds: ReadonlySet<string>;
  outgoingUserIds: ReadonlySet<string>;
  incomingUserIds: ReadonlySet<string>;
  optimisticRequestedUserIds?: ReadonlySet<string>;
}): PeopleRelationshipState {
  if (args.connectedUserIds.has(args.userId)) return "following";
  if (args.optimisticRequestedUserIds?.has(args.userId)) return "requested";
  if (args.outgoingUserIds.has(args.userId)) return "requested";
  if (args.incomingUserIds.has(args.userId)) return "follow_back";
  return "follow";
}

export function peopleFollowActionLabel(state: PeopleRelationshipState): string {
  switch (state) {
    case "follow_back":
      return "Follow Back";
    case "requested":
      return "Requested";
    case "following":
      return "Following";
    default:
      return "Follow";
  }
}

export function connectionIdSets(args: {
  connections: ReadonlyArray<{ userId: string }>;
  outgoing: ReadonlyArray<{ userId: string }>;
  incoming: ReadonlyArray<{ userId: string }>;
}): {
  connectedUserIds: Set<string>;
  outgoingUserIds: Set<string>;
  incomingUserIds: Set<string>;
} {
  return {
    connectedUserIds: new Set(args.connections.map((row) => row.userId)),
    outgoingUserIds: new Set(args.outgoing.map((row) => row.userId)),
    incomingUserIds: new Set(args.incoming.map((row) => row.userId)),
  };
}
