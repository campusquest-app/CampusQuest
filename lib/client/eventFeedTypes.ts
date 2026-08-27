export type CampusEventItem = {
  id: string;
  title: string;
  description: string;
  category: string;
  location: string;
  startsAt: string;
  endsAt: string | null;
  isPaid: boolean;
  ticketLink?: string | null;
  hostType?: "user" | "organization";
  hostOrganization: { id: string; name: string; logo_url: string | null } | null;
  hostProfile?: { id: string; username: string; displayName: string } | null;
  rsvpCount: number;
  myRsvpStatus: "going" | "interested" | "not_going" | null;
  isCancelled: boolean;
  source?: string;
  sourceType?: string;
};

export type ExternalFeedEventItem = {
  id: string;
  source: string;
  sourceType?: string | null;
  title: string;
  description: string;
  category: string;
  location: string | null;
  venueName: string | null;
  address: string | null;
  startsAt: string | null;
  endsAt: string | null;
  organizationName: string | null;
  organizationId?: string | null;
  imageUrl: string | null;
  eventUrl: string | null;
  ticketUrl?: string | null;
  broadcastUrl?: string | null;
  rsvpUrl?: string | null;
  tags: string[];
  sport?: string | null;
  opponent?: string | null;
  homeAway?: string | null;
  score?: string | null;
  liveStatus?: string | null;
  cqRsvpEnabled?: boolean;
  isCancelled?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  rsvpCount?: number;
  myRsvpStatus: "going" | "interested" | "not_going" | null;
  imported: true;
};

export type FeedEvent =
  | { kind: "campus"; event: CampusEventItem }
  | { kind: "external"; event: ExternalFeedEventItem };

export function campusEventHostLabel(event: CampusEventItem): string {
  if (event.hostOrganization) return event.hostOrganization.name;
  if (event.hostProfile?.displayName?.trim()) return event.hostProfile.displayName.trim();
  if (event.hostProfile?.username) return event.hostProfile.username;
  return "CampusQuest community";
}

export function feedEventLocationText(item: FeedEvent): string {
  if (item.kind === "campus") return item.event.location ?? "";
  return [item.event.venueName, item.event.location, item.event.address].filter(Boolean).join(" ");
}

export function feedEventHostName(item: FeedEvent): string {
  return item.kind === "campus" ? campusEventHostLabel(item.event) : item.event.organizationName ?? "";
}
