"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import type { CampusMemory, CampusMemoryArchiveSection } from "@/lib/types";
import type { CampusLocationId } from "@/lib/locations/registry";
import { fetchCampusMemoryArchive } from "@/lib/client/campusMemoriesClient";
import { subscribeCampusMemoriesChanged } from "@/lib/client/campusMemoriesSync";

function formatArchiveDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown date";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function CampusMemoryArchivePanel({
  userId,
  priorityLocationId,
  locationOnly = false,
  onOpenMemory,
}: {
  userId?: string;
  priorityLocationId?: CampusLocationId;
  locationOnly?: boolean;
  onOpenMemory: (memory: CampusMemory) => void;
}) {
  const [sections, setSections] = useState<CampusMemoryArchiveSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const rows = await fetchCampusMemoryArchive(userId);
      setSections(rows);
    } catch {
      setError("Could not load Memory Archive.");
      setSections([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => subscribeCampusMemoriesChanged(() => void load()), [load]);

  const orderedSections = useMemo(() => {
    if (priorityLocationId && locationOnly) {
      return sections.filter((section) => section.locationId === priorityLocationId);
    }
    if (!priorityLocationId) return sections;
    const priority = sections.filter((section) => section.locationId === priorityLocationId);
    const rest = sections.filter((section) => section.locationId !== priorityLocationId);
    return [...priority, ...rest];
  }, [locationOnly, priorityLocationId, sections]);

  if (loading) {
    return (
      <div className="cq-memory-archive-grid cq-memory-archive-grid--loading cq-realm-fade-in" aria-busy="true">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="cq-memory-archive-tile cq-memory-archive-tile--skeleton" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="cq-memory-archive-empty cq-memory-archive-empty--error">{error}</p>;
  }

  if (orderedSections.length === 0) {
    if (locationOnly && priorityLocationId) {
      return (
        <p className="cq-memory-archive-empty cq-realm-fade-in">
          No archived memories saved at this location yet.
        </p>
      );
    }
    return (
      <div className="cq-memory-archive-empty-card cq-realm-fade-in">
        <MapPin className="h-6 w-6 text-uri-keaney/70" strokeWidth={1.75} aria-hidden />
        <p className="cq-memory-archive-empty-title">Your archive is empty</p>
        <p className="cq-memory-archive-empty-copy">
          Save a campus memory to keep it here after it expires.
        </p>
      </div>
    );
  }

  return (
    <div className="cq-memory-archive cq-realm-fade-in">
      {orderedSections.map((section) => (
        <section key={section.locationId} className="cq-memory-archive-section">
          {!locationOnly ? <h3 className="cq-memory-archive-location">{section.locationName}</h3> : null}
          <div className="cq-memory-archive-grid">
            {section.memories.map((memory) => (
              <button
                key={memory.id}
                type="button"
                className="cq-memory-archive-tile cq-realm-pressable"
                onClick={() => onOpenMemory(memory)}
                aria-label={`${section.locationName}, ${formatArchiveDate(memory.createdAt)}`}
              >
                {memory.mediaType === "image" && memory.mediaUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={memory.mediaUrl}
                    alt=""
                    className="cq-memory-archive-tile-media"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span className="cq-memory-archive-tile-text">{memory.body?.slice(0, 80) ?? "Memory"}</span>
                )}
                <span className="cq-memory-archive-tile-overlay" aria-hidden>
                  <span className="cq-memory-archive-tile-badge">
                    <MapPin className="h-3 w-3" aria-hidden />
                    {section.locationName}
                  </span>
                  <span className="cq-memory-archive-tile-date">{formatArchiveDate(memory.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function memoryToViewerLocationId(memory: CampusMemory): CampusLocationId {
  return memory.locationId as CampusLocationId;
}
