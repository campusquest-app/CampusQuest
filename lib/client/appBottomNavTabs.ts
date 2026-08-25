/**
 * Primary dock destinations (left → right). Map (`realm`) is the centered action.
 * Keep this module free of client-store imports so unit tests can load it.
 */
export const APP_BOTTOM_NAV_TABS = ["quad", "inbox", "realm", "events", "character"] as const;

export type AppBottomNavTab = (typeof APP_BOTTOM_NAV_TABS)[number];

/** Temporary first-session labels. Persistent aria-labels stay on the dock items. */
export const APP_BOTTOM_NAV_HINT_LABELS: Record<AppBottomNavTab, string> = {
  quad: "Feed",
  inbox: "Messages",
  realm: "Explore",
  events: "Events",
  character: "Profile",
};
