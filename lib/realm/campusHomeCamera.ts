import {
  URI_MAP_CENTER,
  URI_MAP_DEFAULT_ZOOM,
  moveMapCamera,
} from "@/lib/realm/googleMapPose";
import { distanceMeters } from "@/lib/realm/realmFirstOpen";

/** North-up, flat pitch — the pose the campus map opens with. */
export const CAMPUS_HOME_HEADING = 0;
export const CAMPUS_HOME_TILT = 0;

/** Farther than this, the Back to Campus button appears. */
const SHOW_METERS = 160;
const SHOW_ZOOM_DELTA = 0.75;
const SHOW_HEADING = 12;
const SHOW_TILT = 6;

/** Must get this close before the button hides, so it does not flicker at the edge. */
const HIDE_METERS = 55;
const HIDE_ZOOM_DELTA = 0.3;
const HIDE_HEADING = 4;
const HIDE_TILT = 2;

export type CampusCameraSample = {
  lat: number;
  lng: number;
  zoom: number;
  heading: number;
  tilt: number;
};

export function headingOffsetDegrees(heading: number): number {
  if (!Number.isFinite(heading)) return 0;
  const normalized = ((heading % 360) + 360) % 360;
  return Math.min(normalized, 360 - normalized);
}

function isAwayFromHome(
  sample: CampusCameraSample,
  meterLimit: number,
  zoomLimit: number,
  headingLimit: number,
  tiltLimit: number,
): boolean {
  const meters = distanceMeters(sample, URI_MAP_CENTER);
  return (
    meters >= meterLimit ||
    Math.abs(sample.zoom - URI_MAP_DEFAULT_ZOOM) >= zoomLimit ||
    headingOffsetDegrees(sample.heading) >= headingLimit ||
    Math.abs(sample.tilt - CAMPUS_HOME_TILT) >= tiltLimit
  );
}

/**
 * Show Back to Campus only when the camera has left the URI Kingston home pose.
 * Hysteresis keeps the button from blinking while the camera settles.
 */
export function shouldShowBackToCampus(sample: CampusCameraSample, currentlyVisible: boolean): boolean {
  const meters = distanceMeters(sample, URI_MAP_CENTER);
  if (currentlyVisible) {
    const stillHome =
      meters <= HIDE_METERS &&
      Math.abs(sample.zoom - URI_MAP_DEFAULT_ZOOM) <= HIDE_ZOOM_DELTA &&
      headingOffsetDegrees(sample.heading) <= HIDE_HEADING &&
      Math.abs(sample.tilt - CAMPUS_HOME_TILT) <= HIDE_TILT;
    return !stillHome;
  }
  return isAwayFromHome(sample, SHOW_METERS, SHOW_ZOOM_DELTA, SHOW_HEADING, SHOW_TILT);
}

/**
 * Animate to URI Kingston center at the default zoom, bearing, and pitch.
 * Uses the shared campus constants — does not change layers, filters, or GPS.
 */
export function returnToCampusHome(map: google.maps.Map): void {
  const target = {
    center: URI_MAP_CENTER,
    zoom: URI_MAP_DEFAULT_ZOOM,
    heading: CAMPUS_HOME_HEADING,
    tilt: CAMPUS_HOME_TILT,
  };
  const reduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    moveMapCamera(map, target);
    return;
  }
  if (typeof map.setHeading === "function") map.setHeading(target.heading);
  if (typeof map.setTilt === "function") map.setTilt(target.tilt);
  map.panTo(target.center);
  map.setZoom(target.zoom);
}
