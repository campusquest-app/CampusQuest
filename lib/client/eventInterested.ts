export type CampusRsvpStatus = "going" | "interested" | "not_going" | null;

export function isInterestedRsvp(status: CampusRsvpStatus): boolean {
  return status === "interested";
}

/** Campus Interested reuses event_rsvps. Toggle off writes not_going — same existing statuses. */
export function nextInterestedRsvpStatus(current: CampusRsvpStatus): "interested" | "not_going" {
  return current === "interested" ? "not_going" : "interested";
}

export function applyCampusRsvpStatus<T extends { id: string; myRsvpStatus: CampusRsvpStatus }>(
  events: T[],
  eventId: string,
  status: CampusRsvpStatus,
): T[] {
  return events.map((event) => (event.id === eventId ? { ...event, myRsvpStatus: status } : event));
}
