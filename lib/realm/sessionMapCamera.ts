/**
 * Session-scoped Realm map camera pose. Restores the user's last view when the
 * map remounts in the same browser tab session (e.g. hard refresh within the
 * Realm keep-alive window). Cleared when the user taps Back to Campus.
 */

export type SessionMapCamera = {
  lat: number;
  lng: number;
  zoom: number;
  heading: number;
  tilt: number;
};

const STORAGE_KEY = "cq_realm_map_camera_session_v1";

function isValidPose(value: unknown): value is SessionMapCamera {
  if (!value || typeof value !== "object") return false;
  const pose = value as SessionMapCamera;
  return (
    Number.isFinite(pose.lat) &&
    Number.isFinite(pose.lng) &&
    Number.isFinite(pose.zoom) &&
    Number.isFinite(pose.heading) &&
    Number.isFinite(pose.tilt) &&
    pose.lat >= -90 &&
    pose.lat <= 90 &&
    pose.lng >= -180 &&
    pose.lng <= 180 &&
    pose.zoom >= 10 &&
    pose.zoom <= 22 &&
    pose.tilt >= 0 &&
    pose.tilt <= 67.5
  );
}

export function loadSessionMapCamera(): SessionMapCamera | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isValidPose(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSessionMapCamera(pose: SessionMapCamera): void {
  if (typeof window === "undefined") return;
  if (!isValidPose(pose)) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pose));
  } catch {
    /* private mode / quota */
  }
}

export function clearSessionMapCamera(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Read the live Google map camera into a session pose. */
export function readMapCameraPose(map: google.maps.Map): SessionMapCamera | null {
  const center = map.getCenter();
  if (!center) return null;
  const lat = center.lat();
  const lng = center.lng();
  const pose = {
    lat,
    lng,
    zoom: map.getZoom() ?? 18,
    heading: map.getHeading() ?? 0,
    tilt: map.getTilt() ?? 0,
  };
  return isValidPose(pose) ? pose : null;
}
