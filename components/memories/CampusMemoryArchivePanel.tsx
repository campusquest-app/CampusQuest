"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import type { CampusMemory, CampusMemoryArchiveSection } from "@/lib/types";
import type { CampusLocationId } from "@/lib/locations/registry";
import { fetchCampusMemoryArchive } from "@/lib/client/campusMemoriesClient";
import { subscribeCampusMemoriesChanged } from "@/lib/client/campusMemoriesSync";

function formatArchiveDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown date";
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

export function CampusMemoryArchivePanel({
  userId,
  onOpenMemory,
}: {
  userId?: string;
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

  if (loading) return <p className="cq-memory-archive-empty">Loading archive…</p>;
  if (error) return <p className="cq-memory-archive-empty cq-memory-archive-empty--error">{error}</p>;
  if (sections.length === 0) {
    return (
      <p className="cq-memory-archive-empty">
        Saved Memories appear here after you capture a moment and tap Save to Archive.
      </p>
    );
  }

  return (
    <div className="cq-memory-archive">
      {sections.map((section) => (
        <section key={section.locationId} className="cq-memory-archive-section">
          <h3 className="cq-memory-archive-location">{section.locationName}</h3>
          <ul className="cq-memory-archive-dates">
            {groupByDate(section.memories).map(({ dateLabel, memories }) => (
              <li key={`${section.locationId}-${dateLabel}`}>
                <p className="cq-memory-archive-date">{dateLabel}</p>
                <div className="cq-memory-archive-grid">
                  {memories.map((memory) => (
                    <button
                      key={memory.id}
                      type="button"
                      className="cq-memory-archive-item"
                      onClick={() => onOpenMemory(memory)}
                      aria-label={`${section.locationName}, ${dateLabel}`}
                    >
                      {memory.mediaType === "image" && memory.mediaUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={memory.mediaUrl} alt="" className="cq-memory-archive-thumb" loading="lazy" />
                      ) : (
                        <span className="cq-memory-archive-text">{memory.body?.slice(0, 60) ?? "Memory"}</span>
                      )}
                      <span className="cq-memory-archive-item-meta">
                        <MapPin className="h-3 w-3" aria-hidden />
                        {section.locationName}
                      </span>
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function groupByDate(memories: CampusMemory[]): { dateLabel: string; memories: CampusMemory[] }[] {
  const map = new Map<string, CampusMemory[]>();
  for (const memory of memories) {
    const label = formatArchiveDate(memory.createdAt);
    const list = map.get(label) ?? [];
    list.push(memory);
    map.set(label, list);
  }
  return Array.from(map.entries()).map(([dateLabel, rows]) => ({ dateLabel, memories: rows }));
}

export function memoryToViewerLocationId(memory: CampusMemory): CampusLocationId {
  return memory.locationId as CampusLocationId;
}
