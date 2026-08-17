"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import type { CampusMemory, CampusMemoryGroup } from "@/lib/types";
import type { CampusLocationId } from "@/lib/locations/registry";
import { getCampusLocationName, tryGetCampusLocation } from "@/lib/locations/registry";
import { fetchCampusMemoriesByLocation } from "@/lib/client/campusMemoriesClient";
import { subscribeCampusMemoriesChanged } from "@/lib/client/campusMemoriesSync";

const VIEWED_STORAGE_KEY = "cq:realm-location-memory-viewed";
const STORY_VIEW_ALL_THRESHOLD = 5;

function isImageUrl(value: string | null | undefined): boolean {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function memoryPreview(memory: CampusMemory): string | null {
  if (memory.mediaType === "image" && isImageUrl(memory.mediaUrl)) return memory.mediaUrl;
  return memory.authorAvatar || null;
}

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
    /* non-blocking */
  }
}

function toMemoryGroup(
  locationId: CampusLocationId,
  memories: CampusMemory[],
  fallbackName: string,
): CampusMemoryGroup {
  const latest = memories[0];
  const recentCutoff = Date.now() - 2 * 60 * 60 * 1000;
  const hasRecent = memories.some((m) => {
    const ts = Date.parse(m.createdAt);
    return Number.isFinite(ts) && ts >= recentCutoff;
  });
  const loc = tryGetCampusLocation(locationId);
  return {
    locationId,
    locationKey: loc?.legacyCampusKey ?? locationId,
    locationName: latest?.locationName ?? loc?.name ?? fallbackName ?? getCampusLocationName(locationId),
    count: memories.length,
    latestCreatedAt: latest?.createdAt ?? new Date().toISOString(),
    latestPreview:
      latest?.mediaType === "image" && latest.mediaUrl
        ? latest.mediaUrl
        : (latest?.body?.trim().slice(0, 80) ?? null),
    latestMediaType: latest?.mediaType ?? null,
    latestAuthorAvatar: latest?.authorAvatar ?? null,
    hasRecent,
  };
}

export function LocationMemoriesSection({
  locationId,
  locationName,
  onOpenViewer,
  onOpenGallery,
  onAddMemory,
}: {
  locationId: CampusLocationId;
  locationName: string;
  onOpenViewer: (group: CampusMemoryGroup, initialMemoryId?: string, includeExpired?: boolean) => void;
  onOpenGallery: (locationId: CampusLocationId) => void;
  onAddMemory: (locationId: CampusLocationId) => void;
}) {
  const [memories, setMemories] = useState<CampusMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewedMap, setViewedMap] = useState<Record<string, string>>({});

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
      const rows = await fetchCampusMemoriesByLocation(locationId);
      setMemories(rows);
    } catch {
      setMemories([]);
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    setViewedMap(readViewedMap());
  }, []);

  useEffect(() => {
    // Show skeletons (not the previous location's memories) while switching locations.
    setLoading(true);
    setMemories([]);
    void load();
  }, [load]);

  useEffect(() => subscribeCampusMemoriesChanged(() => void load()), [load]);

  const sortedMemories = useMemo(
    () => [...memories].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [memories],
  );

  const group = useMemo(
    () => toMemoryGroup(locationId, sortedMemories, locationName),
    [locationId, locationName, sortedMemories],
  );

  const markViewed = useCallback((memory: CampusMemory) => {
    setViewedMap((prev) => {
      if (prev[memory.id] === memory.createdAt) return prev;
      const next = { ...prev, [memory.id]: memory.createdAt };
      writeViewedMap(next);
      return next;
    });
  }, []);

  const openMemory = useCallback(
    (memory: CampusMemory) => {
      markViewed(memory);
      onOpenViewer(group, memory.id, true);
    },
    [group, markViewed, onOpenViewer],
  );

  const openAll = useCallback(() => {
    onOpenGallery(locationId);
  }, [locationId, onOpenGallery]);

  if (loading) {
    return (
      <section className="cq-realm-memories-hero cq-realm-memories-hero--loading" aria-busy="true">
        <div className="cq-realm-memory-stories-scroll" aria-hidden>
          <div className="cq-realm-memory-stories-track">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="cq-realm-memory-story cq-realm-memory-story--skeleton" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (sortedMemories.length === 0) {
    return (
      <section
        className="cq-realm-memories-hero cq-realm-memories-hero--empty cq-realm-fade-in"
        aria-labelledby="location-memories-title"
      >
        <h3 id="location-memories-title" className="cq-realm-memories-hero-title">
          Memories
        </h3>
        <div className="cq-realm-memories-empty-compact">
          <p>No memories here yet.</p>
          <button type="button" className="cq-realm-memories-empty-action" onClick={() => onAddMemory(locationId)}>
            <Camera className="h-4 w-4" strokeWidth={2.2} aria-hidden />
            Add Memory
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="cq-realm-memories-hero cq-realm-fade-in" aria-label="Memories">
      <div className="cq-realm-memories-hero-head">
        <h3 className="cq-realm-memories-hero-title">Memories</h3>
        {sortedMemories.length > STORY_VIEW_ALL_THRESHOLD ? (
          <button type="button" className="cq-realm-memories-hero-link" onClick={openAll}>
            View All
          </button>
        ) : null}
      </div>

      <div
        className="cq-realm-memory-stories-scroll"
        ref={attachScroller}
        data-cq-horizontal-scroll="true"
      >
        <div className="cq-realm-memory-stories-track">
          {sortedMemories.map((memory) => {
            const preview = memoryPreview(memory);
            const showImage = memory.mediaType === "image" && isImageUrl(memory.mediaUrl);
            const viewed = viewedMap[memory.id] === memory.createdAt;
            const recentCutoff = Date.now() - 2 * 60 * 60 * 1000;
            const isLive = Date.parse(memory.createdAt) >= recentCutoff && !viewed;

            return (
              <button
                key={memory.id}
                type="button"
                className={`cq-realm-memory-story${viewed ? " cq-realm-memory-story--viewed" : ""}${
                  isLive ? " cq-realm-memory-story--live" : ""
                }`}
                onClick={() => openMemory(memory)}
                aria-label={`Memory by ${memory.displayName}, ${memory.postedAgoLabel}`}
              >
                <span className="cq-realm-memory-story-ring" aria-hidden>
                  <span className="cq-realm-memory-story-thumb-wrap">
                    {showImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={memory.mediaUrl!}
                        alt=""
                        className="cq-realm-memory-story-thumb"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : preview ? (
                      <AvatarDisplay avatar={preview} fitParent size={64} />
                    ) : (
                      <span className="cq-realm-memory-story-fallback">
                        {memory.body?.slice(0, 24) ?? "…"}
                      </span>
                    )}
                  </span>
                </span>
                <span className="cq-realm-memory-story-time">{memory.postedAgoLabel}</span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="sr-only">Memories at {locationName}</p>
    </section>
  );
}
