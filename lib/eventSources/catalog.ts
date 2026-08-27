import {
  EVENT_SOURCE_TYPES,
  type EventSourceType,
} from "@/lib/eventSources/types";

export type EventSourcePresentation = {
  source: EventSourceType;
  label: string;
  /** Compact chip on cards / map pins. */
  chip: string;
  /** Secondary outbound CTA. Keep URInvolved copy stable for existing tests. */
  actionLabel: string | null;
};

const CATALOG: Record<EventSourceType, EventSourcePresentation> = {
  urinvolved: {
    source: "urinvolved",
    label: "URInvolved",
    chip: "URInvolved",
    actionLabel: "More Info on URInvolved",
  },
  athletics: {
    source: "athletics",
    label: "Athletics",
    chip: "Athletics",
    actionLabel: "Athletics event page",
  },
  fine_arts: {
    source: "fine_arts",
    label: "Fine Arts",
    chip: "Fine Arts",
    actionLabel: "Fine Arts listing",
  },
  academic: {
    source: "academic",
    label: "Academic",
    chip: "Academic",
    actionLabel: "Event page",
  },
  career: {
    source: "career",
    label: "Career",
    chip: "Career",
    actionLabel: "Event page",
  },
  recreation: {
    source: "recreation",
    label: "Recreation",
    chip: "Recreation",
    actionLabel: "Event page",
  },
  department: {
    source: "department",
    label: "Department",
    chip: "Department",
    actionLabel: "Event page",
  },
  campusquest: {
    source: "campusquest",
    label: "CampusQuest",
    chip: "CampusQuest",
    actionLabel: null,
  },
  manual: {
    source: "manual",
    label: "CampusQuest Verified",
    chip: "CampusQuest Verified",
    actionLabel: null,
  },
};

const SOURCE_SET = new Set<string>(EVENT_SOURCE_TYPES);

export function isEventSourceType(value: string | null | undefined): value is EventSourceType {
  return Boolean(value && SOURCE_SET.has(value));
}

/** Imported/external providers stored on `external_events`. */
export function isImportedEventSource(value: string | null | undefined): boolean {
  if (!value) return false;
  return value !== "campusquest";
}

export function coerceEventSourceType(value: string | null | undefined): EventSourceType {
  if (isEventSourceType(value)) return value;
  return "campusquest";
}

export function eventSourcePresentation(source: string | null | undefined): EventSourcePresentation {
  return CATALOG[coerceEventSourceType(source)];
}

export function eventSourceLabel(source: string | null | undefined): string {
  return eventSourcePresentation(source).chip;
}

export function eventSourceActionLabel(source: string | null | undefined): string | null {
  return eventSourcePresentation(source).actionLabel;
}

/** Subtle source chip — omit for native CampusQuest community posts unless verified-manual. */
export function eventSourceChipLabel(source: string | null | undefined): string | null {
  if (!source) return null;
  if (source === "campusquest") return null;
  return eventSourceLabel(source);
}
