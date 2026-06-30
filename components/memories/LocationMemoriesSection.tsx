"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, Plus } from "lucide-react";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import type { CampusMemory, CampusMemoryGroup } from "@/lib/types";
import type { CampusLocationId } from "@/lib/locations/registry";
import { getCampusLocation } from "@/lib/locations/registry";
import {
  fetchCampusMemoriesByLocation,
} from "@/lib/client/campusMemoriesClient";
import { subscribeCampusMemoriesChanged } from "@/lib/client/campusMemoriesSync";

function isImageUrl(value: string | null | undefined): boolean {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function memoryPreview(memory: CampusMemory): string | null {
  if (memory.mediaType === "image" && isImageUrl(memory.mediaUrl)) return memory.mediaUrl;
  return memory.authorAvatar || null;
}

function toMemoryGroup(locationId: CampusLocationId, memories: CampusMemory[]): CampusMemoryGroup {
  const latest = memories[memories.length - 1];
  const recentCutoff = Date.now() - 2 * 60 * 60 * 1000;
  const hasRecent = memories.some((m) => Date.parse(m.createdAt) >= recentCutoff);
  const loc = getCampusLocation(locationId);
  return {
    locationId,
    locationKey: loc.legacyCampusKey ?? locationId,
    locationName: latest?.locationName ?? loc.name,
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
  activeCount = 0,
  archivedCount = 0,
  onOpenViewer,
  onAddMemory,
}: {
  locationId: CampusLocationId;
  locationName: string;
  activeCount?: number;
  archivedCount?: number;
  onOpenViewer: (group: CampusMemoryGroup, initialMemoryId?: string) => void;
  onAddMemory: (locationId: CampusLocationId) => void;
}) {
  const [memories, setMemories] = useState<CampusMemory[]>([]);
  const [loading, setLoading] = useState(true);

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
    void load();
  }, [load]);

  useEffect(() => subscribeCampusMemoriesChanged(() => void load()), [load]);

  const todayMemories = useMemo(() => {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    return memories.filter((m) => Date.parse(m.createdAt) >= dayStart.getTime());
  }, [memories]);

  const recentMemories = useMemo(() => {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    return memories.filter((m) => Date.parse(m.createdAt) < dayStart.getTime());
  }, [memories]);

  const group = useMemo(() => toMemoryGroup(locationId, memories), [locationId, memories]);

  if (loading) {
    return <p className="cq-realm-memories-empty">Loading Memories…</p>;
  }

  if (memories.length === 0) {
    return (
      <div className="cq-realm-memories-empty-state">
        <p>No memories have been captured here yet.</p>
        <button type="button" className="cq-realm-memories-cta" onClick={() => onAddMemory(locationId)}>
          Capture the First Memory
        </button>
      </div>
    );
  }

  return (
    <div className="cq-realm-memories">
      <div className="cq-realm-memories-stats" aria-label="Memory counts">
        <span>{activeCount || memories.length} live</span>
        {archivedCount > 0 ? <span>{archivedCount} archived</span> : null}
        <span>{(activeCount || memories.length) + archivedCount} total</span>
      </div>

      {todayMemories.length > 0 ? (
        <section className="cq-realm-memories-section">
          <h3 className="cq-realm-memories-section-title">Today&apos;s Memories</h3>
          <MemoryThumbRow
            memories={todayMemories}
            onSelect={(memory) => onOpenViewer(group, memory.id)}
          />
        </section>
      ) : null}

      {recentMemories.length > 0 ? (
        <section className="cq-realm-memories-section">
          <h3 className="cq-realm-memories-section-title">Recent Memories</h3>
          <MemoryThumbRow
            memories={recentMemories}
            onSelect={(memory) => onOpenViewer(group, memory.id)}
          />
        </section>
      ) : todayMemories.length === 0 ? (
        <section className="cq-realm-memories-section">
          <h3 className="cq-realm-memories-section-title">Recent Memories</h3>
          <MemoryThumbRow memories={memories} onSelect={(memory) => onOpenViewer(group, memory.id)} />
        </section>
      ) : null}

      <div className="cq-realm-memories-actions">
        <button
          type="button"
          className="cq-realm-memories-view-all"
          onClick={() => onOpenViewer(group)}
        >
          <MapPin className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
          View all at {locationName}
        </button>
        <button type="button" className="cq-realm-memories-add" onClick={() => onAddMemory(locationId)}>
          <Plus className="h-4 w-4" strokeWidth={2.4} aria-hidden />
          Add Memory
        </button>
      </div>
    </div>
  );
}

function MemoryThumbRow({
  memories,
  onSelect,
}: {
  memories: CampusMemory[];
  onSelect: (memory: CampusMemory) => void;
}) {
  return (
    <div className="cq-realm-memories-scroll" data-cq-horizontal-scroll="true">
      {memories.map((memory) => {
        const preview = memoryPreview(memory);
        const showImage = memory.mediaType === "image" && isImageUrl(memory.mediaUrl);
        return (
          <button
            key={memory.id}
            type="button"
            className="cq-realm-memories-thumb"
            onClick={() => onSelect(memory)}
            aria-label={`Memory by ${memory.displayName}`}
          >
            {showImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={memory.mediaUrl!} alt="" className="cq-realm-memories-thumb-img" loading="lazy" />
            ) : preview ? (
              <AvatarDisplay avatar={preview} size={52} className="rounded-full" />
            ) : (
              <span className="cq-realm-memories-thumb-text">{memory.body?.slice(0, 40) ?? "…"}</span>
            )}
            <span className="cq-realm-memories-thumb-meta">{memory.postedAgoLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
