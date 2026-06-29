"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  Building2,
  Compass,
  Dumbbell,
  GraduationCap,
  Home,
  MapPin,
  Navigation,
  Plus,
  Trophy,
  UtensilsCrossed,
} from "lucide-react";
import type { CampusMemoryGroup } from "@/lib/types";
import type { CampusLocationKey } from "@/lib/campusLocations";
import { CAMPUS_LOCATION_PRESETS } from "@/lib/campusLocations";
import { fetchCampusMemoryGroups } from "@/lib/client/campusMemoriesClient";

const FEATURED_KEYS: CampusLocationKey[] = [
  "quad",
  "memorial_union",
  "library",
  "mackal_rec_center",
  "dining_hall",
  "other",
];

function locationIcon(key: string) {
  switch (key) {
    case "quad":
      return Compass;
    case "library":
      return BookOpen;
    case "memorial_union":
      return Building2;
    case "mackal_rec_center":
      return Dumbbell;
    case "dining_hall":
      return UtensilsCrossed;
    case "ryan_center":
      return Trophy;
    case "dorm_residence":
      return Home;
    case "academic_building":
      return GraduationCap;
    case "other":
      return Navigation;
    default:
      return MapPin;
  }
}

function displayLabel(key: string, fallback: string): string {
  if (key === "other") return "Nearby";
  if (key === "mackal_rec_center") return "Rec Center";
  return fallback;
}

function countLabel(group: CampusMemoryGroup): string {
  if (group.hasRecent) return `${group.count} live`;
  return `${group.count} today`;
}

export function CampusMemoriesRow({
  onOpenGroup,
  onAddMemory,
}: {
  onOpenGroup: (group: CampusMemoryGroup) => void;
  onAddMemory: () => void;
}) {
  const [groups, setGroups] = useState<CampusMemoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchCampusMemoryGroups();
      setGroups(data);
    } catch {
      setError("Memories unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const presetByKey = new Map(CAMPUS_LOCATION_PRESETS.map((p) => [p.key, p]));
  const groupByKey = new Map(groups.map((g) => [g.locationKey, g]));

  const tiles: CampusMemoryGroup[] = FEATURED_KEYS.map((key) => {
    const existing = groupByKey.get(key);
    if (existing) return existing;
    const preset = presetByKey.get(key);
    return {
      locationKey: key,
      locationName: preset?.label ?? key,
      count: 0,
      latestCreatedAt: "",
      latestPreview: null,
      latestMediaType: null,
      hasRecent: false,
    };
  });

  return (
    <section className="cq-memories-row" aria-label="Campus Memories">
      <div className="cq-memories-row-head">
        <h3 className="cq-memories-row-title">Memories</h3>
        <button type="button" className="cq-memories-add-btn" onClick={onAddMemory}>
          <Plus className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
          <span>Add</span>
        </button>
      </div>

      {loading ? (
        <div className="cq-memories-scroll cq-memories-scroll--loading" aria-hidden>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="cq-memories-tile cq-memories-tile--skeleton" />
          ))}
        </div>
      ) : error ? (
        <p className="cq-memories-empty cq-memories-empty--error">{error}</p>
      ) : (
        <div className="cq-memories-scroll">
          {tiles.map((group) => {
            const Icon = locationIcon(group.locationKey);
            const label = displayLabel(group.locationKey, group.locationName);
            const active = group.count > 0;
            const recent = group.hasRecent;
            return (
              <button
                key={group.locationKey}
                type="button"
                className={`cq-memories-tile${active ? " cq-memories-tile--active" : ""}${recent ? " cq-memories-tile--recent" : ""}`}
                onClick={() => (active ? onOpenGroup(group) : onAddMemory())}
                aria-label={`${label}${active ? `, ${countLabel(group)}` : ", no live memories"}`}
              >
                <span className="cq-memories-tile-ring" aria-hidden>
                  <span className="cq-memories-tile-icon-wrap">
                    <Icon className="cq-memories-tile-icon" strokeWidth={2} aria-hidden />
                  </span>
                  {recent ? <span className="cq-memories-live-dot" aria-hidden /> : null}
                </span>
                <span className="cq-memories-tile-label">{label}</span>
                {active ? (
                  <span className="cq-memories-tile-count">{countLabel(group)}</span>
                ) : (
                  <span className="cq-memories-tile-count cq-memories-tile-count--muted">—</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {!loading && !error && groups.length === 0 ? (
        <p className="cq-memories-empty">
          No live Memories yet. <button type="button" onClick={onAddMemory}>Add the first campus Memory</button>
        </p>
      ) : null}
    </section>
  );
}
