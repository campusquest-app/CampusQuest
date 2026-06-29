"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MapPin, MessageCircle, X } from "lucide-react";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import type { CampusMemory, CampusMemoryGroup } from "@/lib/types";
import {
  fetchCampusMemoriesByLocation,
  saveCampusMemoryToProfile,
} from "@/lib/client/campusMemoriesClient";
import { subscribeCampusMemoriesChanged } from "@/lib/client/campusMemoriesSync";

const STORY_MS = 6000;

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
  const [memories, setMemories] = useState<CampusMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const touchStartY = useRef(0);
  const timerRef = useRef<number | null>(null);
  const reducedMotion = useRef(false);

  const current = memories[index] ?? null;

  useEffect(() => {
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const loadMemories = useCallback(async () => {
    try {
      setLoading(true);
      const rows = await fetchCampusMemoriesByLocation(group.locationId, { includeExpired });
      setMemories(rows);
      if (initialMemoryId) {
        const start = rows.findIndex((m) => m.id === initialMemoryId);
        setIndex(start >= 0 ? start : 0);
      } else {
        setIndex(0);
      }
      setError(rows.length === 0 ? "No active Memories at this location." : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Memories.");
    } finally {
      setLoading(false);
    }
  }, [group.locationId, initialMemoryId, includeExpired]);

  useEffect(() => {
    void loadMemories();
  }, [loadMemories]);

  useEffect(() => subscribeCampusMemoriesChanged(() => void loadMemories()), [loadMemories]);

  const goNext = useCallback(() => {
    setProgress(0);
    setIndex((i) => (i + 1 >= memories.length ? i : i + 1));
  }, [memories.length]);

  const goPrev = useCallback(() => {
    setProgress(0);
    setIndex((i) => (i <= 0 ? 0 : i - 1));
  }, []);

  useEffect(() => {
    if (!current || loading) return undefined;
    if (timerRef.current) window.clearInterval(timerRef.current);

    const step = reducedMotion.current ? 100 : 50;
    const duration = reducedMotion.current ? 1200 : STORY_MS;
    const increment = (step / duration) * 100;

    timerRef.current = window.setInterval(() => {
      setProgress((p) => {
        if (p + increment >= 100) {
          if (index + 1 >= memories.length) {
            window.clearInterval(timerRef.current!);
            return 100;
          }
          goNext();
          return 0;
        }
        return p + increment;
      });
    }, step);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [current, goNext, index, loading, memories.length]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function handleSave() {
    if (!current || current.userId !== currentUserId) return;
    try {
      await saveCampusMemoryToProfile(current.id);
    } catch {
      /* non-blocking */
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="cq-memory-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={`Memories at ${group.locationName}`}
      onTouchStart={(e) => {
        touchStartY.current = e.touches[0]?.clientY ?? 0;
      }}
      onTouchEnd={(e) => {
        const dy = (e.changedTouches[0]?.clientY ?? 0) - touchStartY.current;
        if (dy > 80) onClose();
      }}
    >
      <header className="cq-memory-viewer-head">
        <div className="cq-memory-viewer-progress">
          {memories.map((m, i) => (
            <span
              key={m.id}
              className={`cq-memory-viewer-seg${i < index ? " cq-memory-viewer-seg--done" : ""}${i === index ? " cq-memory-viewer-seg--active" : ""}`}
            >
              {i === index ? (
                <span className="cq-memory-viewer-seg-fill" style={{ width: `${progress}%` }} />
              ) : null}
            </span>
          ))}
        </div>
        <div className="cq-memory-viewer-meta">
          <div className="cq-memory-viewer-location">
            <MapPin className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
            <span>{group.locationName}</span>
          </div>
          <button type="button" className="cq-memory-viewer-close" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" strokeWidth={2.2} />
          </button>
        </div>
      </header>

      {loading ? (
        <div className="cq-memory-viewer-body cq-memory-viewer-body--loading">Loading…</div>
      ) : error ? (
        <div className="cq-memory-viewer-body cq-memory-viewer-body--empty">{error}</div>
      ) : current ? (
        <>
          <div className="cq-memory-viewer-tap cq-memory-viewer-tap--left" onClick={goPrev} aria-hidden />
          <div className="cq-memory-viewer-tap cq-memory-viewer-tap--right" onClick={goNext} aria-hidden />
          <div className="cq-memory-viewer-body">
            {current.mediaType === "image" && current.mediaUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={current.mediaUrl} alt="" className="cq-memory-viewer-media" />
            ) : (
              <div className="cq-memory-viewer-text">
                <p>{current.body}</p>
              </div>
            )}
          </div>
          <footer className="cq-memory-viewer-foot">
            <div className="cq-memory-viewer-author">
              <AvatarDisplay avatar={current.authorAvatar} size={36} className="rounded-full" />
              <div className="min-w-0">
                <p className="cq-memory-viewer-author-name">{current.displayName}</p>
                <p className="cq-memory-viewer-author-meta">
                  @{current.username} · {current.postedAgoLabel}
                </p>
              </div>
            </div>
            <div className="cq-memory-viewer-actions">
              {current.userId === currentUserId ? (
                <button type="button" className="cq-memory-viewer-action" onClick={() => void handleSave()}>
                  Save to Archive
                </button>
              ) : null}
              <button type="button" className="cq-memory-viewer-action" aria-label="Comment">
                <MessageCircle className="h-5 w-5" strokeWidth={2} />
              </button>
            </div>
          </footer>
        </>
      ) : null}
    </div>,
    document.body,
  );
}
