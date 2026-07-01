"use client";

import type { CampusMemoryGroup } from "@/lib/types";
import { MemoriesDeck } from "./MemoriesDeck";

/** Location-scoped deck wrapper (Realm sheet, profile archive, Quad location tile). */
export function CampusMemoryViewer({
  group,
  currentUserId,
  initialMemoryId,
  includeExpired = false,
  onClose,
}: {
  group: CampusMemoryGroup;
  currentUserId: string;
  initialMemoryId?: string;
  includeExpired?: boolean;
  onClose: () => void;
}) {
  return (
    <MemoriesDeck
      mode="location"
      locationId={group.locationId}
      locationName={group.locationName}
      initialMemoryId={initialMemoryId}
      includeExpired={includeExpired}
      currentUserId={currentUserId}
      onClose={onClose}
    />
  );
}
