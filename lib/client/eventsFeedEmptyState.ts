export function eventsEmptyStateCopy(input: {
  hasLoadedEvents: boolean;
  isAdmin: boolean;
}): { title: string; detail: string } {
  if (input.hasLoadedEvents) {
    return {
      title: "No events match your filters.",
      detail: "Try clearing search or date filters to see more CampusQuest and URInvolved events.",
    };
  }
  return {
    title: "No upcoming events right now.",
    detail: input.isAdmin
      ? "If this looks wrong, check URInvolved sync diagnostics in admin."
      : "When campus events are published, they will show up here.",
  };
}

export const EVENTS_STALE_NOTICE = "Events may be temporarily out of date.";
