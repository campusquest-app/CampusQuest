import { isCampusLocationId, getCampusLocation } from "@/lib/locations/campusLocationCatalog";
import { geoToRealmMapPercent } from "@/lib/realm/geoToMapPercent";

/** Preset campus map location keys for admin QR + quest creation. */
export const CAMPUS_LOCATION_KEYS = [
  "quad",
  "library",
  "memorial_union",
  "mackal_rec_center",
  "ryan_center",
  "dining_hall",
  "dorm_residence",
  "academic_building",
  "other",
] as const;

export type CampusLocationKey = (typeof CAMPUS_LOCATION_KEYS)[number];

export type CampusLocationPreset = {
  key: CampusLocationKey;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
};

export const CAMPUS_LOCATION_PRESETS: CampusLocationPreset[] = [
  {
    key: "quad",
    label: "Quad",
    address: "5 Lippitt Rd, Kingston, RI",
    latitude: 41.4871,
    longitude: -71.5305,
  },
  {
    key: "library",
    label: "Library",
    address: "15 Lippitt Rd, Kingston, RI",
    latitude: 41.4876,
    longitude: -71.5312,
  },
  {
    key: "memorial_union",
    label: "Memorial Union",
    address: "50 Lower College Rd, Kingston, RI",
    latitude: 41.4868,
    longitude: -71.5301,
  },
  {
    key: "mackal_rec_center",
    label: "Mackal / Rec Center",
    address: "18 Butterfield Rd, Kingston, RI",
    latitude: 41.4849,
    longitude: -71.5288,
  },
  {
    key: "ryan_center",
    label: "Ryan Center",
    address: "1 Lincoln Almond Plaza, Kingston, RI",
    latitude: 41.4853,
    longitude: -71.5298,
  },
  {
    key: "dining_hall",
    label: "Dining Hall",
    address: "50 Lower College Rd, Kingston, RI",
    latitude: 41.4862,
    longitude: -71.5318,
  },
  {
    key: "dorm_residence",
    label: "Dorm / Residence Hall",
    address: "Upper College Rd, Kingston, RI",
    latitude: 41.4885,
    longitude: -71.5325,
  },
  {
    key: "academic_building",
    label: "Academic Building",
    address: "Engineering Row, Kingston, RI",
    latitude: 41.4888,
    longitude: -71.5295,
  },
  {
    key: "other",
    label: "Other",
    address: "",
    latitude: 0,
    longitude: 0,
  },
];

export const CAMPUS_LOCATION_OPTIONS = CAMPUS_LOCATION_PRESETS.map((preset) => ({
  value: preset.key,
  label: preset.label,
}));

const PRESET_BY_KEY = new Map(CAMPUS_LOCATION_PRESETS.map((preset) => [preset.key, preset]));

export function isCampusLocationKey(value: string | null | undefined): value is CampusLocationKey {
  return Boolean(value && (CAMPUS_LOCATION_KEYS as readonly string[]).includes(value));
}

export function getCampusLocationPreset(key: CampusLocationKey): CampusLocationPreset {
  return PRESET_BY_KEY.get(key) ?? CAMPUS_LOCATION_PRESETS[CAMPUS_LOCATION_PRESETS.length - 1];
}

export type CampusLocationFormState = {
  /** Legacy preset key, catalog slug, or "other". */
  locationKey: string;
  locationName: string;
  locationAddress: string;
  locationLat: string;
  locationLng: string;
};

export const EMPTY_CAMPUS_LOCATION_FORM: CampusLocationFormState = {
  locationKey: "",
  locationName: "",
  locationAddress: "",
  locationLat: "",
  locationLng: "",
};

export type ResolvedCampusLocation = {
  locationKey: CampusLocationKey | null;
  locationName: string | null;
  locationAddress: string | null;
  locationLat: number | null;
  locationLng: number | null;
  mapPinX: number | null;
  mapPinY: number | null;
  showOnMap: boolean;
};

function parseOptionalCoordinate(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function isValidCampusCoordinate(lat: number, lng: number): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0);
}

export function resolveCampusLocation(input: {
  locationKey?: string | null;
  location_key?: string | null;
  locationName?: string | null;
  location_name?: string | null;
  locationAddress?: string | null;
  location_address?: string | null;
  locationLat?: unknown;
  location_lat?: unknown;
  locationLng?: unknown;
  location_lng?: unknown;
}): ResolvedCampusLocation {
  const rawKey = (input.locationKey ?? input.location_key ?? "").trim();

  if (rawKey && isCampusLocationId(rawKey)) {
    try {
      const entry = getCampusLocation(rawKey);
      const lat = entry.latitude;
      const lng = entry.longitude;
      const hasCoords = lat != null && lng != null && isValidCampusCoordinate(lat, lng);
      const map =
        entry.mapX != null && entry.mapY != null
          ? { x: entry.mapX, y: entry.mapY }
          : hasCoords
            ? geoToRealmMapPercent(lat, lng)
            : null;
      return {
        locationKey: (entry.legacyCampusKey ?? rawKey) as CampusLocationKey,
        locationName: entry.name,
        locationAddress: optionalTrim(input.locationAddress ?? input.location_address, 300),
        locationLat: lat,
        locationLng: lng,
        mapPinX: map?.x ?? null,
        mapPinY: map?.y ?? null,
        showOnMap: map != null || hasCoords,
      };
    } catch {
      /* fall through to legacy resolution */
    }
  }

  const locationKey = isCampusLocationKey(rawKey) ? rawKey : null;

  if (!locationKey) {
    return {
      locationKey: null,
      locationName: optionalTrim(input.locationName ?? input.location_name, 200),
      locationAddress: optionalTrim(input.locationAddress ?? input.location_address, 300),
      locationLat: null,
      locationLng: null,
      mapPinX: null,
      mapPinY: null,
      showOnMap: false,
    };
  }

  if (locationKey !== "other") {
    const preset = getCampusLocationPreset(locationKey);
    const map = geoToRealmMapPercent(preset.latitude, preset.longitude);
    return {
      locationKey,
      locationName: preset.label,
      locationAddress: preset.address,
      locationLat: preset.latitude,
      locationLng: preset.longitude,
      mapPinX: map.x,
      mapPinY: map.y,
      showOnMap: true,
    };
  }

  const customName = optionalTrim(input.locationName ?? input.location_name, 200);
  const customAddress = optionalTrim(input.locationAddress ?? input.location_address, 300);
  const lat = parseOptionalCoordinate(input.locationLat ?? input.location_lat);
  const lng = parseOptionalCoordinate(input.locationLng ?? input.location_lng);
  const hasCoords = lat != null && lng != null && isValidCampusCoordinate(lat, lng);
  const map = hasCoords ? geoToRealmMapPercent(lat, lng) : null;

  return {
    locationKey: "other",
    locationName: customName,
    locationAddress: customAddress,
    locationLat: hasCoords ? lat : null,
    locationLng: hasCoords ? lng : null,
    mapPinX: map?.x ?? null,
    mapPinY: map?.y ?? null,
    showOnMap: hasCoords,
  };
}

function optionalTrim(value: unknown, maxLen: number): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

export type CampusLocationPayloadOptions = {
  /** When true, emit explicit nulls so PATCH can clear an existing map link. */
  clearWhenEmpty?: boolean;
};

export function campusLocationFormToPayload(
  form: CampusLocationFormState,
  options?: CampusLocationPayloadOptions,
): Record<string, unknown> {
  if (!form.locationKey) {
    if (!options?.clearWhenEmpty) return {};
    return {
      locationKey: null,
      locationName: null,
      locationAddress: null,
      locationLat: null,
      locationLng: null,
      mapPinX: null,
      mapPinY: null,
    };
  }

  const payload: Record<string, unknown> = { locationKey: form.locationKey };
  if (isCampusLocationId(form.locationKey)) {
    payload.locationId = form.locationKey;
    if (form.locationName.trim()) payload.locationName = form.locationName.trim();
    if (form.locationLat.trim()) payload.locationLat = Number(form.locationLat);
    if (form.locationLng.trim()) payload.locationLng = Number(form.locationLng);
    return payload;
  }
  if (form.locationKey === "other") {
    if (form.locationName.trim()) payload.locationName = form.locationName.trim();
    if (form.locationAddress.trim()) payload.locationAddress = form.locationAddress.trim();
    if (form.locationLat.trim()) payload.locationLat = Number(form.locationLat);
    if (form.locationLng.trim()) payload.locationLng = Number(form.locationLng);
  }
  return payload;
}

export function campusLocationFormFromRow(row: {
  location_id?: string | null;
  location_key?: string | null;
  location_name?: string | null;
  location_address?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
}): CampusLocationFormState {
  const locationId = row.location_id?.trim();
  if (locationId && isCampusLocationId(locationId)) {
    return {
      locationKey: locationId,
      locationName: row.location_name ?? "",
      locationAddress: row.location_address ?? "",
      locationLat: row.location_lat != null ? String(row.location_lat) : "",
      locationLng: row.location_lng != null ? String(row.location_lng) : "",
    };
  }
  const key = row.location_key && isCampusLocationKey(row.location_key) ? row.location_key : "";
  if (key && key !== "other") {
    const preset = getCampusLocationPreset(key);
    return {
      locationKey: key,
      locationName: preset.label,
      locationAddress: preset.address,
      locationLat: String(preset.latitude),
      locationLng: String(preset.longitude),
    };
  }
  if (key === "other") {
    return {
      locationKey: "other",
      locationName: row.location_name ?? "",
      locationAddress: row.location_address ?? "",
      locationLat: row.location_lat != null ? String(row.location_lat) : "",
      locationLng: row.location_lng != null ? String(row.location_lng) : "",
    };
  }
  if (row.location_name) {
    return {
      locationKey: "other",
      locationName: row.location_name,
      locationAddress: row.location_address ?? "",
      locationLat: row.location_lat != null ? String(row.location_lat) : "",
      locationLng: row.location_lng != null ? String(row.location_lng) : "",
    };
  }
  return { ...EMPTY_CAMPUS_LOCATION_FORM };
}

export function defaultCampusLocationForTemplate(args: {
  defaultMapEnabled?: boolean;
  defaultLocationKey?: CampusLocationKey;
  templateName?: string;
}): CampusLocationFormState {
  if (!args.defaultMapEnabled) return { ...EMPTY_CAMPUS_LOCATION_FORM };
  if (args.defaultLocationKey && isCampusLocationKey(args.defaultLocationKey)) {
    return campusLocationFormFromRow({ location_key: args.defaultLocationKey });
  }
  const name = (args.templateName ?? "").toLowerCase();
  if (name.includes("library")) return campusLocationFormFromRow({ location_key: "library" });
  if (name.includes("gym") || name.includes("rec")) return campusLocationFormFromRow({ location_key: "mackal_rec_center" });
  if (name.includes("union")) return campusLocationFormFromRow({ location_key: "memorial_union" });
  if (name.includes("quad")) return campusLocationFormFromRow({ location_key: "quad" });
  return campusLocationFormFromRow({ location_key: "memorial_union" });
}
