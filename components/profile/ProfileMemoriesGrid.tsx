"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import type { CampusMemory, CampusMemoryGroup } from "@/lib/types";
import { fetchSavedCampusMemories } from "@/lib/client/campusMemoriesClient";
import { subscribeCampusMemoriesChanged } from "@/lib/client/campusMemoriesSync";
import { ScreenDataState } from "@/components/ui/ScreenDataState";

function buildGroupForMemory(memory: CampusMemory, allMemories: CampusMemory[]): CampusMemoryGroup {
  const key = memory.locationId || memory.locationKey;
  const atLocation = allMemories.filter((row) => (row.locationId || row.locationKey) === key);
  const latest = atLocation.reduce(
    (acc, row) => (row.createdAt > acc ? row.createdAt : acc),
    atLocation[0]?.createdAt ?? memory.createdAt,
  );
  const cover =
    atLocation.find((row) => row.mediaType === "image" && row.mediaUrl) ??
    atLocation[0] ??
    memory;

  return {
    locationId: memory.locationId,
    locationKey: memory.locationKey,
    locationName: memory.locationName,
    count: atLocation.length,
    latestCreatedAt: latest,
    latestPreview: cover.mediaUrl,
    latestMediaType: cover.mediaType,
    latestAuthorAvatar: cover.authorAvatar,
    hasRecent: false,
  };
}

function MemoryTile({
  memory,
  allMemories,
  onOpenMemory,
}: {
  memory: CampusMemory;
  allMemories: CampusMemory[];
  onOpenMemory: (group: CampusMemoryGroup, memoryId: string) => void;
}) {
  const reactionCount = Math.max(memory.likeCount, memory.starCount);
  const preview =
    memory.mediaType === "image" && memory.mediaUrl
      ? memory.mediaUrl
      : memory.mediaType === "video" && memory.mediaUrl
        ? memory.mediaUrl
        : null;

  return (
    <button
      type="button"
      className="cq-profile-memory-tile cq-profile-press group relative aspect-square overflow-hidden bg-cq-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-uri-keaney"
      onClick={() => onOpenMemory(buildGroupForMemory(memory, allMemories), memory.id)}
      aria-label={`${memory.locationName} memory`}
    >
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt=""
          className="h-full w-full object-cover transition duration-200 group-active:scale-[0.98]"
          loading="lazy"
          decoding="async"
          fetchPriority="low"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-uri-navy/90 to-black/80 p-2">
          <MapPin className="h-5 w-5 text-uri-keaney/80" strokeWidth={2} aria-hidden />
          {memory.body?.trim() ? (
            <span className="line-clamp-3 text-center text-[10px] font-medium leading-snug text-white/80">
              {memory.body.trim()}
            </span>
          ) : null}
        </div>
      )}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-1.5 pb-1.5 pt-6">
        <span className="block truncate text-[10px] font-semibold text-white">{memory.locationName}</span>
      </span>
      {reactionCount > 0 ? (
        <span className="pointer-events-none absolute right-1 top-1 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {memory.starCount > memory.likeCount ? "★" : "♥"} {reactionCount}
        </span>
      ) : null}
    </button>
  );
}

export function ProfileMemoriesGrid({
  userId,
  onOpenMemory,
}: {
  userId: string;
  onOpenMemory: (group: CampusMemoryGroup, memoryId: string) => void;
}) {
  const [memories, setMemories] = useState<CampusMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await fetchSavedCampusMemories(userId);
      setMemories(rows);
    } catch (loadError) {
      setMemories([]);
      setError(loadError instanceof Error ? loadError.message : "Could not load memories.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => subscribeCampusMemoriesChanged(() => void load()), [load]);

  const sortedMemories = useMemo(
    () => [...memories].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [memories],
  );

  if (loading) {
    return (
      <div className="cq-profile-memories-grid" aria-busy="true" aria-label="Loading memories">
        {Array.from({ length: 9 }).map((_, index) => (
          <div key={index} className="cq-profile-memory-tile cq-skeleton aspect-square" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-8">
        <ScreenDataState variant="error" message="Could not load memories." detail={error} onRetry={() => void load()} compact />
      </div>
    );
  }

  if (sortedMemories.length === 0) {
    return (
      <div className="px-4 py-8">
        <ScreenDataState
          variant="empty"
          message="No saved memories yet"
          detail="Star campus memories to save them here."
          compact
        />
      </div>
    );
  }

  return (
    <div className="cq-profile-memories-grid">
      {sortedMemories.map((memory) => (
        <MemoryTile
          key={memory.id}
          memory={memory}
          allMemories={sortedMemories}
          onOpenMemory={onOpenMemory}
        />
      ))}
    </div>
  );
}
