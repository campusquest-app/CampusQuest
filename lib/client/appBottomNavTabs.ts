/**
 * Primary dock destinations (left → right). Map (`realm`) is the centered action.
 * Keep this module free of client-store imports so unit tests can load it.
 */
export const APP_BOTTOM_NAV_TABS = ["quad", "partners", "realm", "events", "character"] as const;

export type AppBottomNavTab = (typeof APP_BOTTOM_NAV_TABS)[number];

/** Short dock captions. Map keeps the first-session “Explore” hint only. */
export const APP_BOTTOM_NAV_HINT_LABELS: Record<AppBottomNavTab, string> = {
  quad: "Home",
  /** Short dock caption; page title remains "Community Quests". */
  partners: "Perks",
  realm: "Explore",
  events: "Events",
  character: "Profile",
};
