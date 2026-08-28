import { APP_BOTTOM_NAV_TABS, type AppBottomNavTab } from "@/lib/client/appBottomNavTabs";
import { getIsDrawerOpen } from "@/lib/client/appDrawerStore";

export const SWIPE_BACK_EDGE_PX = 28;
export const SWIPE_BACK_COMMIT_PX = 72;
export const SWIPE_TAB_COMMIT_PX = 64;
export const SWIPE_GESTURE_AXIS_LOCK_PX = 10;
export const SWIPE_TRANSITION_MS = 220;
export const DRAWER_SWIPE_OPEN_PX = 85;
export const DRAWER_SWIPE_OPEN_RATIO = 1.5;
export const DRAWER_SWIPE_CLOSE_PX = 70;
export const DRAWER_SWIPE_CLOSE_RATIO = 1.3;

export const DRAWER_SWIPE_IGNORE_SELECTOR = [
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "[role='button']",
  "[data-no-drawer-swipe='true']",
  "[data-map-marker='true']",
  "[data-horizontal-scroll='true']",
  "[data-cq-horizontal-scroll='true']",
  ".horizontal-scroll",
  ".filter-scroll",
  ".leaderboard-filter-row",
  ".carousel",
  ".tabs",
  ".map-pin",
  ".realm-pin",
  ".realm-marker",
  ".location-marker",
  ".post-actions",
  // Google Maps owns pan / pinch / two-finger tilt+rotate inside the Realm map.
  ".cq-realm-map-surface",
  ".cq-realm-map-canvas",
  ".gm-style",
  ".gm-style-moc",
  ".cq-realm-foryou-rail",
  ".cq-realm-foryou-rail__scroller",
  ".cq-realm-sheet",
  ".cq-nearby-places__scroller",
].join(", ");

const DRAWER_HORIZONTAL_SCROLL_SELECTOR = [
  "[data-no-drawer-swipe='true']",
  "[data-horizontal-scroll='true']",
  "[data-cq-horizontal-scroll='true']",
  ".horizontal-scroll",
  ".filter-scroll",
  ".leaderboard-filter-row",
  ".carousel",
  ".tabs",
  ".cq-realm-foryou-rail",
  ".cq-realm-foryou-rail__scroller",
  ".cq-nearby-places__scroller",
].join(", ");

/** Left → right dock order. Map (`realm`) is the centered primary action. */
export const BOTTOM_NAV_SWIPE_TABS: AppBottomNavTab[] = [...APP_BOTTOM_NAV_TABS];

export type SwipeNavDirection = "forward" | "back";

export type GestureBlockKind = "swipe-tab" | "swipe-back" | "all";

export function readTouchMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  if (!window.matchMedia("(max-width: 767px)").matches) return false;
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

export function isInputFocused(): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  if (!active || !(active instanceof HTMLElement)) return false;
  if (active.isContentEditable) return true;
  const tag = active.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function isGlobalTabSwipeBlocked(): boolean {
  if (typeof document === "undefined") return false;
  const root = document.documentElement;
  return (
    getIsDrawerOpen() ||
    root.hasAttribute("data-realm-map-panning") ||
    root.hasAttribute("data-cq-scanner-active") ||
    root.hasAttribute("data-cq-tab-swipe-disabled") ||
    root.hasAttribute("data-cq-media-gesture-lock")
  );
}

/** Root attribute set by full-screen overlays that must own all horizontal swipes
 *  (e.g. the Memories viewer). While present, the global drawer/hamburger swipe is
 *  suppressed so it can never open from underneath the overlay. */
export const DRAWER_SWIPE_SUPPRESS_ATTR = "data-cq-drawer-swipe-suppressed";

export function isDrawerSwipeSuppressed(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.hasAttribute(DRAWER_SWIPE_SUPPRESS_ATTR);
}

export function resolveGestureElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

export function shouldIgnoreDrawerSwipe(target: EventTarget | null): boolean {
  const el = resolveGestureElement(target);
  if (!el) return false;
  return Boolean(el.closest(DRAWER_SWIPE_IGNORE_SELECTOR));
}

/** Close swipe: allow backdrop and drawer chrome; block nav buttons inside drawer. */
export function shouldIgnoreDrawerCloseSwipe(target: EventTarget | null): boolean {
  const el = resolveGestureElement(target);
  if (!el) return false;
  if (el.closest(".cq-drawer-backdrop, .cq-side-drawer")) {
    return Boolean(
      el.closest(
        ".cq-side-drawer button, .cq-side-drawer a, .cq-side-drawer input, .cq-side-drawer textarea, .cq-side-drawer select, .cq-side-drawer [role='button']",
      ),
    );
  }
  return true;
}

export function isInteractiveElement(target: EventTarget | null): boolean {
  return shouldIgnoreDrawerSwipe(target);
}

export function isHorizontalScrollGestureTarget(target: EventTarget | null): boolean {
  const el = resolveGestureElement(target);
  if (!el) return false;
  return Boolean(el.closest(DRAWER_HORIZONTAL_SCROLL_SELECTOR));
}

export function isGestureTargetBlocked(
  target: EventTarget | null,
  kinds: Set<GestureBlockKind>,
): boolean {
  const start = resolveGestureElement(target);
  if (!start) return false;
  // Align tab swipe with drawer ignore: carousels / horizontal scrollers own the gesture.
  if (kinds.has("swipe-tab") && isHorizontalScrollGestureTarget(start)) {
    return true;
  }
  let node: Element | null = start;
  while (node) {
    const block = node.getAttribute("data-cq-gesture-block");
    if (block === "all" || (block && kinds.has(block as GestureBlockKind))) {
      return true;
    }
    if (node.getAttribute("data-cq-horizontal-scroll") === "true" && kinds.has("swipe-tab")) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

export function getAdjacentBottomNavTab(
  tab: AppBottomNavTab,
  direction: SwipeNavDirection,
): AppBottomNavTab | null {
  const index = BOTTOM_NAV_SWIPE_TABS.indexOf(tab);
  if (index === -1) return null;
  const nextIndex = direction === "forward" ? index + 1 : index - 1;
  if (nextIndex < 0 || nextIndex >= BOTTOM_NAV_SWIPE_TABS.length) return null;
  return BOTTOM_NAV_SWIPE_TABS[nextIndex] ?? null;
}
