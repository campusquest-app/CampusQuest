/**
 * Google Maps Platform requires the Google logo and copyright attribution
 * to remain fully visible and unobstructed. CampusQuest overlays (header,
 * filter chips, FABs, dock nav, immersive gradients) share the same
 * viewport as the map canvas, so we push map chrome inward via Map.padding
 * and expose matching CSS vars for absolute overlays outside MapControl slots.
 *
 * See: https://developers.google.com/maps/documentation/javascript/map
 */

/** Minimum clear band for the Google logo + copyright line (px). */
export const GOOGLE_ATTRIBUTION_BAND_PX = 42;

/** Small inset so top MapControls (filter / search) aren't flush with the edge. */
export const MAP_CHROME_TOP_INSET_PX = 10;

/** Breathing room on the right so FABs don't hug the screen edge. */
export const MAP_CHROME_RIGHT_INSET_PX = 8;

/** Breathing room on the left so the logo isn't flush against the safe-area. */
export const MAP_CHROME_LEFT_INSET_PX = 8;

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
}): MapChromePadding {
  const safe = args?.safeArea ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const navClearance = args?.navClearancePx ?? 0;
  const attributionBand = args?.attributionBandPx ?? GOOGLE_ATTRIBUTION_BAND_PX;

  return {
    // Header lives outside the map; only a light inset for filter/search.
    top: MAP_CHROME_TOP_INSET_PX,
    right: Math.max(MAP_CHROME_RIGHT_INSET_PX, safe.right),
    // Dock covers the bottom of the canvas — push logo/attribution above it,
    // then reserve a dedicated band so CQ gradients/FABs don't cover Google chrome.
    bottom: navClearance + attributionBand,
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
}

export function clearMapChromePaddingCssVars(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  root.removeProperty("--cq-realm-attribution-band");
  root.removeProperty("--cq-realm-map-padding-top");
  root.removeProperty("--cq-realm-map-padding-right");
  root.removeProperty("--cq-realm-map-padding-bottom");
  root.removeProperty("--cq-realm-map-padding-left");
}
