/**
 * Google Maps Platform requires the Google logo and copyright attribution
 * to remain fully visible and unobstructed. CampusQuest overlays (header,
 * filter chips, FABs, dock nav, immersive gradients) share the same
 * viewport as the map canvas, so we push map chrome inward via Map.padding
 * and expose matching CSS vars for absolute overlays outside MapControl slots.
 *
 * Layout bands (immersive Realm, bottom → top):
 * 1. Home indicator / safe-area (inside dock clearance)
 * 2. Floating bottom nav (dock)
 * 3. Google logo + copyright attribution (dedicated clear band)
 * 4. CQ FABs / toasts (MapControl slots, already inset by Map.padding)
 * 5. Map content
 * 6. Filter + search (top MapControl stack, below Realm header)
 *
 * See: https://developers.google.com/maps/documentation/javascript/policies
 */

/**
 * Clear band for Google logo (~16–19dp) + copyright line + required clear space.
 * Keep generous so FABs/toasts never sit on the logo.
 */
export const GOOGLE_ATTRIBUTION_BAND_PX = 52;

/** Small inset so top MapControls (filter / search) aren't flush with the header edge. */
export const MAP_CHROME_TOP_INSET_PX = 12;

/** Breathing room on the right so FABs don't hug the screen edge. */
export const MAP_CHROME_RIGHT_INSET_PX = 8;

/** Breathing room on the left so the logo isn't flush against the safe-area. */
export const MAP_CHROME_LEFT_INSET_PX = 8;

/** Extra gap between RIGHT_BOTTOM FABs and the attribution band. */
export const MAP_CHROME_FAB_GAP_PX = 8;

export type MapChromePadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

/** Resolve a CSS length custom property to CSS pixels via a temporary element. */
export function measureCssLengthPx(cssLength: string): number {
  if (typeof document === "undefined") return 0;
  const probe = document.createElement("div");
  probe.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;height:${cssLength};width:0;`;
  document.body.appendChild(probe);
  const px = probe.getBoundingClientRect().height;
  probe.remove();
  return Number.isFinite(px) ? Math.max(0, Math.round(px)) : 0;
}

export function measureSafeAreaInsets(): { top: number; right: number; bottom: number; left: number } {
  return {
    top: measureCssLengthPx("env(safe-area-inset-top, 0px)"),
    right: measureCssLengthPx("env(safe-area-inset-right, 0px)"),
    bottom: measureCssLengthPx("env(safe-area-inset-bottom, 0px)"),
    left: measureCssLengthPx("env(safe-area-inset-left, 0px)"),
  };
}

/**
 * Space occupied by the floating bottom dock (nav height + dock offset +
 * home-indicator safe area). Matches `--cq-realm-nav-clearance`.
 */
export function measureRealmNavClearancePx(): number {
  if (typeof document === "undefined") return 0;

  // Prefer a live measurement of the dock when present — more accurate than
  // CSS vars alone after rotation / Dynamic Island / font scaling.
  const dock = document.querySelector(".cq-dock-nav");
  if (dock instanceof HTMLElement) {
    const rect = dock.getBoundingClientRect();
    if (rect.height > 0 && typeof window !== "undefined") {
      return Math.max(0, Math.round(window.innerHeight - rect.top));
    }
  }

  return measureCssLengthPx(
    "calc(var(--cq-bottom-nav-h, 4rem) + var(--cq-dock-bottom-offset, 14px) + env(safe-area-inset-bottom, 0px))",
  );
}

/**
 * Compute Google Map padding so attribution/logo and MapControls sit in the
 * clear band above the dock and clear of side/top overlays.
 */
export function computeMapChromePadding(args?: {
  navClearancePx?: number;
  safeArea?: { top: number; right: number; bottom: number; left: number };
  attributionBandPx?: number;
  fabGapPx?: number;
}): MapChromePadding {
  const safe = args?.safeArea ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const navClearance = Math.max(0, args?.navClearancePx ?? 0);
  const attributionBand = args?.attributionBandPx ?? GOOGLE_ATTRIBUTION_BAND_PX;
  const fabGap = args?.fabGapPx ?? MAP_CHROME_FAB_GAP_PX;

  return {
    // Realm header lives outside the map stage; only a light inset for top chrome.
    top: MAP_CHROME_TOP_INSET_PX,
    right: Math.max(MAP_CHROME_RIGHT_INSET_PX, safe.right),
    // Dock covers the bottom of the canvas — push logo/attribution above it,
    // then reserve a dedicated band (+ FAB gap) so CQ UI never covers Google chrome.
    bottom: navClearance + attributionBand + fabGap,
    left: Math.max(MAP_CHROME_LEFT_INSET_PX, safe.left),
  };
}

/** Publish padding as CSS custom properties for absolute CQ overlays. */
export function applyMapChromePaddingCssVars(padding: MapChromePadding): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  root.setProperty("--cq-realm-attribution-band", `${GOOGLE_ATTRIBUTION_BAND_PX}px`);
  root.setProperty("--cq-realm-map-padding-top", `${padding.top}px`);
  root.setProperty("--cq-realm-map-padding-right", `${padding.right}px`);
  root.setProperty("--cq-realm-map-padding-bottom", `${padding.bottom}px`);
  root.setProperty("--cq-realm-map-padding-left", `${padding.left}px`);
  // Overlay clip line: keep absolute CQ layers out of the Google attribution zone
  // (nav clearance + attribution band). FAB gap stays available for MapControls.
  root.setProperty(
    "--cq-realm-overlay-clear-bottom",
    `${Math.max(0, padding.bottom - MAP_CHROME_FAB_GAP_PX)}px`,
  );
}

export function clearMapChromePaddingCssVars(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  root.removeProperty("--cq-realm-attribution-band");
  root.removeProperty("--cq-realm-map-padding-top");
  root.removeProperty("--cq-realm-map-padding-right");
  root.removeProperty("--cq-realm-map-padding-bottom");
  root.removeProperty("--cq-realm-map-padding-left");
  root.removeProperty("--cq-realm-overlay-clear-bottom");
}
