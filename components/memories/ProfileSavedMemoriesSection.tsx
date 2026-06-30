"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import type { CampusMemory, CampusMemoryGroup } from "@/lib/types";
import { fetchSavedCampusMemories } from "@/lib/client/campusMemoriesClient";
import { subscribeCampusMemoriesChanged } from "@/lib/client/campusMemoriesSync";

type HighlightCollection = {
  locationId: string;
  locationKey: string;
  locationName: string;
  memories: CampusMemory[];
  cover: CampusMemory;
};

/** Group saved memories into per-location "highlight" collections (Instagram style). */
function buildCollections(memories: CampusMemory[]): HighlightCollection[] {
  const byLocation = new Map<string, HighlightCollection>();
  for (const memory of memories) {
    const key = memory.locationId || memory.locationKey;
    const existing = byLocation.get(key);
    if (existing) {
      existing.memories.push(memory);
      // Keep the newest media with an image as the cover when possible.
      if (
        memory.mediaType === "image" &&
        memory.mediaUrl &&
        (existing.cover.mediaType !== "image" || memory.createdAt > existing.cover.createdAt)
      ) {
        existing.cover = memory;
      }
    } else {
      byLocation.set(key, {
        locationId: memory.locationId,
        locationKey: memory.locationKey,
        locationName: memory.locationName,
        memories: [memory],
        cover: memory,
      });
    }
  }
  return Array.from(byLocation.values());
}

export function ProfileSavedMemoriesSection({
  userId,
  onOpenMemory,
}: {
  userId: string;
  onOpenMemory: (group: CampusMemoryGroup, memoryId: string) => void;
}) {
  const [memories, setMemories] = useState<CampusMemory[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const rows = await fetchSavedCampusMemories(userId);
      setMemories(rows);
    } catch {
      setMemories([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => subscribeCampusMemoriesChanged(() => void load()), [load]);

  const collections = useMemo(() => buildCollections(memories), [memories]);

  if (loading || collections.length === 0) return null;

  return (
    <section className="cq-profile-highlights" aria-label="Memory highlights">
      <div className="cq-profile-highlights-scroll" data-cq-horizontal-scroll="true">
        {collections.map((collection) => {
          const cover = collection.cover;
          const latest = collection.memories.reduce(
            (acc, m) => (m.createdAt > acc ? m.createdAt : acc),
            collection.memories[0].createdAt,
          );
          const group: CampusMemoryGroup = {
            locationId: collection.locationId,
            locationKey: collection.locationKey,
            locationName: collection.locationName,
            count: collection.memories.length,
            latestCreatedAt: latest,
            latestPreview: cover.mediaUrl,
            latestMediaType: cover.mediaType,
            latestAuthorAvatar: cover.authorAvatar,
            hasRecent: false,
          };
          return (
            <button
              key={collection.locationId || collection.locationKey}
              type="button"
              className="cq-profile-highlight cq-profile-press"
              onClick={() => onOpenMemory(group, collection.memories[0].id)}
              aria-label={`${collection.locationName}, ${collection.memories.length} ${
                collection.memories.length === 1 ? "memory" : "memories"
              }`}
            >
              <span className="cq-profile-highlight-ring" aria-hidden>
                <span className="cq-profile-highlight-thumb-wrap">
                  {cover.mediaType === "image" && cover.mediaUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover.mediaUrl} alt="" className="cq-profile-highlight-thumb" loading="lazy" />
                  ) : (
                    <span className="cq-profile-highlight-fallback">
                      <MapPin className="h-5 w-5" strokeWidth={2} aria-hidden />
                    </span>
                  )}
                </span>
                {collection.memories.length > 1 ? (
                  <span className="cq-profile-highlight-count" aria-hidden>
                    {collection.memories.length}
                  </span>
                ) : null}
              </span>
              <span className="cq-profile-highlight-label">{collection.locationName}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
