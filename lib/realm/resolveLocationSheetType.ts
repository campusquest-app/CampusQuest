import type { GroupedMapLocation } from "@/lib/mapLocationGroups";

export type RealmLocationSheetType = "location" | "quest" | "event" | "memory";

export function resolveLocationSheetType(args: {
  activeQuestCount: number;
  activeEventCount: number;
  momentCount: number;
  hasQr?: boolean;
}): RealmLocationSheetType {
  if (args.activeQuestCount > 0 || args.hasQr) return "quest";
  if (args.activeEventCount > 0) return "event";
  if (args.momentCount > 0) return "memory";
  return "location";
}

export function locationSheetTypeLabel(type: RealmLocationSheetType): string {
  switch (type) {
    case "quest":
      return "Quest";
    case "event":
      return "Event";
    case "memory":
      return "Memory";
    default:
      return "Location";
  }
}

export function countEventsToday(content: Pick<GroupedMapLocation, "events">): number {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return content.events.filter((event) => {
    const starts = new Date(event.startsAt);
    return starts >= start && starts < end;
  }).length;
}
