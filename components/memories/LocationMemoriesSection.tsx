"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Heart, Play } from "lucide-react";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import type { CampusMemory, CampusMemoryGroup } from "@/lib/types";
import type { CampusLocationId } from "@/lib/locations/registry";
import { getCampusLocationName, tryGetCampusLocation } from "@/lib/locations/registry";
import { fetchCampusMemoriesByLocation } from "@/lib/client/campusMemoriesClient";
import { subscribeCampusMemoriesChanged } from "@/lib/client/campusMemoriesSync";

function isImageUrl(value: string | null | undefined): boolean {
  return typeof value === "string" && /^https?:\/\//i.test(value);
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

  const openMemory = useCallback(
    (memory: CampusMemory) => {
      onOpenViewer(group, memory.id, true);
    },
    [group, onOpenViewer],
  );

  const openAll = useCallback(() => {
    onOpenGallery(locationId);
  }, [locationId, onOpenGallery]);

  return (
    <section className="cq-loc-section cq-loc-memories cq-realm-fade-in" aria-label="Memories">
      <div className="cq-loc-section-head">
        <h3 className="cq-loc-section-title">Memories</h3>
        {sortedMemories.length > 0 ? (
          <button type="button" className="cq-loc-section-link" onClick={openAll}>
            See all
          </button>
        ) : null}
      </div>

      <div
        className="cq-loc-memory-rail"
        ref={attachScroller}
        data-cq-horizontal-scroll="true"
      >
        <div className="cq-loc-memory-track">
          {loading
            ? Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="cq-loc-memory-card cq-loc-memory-card--skeleton" aria-hidden />
              ))
            : sortedMemories.map((memory) => {
                const showImage = memory.mediaType === "image" && isImageUrl(memory.mediaUrl);
                const showVideo = memory.mediaType === "video" && isImageUrl(memory.mediaUrl);
                const caption = memory.body?.trim() || `Memory by ${memory.displayName}`;
                return (
                  <button
                    key={memory.id}
                    type="button"
                    className="cq-loc-memory-card touch-manipulation"
                    onClick={() => openMemory(memory)}
                    aria-label={`${caption}, ${memory.postedAgoLabel}`}
                  >
                    <span className="cq-loc-memory-media" aria-hidden>
                      {showImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={memory.mediaUrl!} alt="" loading="lazy" decoding="async" />
                      ) : showVideo ? (
                        <>
                          <video src={memory.mediaUrl!} preload="metadata" muted playsInline aria-hidden />
                          <span className="cq-loc-memory-video-badge">
                            <Play className="h-3.5 w-3.5" fill="currentColor" aria-hidden />
                          </span>
                        </>
                      ) : (
                        <span className="cq-loc-memory-media-fallback">{caption.slice(0, 40)}</span>
                      )}
                      <span className="cq-loc-memory-gradient" />
                    </span>
                    {memory.authorAvatar ? (
                      <span className="cq-loc-memory-avatar">
                        <AvatarDisplay avatar={memory.authorAvatar} fitParent size={28} />
                      </span>
                    ) : null}
                    <span className="cq-loc-memory-footer">
                      <span className="cq-loc-memory-caption">{caption}</span>
                      <span className="cq-loc-memory-meta">
                        <span>{memory.postedAgoLabel}</span>
                        <span className="cq-loc-memory-likes">
                          <Heart className="h-3 w-3" strokeWidth={2.2} aria-hidden />
                          {memory.likeCount}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}

          <button
            type="button"
            className="cq-loc-memory-card cq-loc-memory-card--add touch-manipulation"
            onClick={() => onAddMemory(locationId)}
          >
            <Camera className="h-6 w-6" strokeWidth={2} aria-hidden />
            <span className="cq-loc-memory-add-copy">
              Add Your
              <strong>Memory</strong>
            </span>
          </button>
        </div>
      </div>
      <p className="sr-only">Memories at {locationName}</p>
    </section>
  );
}
