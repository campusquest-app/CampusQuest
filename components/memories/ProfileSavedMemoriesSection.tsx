"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import type { CampusMemory, CampusMemoryGroup } from "@/lib/types";
import { fetchSavedCampusMemories } from "@/lib/client/campusMemoriesClient";
import { subscribeCampusMemoriesChanged } from "@/lib/client/campusMemoriesSync";

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

  if (loading || memories.length === 0) return null;

  return (
    <section className="cq-profile-saved-memories" aria-label="Saved campus memories">
      <div className="cq-profile-saved-memories-head">
        <h3 className="cq-profile-saved-memories-title">Saved Memories</h3>
        <p className="cq-profile-saved-memories-sub">Tap to revisit the original location and moment.</p>
      </div>
      <div className="cq-profile-saved-memories-scroll">
        {memories.map((memory) => (
          <button
            key={memory.id}
            type="button"
            className="cq-profile-saved-memories-item"
            onClick={() =>
              onOpenMemory(
                {
                  locationId: memory.locationId,
                  locationKey: memory.locationKey,
                  locationName: memory.locationName,
                  count: 1,
                  latestCreatedAt: memory.createdAt,
                  latestPreview: memory.mediaUrl,
                  latestMediaType: memory.mediaType,
                  latestAuthorAvatar: memory.authorAvatar,
                  hasRecent: false,
                },
                memory.id,
              )
            }
          >
            {memory.mediaType === "image" && memory.mediaUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={memory.mediaUrl} alt="" className="cq-profile-saved-memories-thumb" loading="lazy" />
            ) : (
              <span className="cq-profile-saved-memories-text">{memory.body?.slice(0, 48) ?? "Memory"}</span>
            )}
            <span className="cq-profile-saved-memories-meta">
              <MapPin className="h-3 w-3" aria-hidden />
              {memory.locationName}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
