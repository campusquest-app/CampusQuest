"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Camera, MapPin, X } from "lucide-react";
import type { CampusMemory, CampusMemoryGroup } from "@/lib/types";
import type { CampusLocationId } from "@/lib/locations/registry";
import { getCampusLocation } from "@/lib/locations/registry";
import { fetchCampusMemoriesByLocation } from "@/lib/client/campusMemoriesClient";
import { subscribeCampusMemoriesChanged } from "@/lib/client/campusMemoriesSync";
import { useRegisterImmersiveScreen } from "@/lib/client/nestedImmersiveScreen";
import { useSwipeDownDismiss } from "@/lib/client/useSwipeDownDismiss";
import { SWIPE_TRANSITION_MS } from "@/lib/client/mobileGestures";

function formatGalleryDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function LocationMemoriesGallery({
  locationId,
  locationName,
  open,
  onClose,
  onOpenMemory,
  onAddMemory,
}: {
  locationId: CampusLocationId;
  locationName: string;
  open: boolean;
  onClose: () => void;
  onOpenMemory: (group: CampusMemoryGroup, memoryId: string) => void;
  onAddMemory?: (locationId: CampusLocationId) => void;
}) {
  const [memories, setMemories] = useState<CampusMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useRegisterImmersiveScreen(open);

  useEffect(() => {
    setMounted(true);
  }, []);

  const load = useCallback(async () => {
    try {
      const rows = await fetchCampusMemoriesByLocation(locationId, { includeExpired: true });
      setMemories([...rows].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
    } catch {
      setMemories([]);
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void load();
  }, [open, load]);

  useEffect(() => subscribeCampusMemoriesChanged(() => void load()), [load]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const swipeDown = useSwipeDownDismiss({ onDismiss: onClose, enabled: open && mounted, containerRef: panelRef });
  const offsetY = swipeDown.dragY > 0 ? swipeDown.dragY : 0;
  const panelStyle: CSSProperties = {
    transform: offsetY > 0 ? `translate3d(0, ${offsetY}px, 0)` : undefined,
    transition: swipeDown.dragging
      ? "none"
      : offsetY > 0
        ? `transform ${SWIPE_TRANSITION_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`
        : undefined,
  };

  const openMemory = useCallback(
    (memory: CampusMemory) => {
      const loc = getCampusLocation(locationId);
      onOpenMemory(
        {
          locationId,
          locationKey: memory.locationKey ?? loc.legacyCampusKey ?? locationId,
          locationName: memory.locationName ?? locationName,
          count: memories.length,
          latestCreatedAt: memories[0]?.createdAt ?? memory.createdAt,
          latestPreview: memory.mediaUrl,
          latestMediaType: memory.mediaType,
          latestAuthorAvatar: memory.authorAvatar,
          hasRecent: false,
        },
        memory.id,
      );
    },
    [locationId, locationName, memories, onOpenMemory],
  );

  if (!mounted || !open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close memories gallery"
        className="cq-location-memories-gallery-backdrop fixed inset-0 bg-black/70 backdrop-blur-[4px]"
        style={{ opacity: 1 - 0.45 * swipeDown.progress, zIndex: 519 }}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="cq-location-memories-gallery"
        style={{ ...panelStyle, zIndex: 520 }}
        role="dialog"
        aria-modal="true"
        aria-label={`All memories at ${locationName}`}
      >
        <header className="cq-location-memories-gallery-head">
          <div className="min-w-0 flex-1">
            <p className="cq-location-memories-gallery-kicker">Campus Memories</p>
            <h2 className="cq-location-memories-gallery-title">{locationName}</h2>
            <p className="cq-location-memories-gallery-sub">
              {loading ? "Loading…" : `${memories.length} ${memories.length === 1 ? "memory" : "memories"}`}
            </p>
          </div>
          <button type="button" className="cq-location-memories-gallery-close" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="cq-location-memories-gallery-body">
          {loading ? (
            <div className="cq-location-memories-gallery-grid cq-location-memories-gallery-grid--loading" aria-busy="true">
              {Array.from({ length: 9 }).map((_, index) => (
                <div key={index} className="cq-location-memories-gallery-tile cq-location-memories-gallery-tile--skeleton" />
              ))}
            </div>
          ) : memories.length === 0 ? (
            <div className="cq-location-memories-gallery-empty">
              <MapPin className="h-7 w-7 text-uri-keaney/70" strokeWidth={1.75} aria-hidden />
              <p className="cq-location-memories-gallery-empty-title">No memories here yet</p>
              <p className="cq-location-memories-gallery-empty-copy">Be the first to leave your mark.</p>
              {onAddMemory ? (
                <button type="button" className="cq-realm-memories-add-primary" onClick={() => onAddMemory(locationId)}>
                  <Camera className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                  Add Memory
                </button>
              ) : null}
            </div>
          ) : (
            <div className="cq-location-memories-gallery-grid">
              {memories.map((memory) => (
                <button
                  key={memory.id}
                  type="button"
                  className="cq-location-memories-gallery-tile cq-realm-pressable"
                  onClick={() => openMemory(memory)}
                  aria-label={`Memory by ${memory.displayName}, ${formatGalleryDate(memory.createdAt)}`}
                >
                  {memory.mediaType === "image" && memory.mediaUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={memory.mediaUrl} alt="" className="cq-location-memories-gallery-tile-media" loading="lazy" />
                  ) : (
                    <span className="cq-location-memories-gallery-tile-text">{memory.body?.slice(0, 120) ?? "Memory"}</span>
                  )}
                  <span className="cq-location-memories-gallery-tile-overlay" aria-hidden>
                    <span className="cq-location-memories-gallery-tile-date">{formatGalleryDate(memory.createdAt)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
