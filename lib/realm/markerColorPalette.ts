/**
 * Stable, unique color assignment for visible Realm map markers.
 * Colors stay fixed for a marker ID while it remains on the map and only
 * recycle when the visible set exceeds the palette size — maximizing
 * distance between same-colored markers when reuse is required.
 */

export type MarkerPaletteColor =
  | "electric-blue"
  | "cyan"
  | "teal"
  | "emerald"
  | "lime"
  | "gold"
  | "amber"
  | "orange"
  | "coral"
  | "red"
  | "pink"
  | "magenta"
  | "purple"
  | "violet"
  | "indigo";

/** Controlled palette — order used for sequential unused-color picks. */
export const MARKER_COLOR_PALETTE: readonly MarkerPaletteColor[] = [
  "electric-blue",
  "cyan",
  "teal",
  "emerald",
  "lime",
  "gold",
  "amber",
  "orange",
  "coral",
  "red",
  "pink",
  "magenta",
  "purple",
  "violet",
  "indigo",
] as const;

export type MarkerColorHint =
  | "important"
  | "academic"
  | "social"
  | "creative"
  | "urgent"
  | "default";

/** Soft semantic preferences — never forced if uniqueness would suffer. */
const HINT_PREFERRED: Record<MarkerColorHint, MarkerPaletteColor[]> = {
  important: ["gold", "amber"],
  academic: ["electric-blue", "cyan", "indigo", "teal"],
  social: ["emerald", "lime", "teal"],
  creative: ["purple", "pink", "magenta", "violet"],
  urgent: ["orange", "coral", "red", "amber"],
  default: [],
};

type GeoLike = { lat: number; lng: number };

type AssignmentStore = {
  byId: Map<string, MarkerPaletteColor>;
};

const globalStore: AssignmentStore =
  (globalThis as { __cqMarkerColors?: AssignmentStore }).__cqMarkerColors ??
  { byId: new Map() };

if (!(globalThis as { __cqMarkerColors?: AssignmentStore }).__cqMarkerColors) {
  (globalThis as { __cqMarkerColors?: AssignmentStore }).__cqMarkerColors = globalStore;
}

function haversineMeters(a: GeoLike, b: GeoLike): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type VisibleMarkerForColor = {
  id: string;
  lat: number;
  lng: number;
  hint?: MarkerColorHint;
  /** Prefer gold for the closest/most important opportunity. */
  preferGold?: boolean;
};

/**
 * Assign distinct palette colors to the current visible marker set.
 * Preserves prior assignments for IDs that remain visible.
 */
export function assignVisibleMarkerColors(
  markers: VisibleMarkerForColor[],
  store: AssignmentStore = globalStore,
): Map<string, MarkerPaletteColor> {
  const visibleIds = new Set(markers.map((m) => m.id));

  // Drop assignments for markers no longer visible so colors free up.
  for (const id of Array.from(store.byId.keys())) {
    if (!visibleIds.has(id)) store.byId.delete(id);
  }

  const used = new Set<MarkerPaletteColor>();
  for (const m of markers) {
    const existing = store.byId.get(m.id);
    if (existing) used.add(existing);
  }

  // Prefer gold for the marked important/closest marker when free.
  const goldCandidate = markers.find((m) => m.preferGold || m.hint === "important");
  if (goldCandidate && !store.byId.has(goldCandidate.id) && !used.has("gold")) {
    store.byId.set(goldCandidate.id, "gold");
    used.add("gold");
  }

  for (const marker of markers) {
    if (store.byId.has(marker.id)) continue;

    const free = MARKER_COLOR_PALETTE.filter((c) => !used.has(c));
    let chosen: MarkerPaletteColor;

    if (free.length > 0) {
      const preferred = (HINT_PREFERRED[marker.hint ?? "default"] ?? []).filter((c) =>
        free.includes(c),
      );
      chosen = preferred[0] ?? free[0]!;
    } else {
      // Palette exhausted — pick the color whose nearest same-colored neighbor is farthest.
      chosen = pickMostDistantReuse(marker, markers, store);
    }

    store.byId.set(marker.id, chosen);
    used.add(chosen);
  }

  // Neighbor conflict repair: if two markers share a color and are very close, try swapping.
  repairNeighborConflicts(markers, store);

  return new Map(store.byId);
}

function pickMostDistantReuse(
  marker: VisibleMarkerForColor,
  all: VisibleMarkerForColor[],
  store: AssignmentStore,
): MarkerPaletteColor {
  let best: MarkerPaletteColor = MARKER_COLOR_PALETTE[0]!;
  let bestMinDist = -1;

  for (const color of MARKER_COLOR_PALETTE) {
    let minDist = Number.POSITIVE_INFINITY;
    for (const other of all) {
      if (other.id === marker.id) continue;
      if (store.byId.get(other.id) !== color) continue;
      const d = haversineMeters(marker, other);
      if (d < minDist) minDist = d;
    }
    if (minDist > bestMinDist) {
      bestMinDist = minDist;
      best = color;
    }
  }
  return best;
}

/** ~45m — roughly "next to each other" on the campus map. */
const NEIGHBOR_METERS = 45;

function repairNeighborConflicts(
  markers: VisibleMarkerForColor[],
  store: AssignmentStore,
): void {
  for (let i = 0; i < markers.length; i += 1) {
    for (let j = i + 1; j < markers.length; j += 1) {
      const a = markers[i]!;
      const b = markers[j]!;
      const colorA = store.byId.get(a.id);
      const colorB = store.byId.get(b.id);
      if (!colorA || !colorB || colorA !== colorB) continue;
      if (haversineMeters(a, b) > NEIGHBOR_METERS) continue;

      // Try to reassign B to any free or farther color.
      const usedNearby = new Set<MarkerPaletteColor>();
      for (const other of markers) {
        if (other.id === b.id) continue;
        if (haversineMeters(b, other) <= NEIGHBOR_METERS * 2) {
          const c = store.byId.get(other.id);
          if (c) usedNearby.add(c);
        }
      }
      const candidate =
        MARKER_COLOR_PALETTE.find((c) => c !== colorA && !usedNearby.has(c)) ??
        MARKER_COLOR_PALETTE.find((c) => c !== colorA);
      if (candidate) store.byId.set(b.id, candidate);
    }
  }
}

export function getAssignedMarkerColor(
  markerId: string,
  store: AssignmentStore = globalStore,
): MarkerPaletteColor | null {
  return store.byId.get(markerId) ?? null;
}

/** Test helper — clears the module store. */
export function resetMarkerColorAssignments(store: AssignmentStore = globalStore): void {
  store.byId.clear();
}

export function createMarkerColorStore(): AssignmentStore {
  return { byId: new Map() };
}

export function markerColorHintFromVariant(
  variant: "default" | "quest" | "legendary" | "event" | "qr" | "memories",
): MarkerColorHint {
  switch (variant) {
    case "legendary":
      return "important";
    case "quest":
      return "urgent";
    case "event":
    case "memories":
      return "creative";
    case "qr":
      return "social";
    default:
      return "academic";
  }
}
