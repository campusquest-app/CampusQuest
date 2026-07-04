export type MarkerActivityState = "idle" | "active" | "hot" | "selected";

export type LocationActivityCounts = {
  activeQuestCount: number;
  activeEventCount: number;
  activeMemoryCount: number;
  activeQrCount: number;
};

export function sumLocationActivityCounts(counts: LocationActivityCounts): number {
  return (
    counts.activeQuestCount +
    counts.activeEventCount +
    counts.activeMemoryCount +
    counts.activeQrCount
  );
}

export function landmarkActivityCounts(input: {
  activeQuests: number;
  upcomingEvents: number;
  activeMomentCount: number;
  mapContent: {
    quests: unknown[];
    events: unknown[];
    qrCodes: unknown[];
  } | null;
}): LocationActivityCounts {
  const questItems = Math.max(input.activeQuests, input.mapContent?.quests.length ?? 0);
  const eventItems = Math.max(input.upcomingEvents, input.mapContent?.events.length ?? 0);
  const qrItems = input.mapContent?.qrCodes.length ?? 0;

  return {
    activeQuestCount: questItems > 0 ? 1 : 0,
    activeEventCount: eventItems > 0 ? 1 : 0,
    activeMemoryCount: input.activeMomentCount > 0 ? input.activeMomentCount : 0,
    activeQrCount: qrItems > 0 ? 1 : 0,
  };
}

export function groupActivityCounts(group: {
  quests: unknown[];
  events: unknown[];
  qrCodes: unknown[];
}): LocationActivityCounts {
  return {
    activeQuestCount: group.quests.length > 0 ? 1 : 0,
    activeEventCount: group.events.length > 0 ? 1 : 0,
    activeMemoryCount: 0,
    activeQrCount: group.qrCodes.length > 0 ? 1 : 0,
  };
}

/**
 * Visual activity tier for map markers.
 * Uses live quest / event / memory / QR counts — never hardcoded.
 */
export function getLocationActivityState(
  counts: LocationActivityCounts,
  selected: boolean,
): { state: MarkerActivityState; activityCount: number } {
  const activityCount = sumLocationActivityCounts(counts);

  if (selected) {
    return { state: "selected", activityCount };
  }
  if (activityCount >= 2 || counts.activeMemoryCount >= 3) {
    return { state: "hot", activityCount };
  }
  if (activityCount === 1) {
    return { state: "active", activityCount };
  }
  return { state: "idle", activityCount: 0 };
}

export function markerZIndexForActivity(
  state: MarkerActivityState,
  isEditorSelected: boolean,
): number {
  if (isEditorSelected) return 40;
  switch (state) {
    case "selected":
      return 35;
    case "hot":
      return 28;
    case "active":
      return 24;
    default:
      return 20;
  }
}
