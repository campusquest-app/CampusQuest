"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Cpu,
  Dumbbell,
  Landmark,
  MapPin,
  Plus,
  Trees,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import type { CampusMemoryGroup } from "@/lib/types";
import { CAMPUS_MEMORY_LOCATION_OPTIONS, getCampusLocation } from "@/lib/locations/registry";
import type { CampusLocationId } from "@/lib/locations/registry";
import { fetchCampusMemoryGroups } from "@/lib/client/campusMemoriesClient";
import { subscribeCampusMemoriesChanged } from "@/lib/client/campusMemoriesSync";

/** Clean white line icon per campus location (MapPin fallback for any future id). */
const LOCATION_ICONS: Partial<Record<CampusLocationId, LucideIcon>> = {
  "memorial-union": Landmark,
  library: BookOpen,
  "rec-center": Dumbbell,
  "engineering-hall": Cpu,
  "the-quad": Trees,
  "rams-den": UtensilsCrossed,
};

function countLabel(group: CampusMemoryGroup): string {
  if (group.hasRecent) return `${group.count} live`;
  return `${group.count} today`;
}

/**
 * Lightweight client-side "story seen" tracking (Instagram-style). A location is
 * considered viewed once its newest memory timestamp has been opened. Stored in
 * localStorage so the ring dims after viewing without any backend changes.
 */
const VIEWED_STORAGE_KEY = "cq:campus-memories-viewed";

function readViewedMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(VIEWED_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeViewedMap(map: Record<string, string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VIEWED_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* storage full / unavailable — non-blocking */
  }
}

type RowTile = {
  locationId: CampusLocationId;
  label: string;
  Icon: LucideIcon;
  group: CampusMemoryGroup | null;
  active: boolean;
};

export function CampusMemoriesRow({
  onOpenGroup,
  onAddMemory,
}: {
  onOpenGroup: (group: CampusMemoryGroup) => void;
  onAddMemory: (locationId?: CampusLocationId) => void;
}) {
  const [groups, setGroups] = useState<CampusMemoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewedMap, setViewedMap] = useState<Record<string, string>>({});

  useEffect(() => {
    setViewedMap(readViewedMap());
  }, []);

  const markGroupViewed = useCallback((group: CampusMemoryGroup) => {
    setViewedMap((prev) => {
      if (prev[group.locationId] === group.latestCreatedAt) return prev;
      const next = { ...prev, [group.locationId]: group.latestCreatedAt };
      writeViewedMap(next);
      return next;
    });
  }, []);

  const handleOpenGroup = useCallback(
    (group: CampusMemoryGroup) => {
      markGroupViewed(group);
      onOpenGroup(group);
    },
    [markGroupViewed, onOpenGroup],
  );

  // Convert vertical wheel/trackpad movement into horizontal scroll (Instagram
  // Stories feel). A callback ref is used so the non-passive listener re-attaches
  // cleanly across the loading → loaded transition and is torn down on unmount.
  const wheelCleanupRef = useRef<(() => void) | null>(null);
  const attachScroller = useCallback((node: HTMLDivElement | null) => {
    if (wheelCleanupRef.current) {
      wheelCleanupRef.current();
      wheelCleanupRef.current = null;
    }
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        node.scrollLeft += event.deltaY;
        event.preventDefault();
      }
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    wheelCleanupRef.current = () => node.removeEventListener("wheel", onWheel);
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await fetchCampusMemoryGroups();
      setGroups(Array.isArray(data) ? data.filter((g) => g && g.count > 0) : []);
    } catch {
      // Stay silent — the row simply renders every location as inactive (no error copy).
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => subscribeCampusMemoriesChanged(() => void load()), [load]);

  // Build one tile per canonical campus location from the real memory counts,
  // then order Instagram-style: locations with live memories first (keeping the
  // original campus order within each group), inactive locations after.
  const tiles = useMemo<RowTile[]>(() => {
    const byLocation = new Map<string, CampusMemoryGroup>();
    for (const group of groups) byLocation.set(group.locationId, group);

    const base: RowTile[] = CAMPUS_MEMORY_LOCATION_OPTIONS.map((opt) => {
      const loc = getCampusLocation(opt.id);
      const group = byLocation.get(opt.id) ?? null;
      return {
        locationId: opt.id,
        label: loc.shortLabel || opt.name,
        Icon: LOCATION_ICONS[opt.id] ?? MapPin,
        group,
        active: Boolean(group && group.count > 0),
      };
    });

    const active = base.filter((tile) => tile.active);
    const inactive = base.filter((tile) => !tile.active);
    return [...active, ...inactive];
  }, [groups]);

  // Instagram-style circular "add" item that lives inside the carousel itself.
  const addTile = (
    <button
      type="button"
      className="cq-memories-tile cq-memories-tile--add"
      onClick={() => onAddMemory()}
      aria-label="Add a Memory"
    >
      <span className="cq-memories-tile-ring cq-memories-tile-ring--add" aria-hidden>
        <span className="cq-memories-tile-icon-wrap">
          <Plus className="cq-memories-tile-icon" strokeWidth={2.6} aria-hidden />
        </span>
      </span>
      <span className="cq-memories-tile-label">Add</span>
      <span className="cq-memories-tile-count" aria-hidden />
    </button>
  );

  if (loading) {
    return (
      <section className="cq-memories-row" aria-label="Campus Memories" aria-busy="true">
        <div className="cq-memories-scroll cq-memories-scroll--loading" aria-hidden data-cq-horizontal-scroll="true">
          <div className="cq-memories-track">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="cq-memories-tile cq-memories-tile--skeleton" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="cq-memories-row" aria-label="Campus Memories">
      <div className="cq-memories-scroll" ref={attachScroller} data-cq-horizontal-scroll="true">
        <div className="cq-memories-track">
          {addTile}
          {tiles.map((tile) => {
            const { group, active, Icon } = tile;
            const recent = Boolean(group?.hasRecent);
            // "Seen" once the newest memory timestamp for this location was opened.
            const viewed = Boolean(group && viewedMap[group.locationId] === group.latestCreatedAt);
            // Live ring only pulses for fresh, not-yet-viewed memories.
            const live = recent && !viewed;
            const ariaLabel =
              active && group
                ? `${tile.label}, ${countLabel(group)}${viewed ? ", viewed" : ""}`
                : `${tile.label}, add a Memory`;

            return (
              <button
                key={tile.locationId}
                type="button"
                className={`cq-memories-tile${active ? " cq-memories-tile--active" : ""}${
                  active && viewed ? " cq-memories-tile--viewed" : ""
                }${live ? " cq-memories-tile--live" : ""}`}
                onClick={() => (active && group ? handleOpenGroup(group) : onAddMemory(tile.locationId))}
                aria-label={ariaLabel}
              >
                <span className="cq-memories-tile-ring" aria-hidden>
                  <span className="cq-memories-tile-icon-wrap">
                    <Icon className="cq-memories-tile-icon" strokeWidth={2} aria-hidden />
                  </span>
                  {live ? <span className="cq-memories-live-dot" aria-hidden /> : null}
                </span>
                <span className="cq-memories-tile-label">{tile.label}</span>
                {active && group ? (
                  <span className="cq-memories-tile-count">{countLabel(group)}</span>
                ) : (
                  <span className="cq-memories-tile-count cq-memories-tile-count--muted">–</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
