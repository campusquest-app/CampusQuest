"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { CampusLocationId } from "@/lib/locations/registry";
import { useCampusLocations } from "@/lib/client/campusLocationsClient";
import { fetchCampusMemoryGroups } from "@/lib/client/campusMemoriesClient";
import { subscribeCampusMemoriesChanged } from "@/lib/client/campusMemoriesSync";

/** Clean white line icon per campus location (MapPin fallback for any future id). */
const LOCATION_ICONS: Partial<Record<CampusLocationId, LucideIcon>> = {
  "memorial-union": Landmark,
  library: BookOpen,
  "rec-center": Dumbbell,
  "engineering-hall": Cpu,
  "the-quad": Trees,
  "dining-hall": UtensilsCrossed,
  "butterfield-dining": UtensilsCrossed,
  "mainfare-dining": UtensilsCrossed,
  "rams-den": UtensilsCrossed,
};

/** Live count copy — only when recent/active memories exist. */
function liveCountLabel(group: CampusMemoryGroup): string | null {
  if (!group.hasRecent || group.count <= 0) return null;
  return `${group.count} live`;
}

/** Tiny optional haptic tick so bubble taps feel physical on mobile. */
function hapticTap(): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate(8);
  } catch {
    /* optional */
  }
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

/** Preview image inside a bubble: latest photo, then author avatar, then icon. */
function tileThumbSrc(group: CampusMemoryGroup | null): string | null {
  if (!group) return null;
  if (group.latestMediaType === "image" && group.latestPreview) return group.latestPreview;
  if (group.latestAuthorAvatar) return group.latestAuthorAvatar;
  return null;
}

/** Three orbiting sparkle particles rendered on live (fresh + unviewed) rings. */
function RingSparkles() {
  return (
    <span className="cq-memories-ring-orbit" aria-hidden>
      <span className="cq-memories-ring-spark cq-memories-ring-spark--1" />
      <span className="cq-memories-ring-spark cq-memories-ring-spark--2" />
      <span className="cq-memories-ring-spark cq-memories-ring-spark--3" />
    </span>
  );
}

const MemoryTile = memo(function MemoryTile({
  tile,
  viewed,
  onOpen,
  onAdd,
}: {
  tile: RowTile;
  viewed: boolean;
  onOpen: (group: CampusMemoryGroup) => void;
  onAdd: (locationId: CampusLocationId) => void;
}) {
  const { group, active, Icon } = tile;
  const recent = Boolean(group?.hasRecent);
  // Live ring only pulses for fresh, not-yet-viewed memories.
  const live = recent && !viewed;
  const thumb = active ? tileThumbSrc(group) : null;
  const liveLabel = group ? liveCountLabel(group) : null;
  const ariaLabel =
    active && group
      ? `${tile.label}${liveLabel ? `, ${liveLabel}` : ""}${viewed ? ", viewed" : ""}`
      : `${tile.label}, add a Memory`;

  const handleClick = useCallback(() => {
    hapticTap();
    if (active && group) onOpen(group);
    else onAdd(tile.locationId);
  }, [active, group, onOpen, onAdd, tile.locationId]);

  return (
    <button
      type="button"
      className={`cq-memories-tile${active ? " cq-memories-tile--active" : ""}${
        active && viewed ? " cq-memories-tile--viewed" : ""
      }${live ? " cq-memories-tile--live" : ""}`}
      onClick={handleClick}
      aria-label={ariaLabel}
    >
      <span className="cq-memories-tile-ring" aria-hidden>
        <span className="cq-memories-ring-spin" />
        <span className="cq-memories-tile-icon-wrap">
          {thumb ? (
            <img
              className="cq-memories-tile-thumb"
              src={thumb}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          ) : (
            <Icon className="cq-memories-tile-icon" strokeWidth={2.25} aria-hidden />
          )}
        </span>
        {live ? <RingSparkles /> : null}
        {live ? <span className="cq-memories-live-dot" aria-hidden /> : null}
      </span>
      <span className="cq-memories-tile-label">{tile.label}</span>
      {liveLabel ? <span className="cq-memories-tile-count">{liveLabel}</span> : null}
    </button>
  );
});

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
  const { locations: campusLocations, loading: locationsLoading } = useCampusLocations();

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

  const handleAddAt = useCallback(
    (locationId: CampusLocationId) => onAddMemory(locationId),
    [onAddMemory],
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
      setGroups(Array.isArray(data) ? data : []);
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

  // Warm the browser cache for every visible bubble preview so opening a
  // memory (and scrolling the row) never pops in images.
  useEffect(() => {
    if (typeof window === "undefined") return;
    for (const group of groups) {
      const src = tileThumbSrc(group);
      if (src) {
        const img = new window.Image();
        img.decoding = "async";
        img.src = src;
      }
    }
  }, [groups]);

  // One tile per catalog location, in catalog sort order (Quad → Butterfield →
  // Mainfare → Union → …). Live cover/count state comes from real memory groups — never
  // invent posts. Keep horizontal scroll order stable on mobile.
  const tiles = useMemo<RowTile[]>(() => {
    const byLocation = new Map<string, CampusMemoryGroup>();
    for (const group of groups) byLocation.set(group.locationId, group);

    return [...campusLocations]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map((loc) => {
        const group = byLocation.get(loc.slug) ?? null;
        return {
          locationId: loc.slug as CampusLocationId,
          label: loc.shortLabel || loc.name,
          Icon: LOCATION_ICONS[loc.slug as CampusLocationId] ?? MapPin,
          group,
          active: Boolean(group && group.count > 0),
        };
      });
  }, [groups, campusLocations]);

  // "Your Memory" — always the first item in the carousel, Instagram-style.
  const yourMemoryTile = (
    <button
      type="button"
      className="cq-memories-tile cq-memories-tile--add"
      onClick={() => {
        hapticTap();
        onAddMemory();
      }}
      aria-label="Add your Memory"
    >
      <span className="cq-memories-tile-ring cq-memories-tile-ring--add" aria-hidden>
        <span className="cq-memories-ring-spin" />
        <span className="cq-memories-tile-icon-wrap">
          <Plus className="cq-memories-tile-icon cq-memories-tile-icon--add" strokeWidth={2.75} aria-hidden />
        </span>
        <span className="cq-memories-add-badge">
          <Plus strokeWidth={3.5} aria-hidden />
        </span>
      </span>
      <span className="cq-memories-tile-label">Your Memory</span>
      <span className="cq-memories-tile-count" aria-hidden />
    </button>
  );

  if (loading || (locationsLoading && tiles.length === 0)) {
    return (
      <section className="cq-memories-row" aria-label="Campus Memories" aria-busy="true">
        <div className="cq-memories-scroll cq-memories-scroll--loading" aria-hidden data-cq-horizontal-scroll="true">
          <div className="cq-memories-track">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="cq-memories-tile cq-memories-tile--placeholder">
                <span className="cq-memories-tile--skeleton" />
                <span className="cq-memories-skeleton-label" />
              </div>
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
          {yourMemoryTile}
          {tiles.map((tile) => (
            <MemoryTile
              key={tile.locationId}
              tile={tile}
              viewed={Boolean(tile.group && viewedMap[tile.group.locationId] === tile.group.latestCreatedAt)}
              onOpen={handleOpenGroup}
              onAdd={handleAddAt}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
