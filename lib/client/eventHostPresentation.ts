import { eventSourceLabel } from "@/lib/eventSources/catalog";
import type { FeedEvent } from "@/lib/client/eventFeedTypes";
import { campusEventHostLabel, feedEventHostName } from "@/lib/client/eventFeedTypes";

/** Compact card host truncation (CSS ellipsis is primary; this caps aria/title length). */
export const EVENT_HOST_CARD_MAX_CHARS = 36;

export type EventHostPresentation = {
  /** Raw host name for details / title attributes. Null when no verified host. */
  hostName: string | null;
  /** "Hosted by {name}" for compact cards, or null to omit the line. */
  hostedByLabel: string | null;
  /** Truncated host name for dense cards. */
  compactHostName: string | null;
  /** student_organizations id when a CampusQuest org profile is linked. */
  campusOrganizationId: string | null;
};

/**
 * Reject provider source labels masquerading as organizers (e.g. "URInvolved").
 * Does not invent hosts from titles — only filters empty / source-equivalent strings.
 */
export function isVerifiedEventHostName(
  hostName: string | null | undefined,
  source: string | null | undefined,
): boolean {
  const name = hostName?.trim();
  if (!name) return false;
  const sourceKey = source?.trim().toLowerCase();
  if (sourceKey && name.toLowerCase() === sourceKey) return false;
  const label = eventSourceLabel(source)?.trim();
  if (label && name.toLowerCase() === label.toLowerCase()) return false;
  return true;
}

export function truncateEventHostName(
  hostName: string,
  maxChars: number = EVENT_HOST_CARD_MAX_CHARS,
): string {
  const trimmed = hostName.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const cut = Math.max(1, maxChars - 1);
  return `${trimmed.slice(0, cut).trimEnd()}…`;
}

export function formatHostedByLabel(hostName: string): string {
  return `Hosted by ${hostName.trim()}`;
}

export function feedEventHostPresentation(item: FeedEvent): EventHostPresentation {
  if (item.kind === "campus") {
    const hostName = campusEventHostLabel(item.event);
    const usable = isVerifiedEventHostName(hostName, item.event.sourceType ?? item.event.source);
    if (!usable) {
      return { hostName: null, hostedByLabel: null, compactHostName: null, campusOrganizationId: null };
    }
    return {
      hostName,
      hostedByLabel: formatHostedByLabel(hostName),
      compactHostName: truncateEventHostName(hostName),
      campusOrganizationId: item.event.hostOrganization?.id ?? null,
    };
  }

  const source = item.event.source;
  const hostName = item.event.organizationName?.trim() || null;
  if (!isVerifiedEventHostName(hostName, source)) {
    return { hostName: null, hostedByLabel: null, compactHostName: null, campusOrganizationId: null };
  }
  return {
    hostName,
    hostedByLabel: formatHostedByLabel(hostName!),
    compactHostName: truncateEventHostName(hostName!),
    campusOrganizationId: item.event.hostCampusOrganizationId ?? null,
  };
}

/** Map / pin cards that carry organizationName + source directly. */
export function mapEventHostPresentation(args: {
  organizationName?: string | null;
  source?: string | null;
  organizationId?: string | null;
  hostCampusOrganizationId?: string | null;
}): EventHostPresentation {
  const hostName = args.organizationName?.trim() || null;
  if (!isVerifiedEventHostName(hostName, args.source)) {
    return { hostName: null, hostedByLabel: null, compactHostName: null, campusOrganizationId: null };
  }
  return {
    hostName,
    hostedByLabel: formatHostedByLabel(hostName!),
    compactHostName: truncateEventHostName(hostName!),
    campusOrganizationId: args.hostCampusOrganizationId ?? null,
  };
}

/** Keep search haystack aligned with visible host (never the source chip). */
export function feedEventSearchHostName(item: FeedEvent): string {
  return feedEventHostPresentation(item).hostName ?? feedEventHostName(item);
}
