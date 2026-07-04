const REALM_MODE_STORAGE_KEY = "campusquest-realm-map-mode";

export function readRealmMapModeEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(REALM_MODE_STORAGE_KEY);
  return stored !== "off";
}

export function writeRealmMapModeEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REALM_MODE_STORAGE_KEY, enabled ? "on" : "off");
}
