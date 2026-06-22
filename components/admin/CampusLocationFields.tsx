"use client";

import {
  CAMPUS_LOCATION_OPTIONS,
  getCampusLocationPreset,
  type CampusLocationFormState,
  type CampusLocationKey,
} from "@/lib/campusLocations";

type CampusLocationFieldsProps = {
  value: CampusLocationFormState;
  onChange: (next: CampusLocationFormState) => void;
  className?: string;
  labelClassName?: string;
  inputClassName?: string;
};

export function CampusLocationFields({
  value,
  onChange,
  className = "",
  labelClassName = "text-xs text-white/50",
  inputClassName = "mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white",
}: CampusLocationFieldsProps) {
  const isOther = value.locationKey === "other";

  return (
    <div className={`space-y-3 ${className}`}>
      <label className={`block ${labelClassName}`}>
        Campus location
        <select
          className={inputClassName}
          value={value.locationKey}
          onChange={(e) => {
            const nextKey = e.target.value as CampusLocationKey | "";
            if (!nextKey) {
              onChange({ locationKey: "", locationName: "", locationAddress: "", locationLat: "", locationLng: "" });
              return;
            }
            if (nextKey === "other") {
              onChange({ ...value, locationKey: "other" });
              return;
            }
            const preset = getCampusLocationPreset(nextKey);
            onChange({
              locationKey: nextKey,
              locationName: preset.label,
              locationAddress: preset.address,
              locationLat: String(preset.latitude),
              locationLng: String(preset.longitude),
            });
          }}
        >
          <option value="">No map location</option>
          {CAMPUS_LOCATION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      {value.locationKey && value.locationKey !== "other" ? (
        <p className="text-[11px] text-white/45">
          Map pin uses preset coordinates for {value.locationName || "this location"}.
        </p>
      ) : null}

      {isOther ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={`block sm:col-span-2 ${labelClassName}`}>
            Location name
            <input
              className={inputClassName}
              value={value.locationName}
              onChange={(e) => onChange({ ...value, locationName: e.target.value })}
              placeholder="Custom location name"
            />
          </label>
          <label className={`block sm:col-span-2 ${labelClassName}`}>
            Address
            <input
              className={inputClassName}
              value={value.locationAddress}
              onChange={(e) => onChange({ ...value, locationAddress: e.target.value })}
              placeholder="Street address (optional)"
            />
          </label>
          <label className={`block ${labelClassName}`}>
            Latitude (optional)
            <input
              className={inputClassName}
              value={value.locationLat}
              onChange={(e) => onChange({ ...value, locationLat: e.target.value })}
              placeholder="41.4868"
            />
          </label>
          <label className={`block ${labelClassName}`}>
            Longitude (optional)
            <input
              className={inputClassName}
              value={value.locationLng}
              onChange={(e) => onChange({ ...value, locationLng: e.target.value })}
              placeholder="-71.5301"
            />
          </label>
          <p className="sm:col-span-2 text-[11px] text-white/45">
            Custom locations appear on the map only when valid latitude and longitude are provided.
          </p>
        </div>
      ) : null}
    </div>
  );
}
