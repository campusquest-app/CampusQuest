import {
  URI_MAP_CENTER,
  URI_MAP_3D_VIEW_TILT,
  URI_MAP_3D_VIEW_ZOOM,
  moveMapCamera,
} from "@/lib/realm/googleMapPose";
import { distanceMeters } from "@/lib/realm/realmFirstOpen";
import { clearSessionMapCamera } from "@/lib/realm/sessionMapCamera";

/** North-up cinematic campus home — tilted so buildings read in 3D. */
export const CAMPUS_HOME_HEADING = 0;
/** Target pitch for the default URI campus view (Google vector max is 67.5°). */
export const CAMPUS_HOME_TILT = URI_MAP_3D_VIEW_TILT;
/** Zoom where campus paths and buildings stay prominent. */
export const CAMPUS_HOME_ZOOM = URI_MAP_3D_VIEW_ZOOM;

/** Farther than this, the Back to Campus button appears. */
const SHOW_METERS = 160;
const SHOW_ZOOM_DELTA = 0.75;
const SHOW_HEADING = 12;
const SHOW_TILT = 12;

/** Must get this close before the button hides, so it does not flicker at the edge. */
const HIDE_METERS = 55;
const HIDE_ZOOM_DELTA = 0.3;
const HIDE_HEADING = 4;
const HIDE_TILT = 6;

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
    Math.abs(sample.zoom - CAMPUS_HOME_ZOOM) >= zoomLimit ||
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
      Math.abs(sample.zoom - CAMPUS_HOME_ZOOM) <= HIDE_ZOOM_DELTA &&
      headingOffsetDegrees(sample.heading) <= HIDE_HEADING &&
      Math.abs(sample.tilt - CAMPUS_HOME_TILT) <= HIDE_TILT;
    return !stillHome;
  }
  return isAwayFromHome(sample, SHOW_METERS, SHOW_ZOOM_DELTA, SHOW_HEADING, SHOW_TILT);
}

export function campusHomeCameraTarget() {
  return {
    center: URI_MAP_CENTER,
    zoom: CAMPUS_HOME_ZOOM,
    heading: CAMPUS_HOME_HEADING,
    tilt: CAMPUS_HOME_TILT,
  };
}

/**
 * Animate to URI Kingston center at the default zoom, bearing, and cinematic pitch.
 * Uses the shared campus constants — does not change layers, filters, or GPS.
 */
export function returnToCampusHome(map: google.maps.Map): void {
  clearSessionMapCamera();
  const target = campusHomeCameraTarget();
  const reduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    moveMapCamera(map, target);
    return;
  }
  // Set tilt/heading first so the pan/zoom lands on a 3D campus frame.
  if (typeof map.setHeading === "function") map.setHeading(target.heading);
  if (typeof map.setTilt === "function") map.setTilt(target.tilt);
  map.panTo(target.center);
  map.setZoom(target.zoom);
  // Reinforce via moveCamera when available (vector maps accept tilt more reliably).
  if (typeof map.moveCamera === "function") {
    window.setTimeout(() => {
      moveMapCamera(map, target);
    }, 0);
  }
}
