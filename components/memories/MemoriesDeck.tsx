"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from "framer-motion";
import { ChevronLeft, Heart, Layers, MoreHorizontal, Star, X } from "lucide-react";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import type { CampusMemory } from "@/lib/types";
import {
  deleteCampusMemory,
  fetchCampusMemoriesFeed,
  starCampusMemory,
  toggleCampusMemoryLike,
} from "@/lib/client/campusMemoriesClient";
import { subscribeCampusMemoriesChanged } from "@/lib/client/campusMemoriesSync";
import { useRegisterImmersiveScreen } from "@/lib/client/nestedImmersiveScreen";
import { playXpDing } from "@/lib/playGameSound";

const SWIPE_COMMIT_PX = 96;
const STACK_BEHIND = 2;

export type MemoriesDeckMode = "global" | "location";

function preloadImage(url: string | null | undefined) {
  if (!url || typeof window === "undefined") return;
  const img = new window.Image();
  img.src = url;
}

function MemoryDeckCard({
  memory,
  depth,
  isTop,
  dragX,
  onDragEnd,
  reduceMotion,
}: {
  memory: CampusMemory;
  depth: number;
  isTop: boolean;
  dragX: ReturnType<typeof useMotionValue<number>>;
  onDragEnd?: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
  reduceMotion: boolean;
}) {
  const rotate = useTransform(dragX, [-180, 0, 180], reduceMotion ? [0, 0, 0] : [-14, 0, 14]);

  const scale = 1 - depth * 0.04;
  const yOffset = depth * 14;
  const baseRotate = depth * (depth % 2 === 0 ? -2.5 : 2.5);

  const card = (
    <div className="cq-memories-deck-card-inner">
      {memory.mediaType === "image" && memory.mediaUrl ? (
        <Image
          src={memory.mediaUrl}
          alt=""
          fill
          className="cq-memories-deck-card-img object-cover"
          sizes="(max-width: 480px) 92vw, 380px"
          priority={isTop}
          unoptimized
        />
      ) : (
        <div className="cq-memories-deck-card-text">
          <p>{memory.body}</p>
        </div>
      )}
      <div className="cq-memories-deck-card-gradient" aria-hidden />
      <div className="cq-memories-deck-card-meta">
        <div className="cq-memories-deck-card-author">
          <AvatarDisplay avatar={memory.authorAvatar} size={34} className="rounded-full ring-2 ring-white/20" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">{memory.displayName}</p>
            <p className="truncate text-xs text-white/70">
              @{memory.username} · {memory.postedAgoLabel}
            </p>
          </div>
        </div>
        <span className="cq-memories-deck-location-pill">{memory.locationName}</span>
        {memory.body && memory.mediaType === "image" ? (
          <p className="cq-memories-deck-caption">{memory.body}</p>
        ) : null}
      </div>
    </div>
  );

  if (!isTop) {
    return (
      <div
        className="cq-memories-deck-card cq-memories-deck-card--stacked"
        style={{
          transform: `translate3d(0, ${yOffset}px, 0) scale(${scale}) rotate(${baseRotate}deg)`,
          zIndex: STACK_BEHIND - depth,
        }}
        aria-hidden
      >
        {card}
      </div>
    );
  }

  return (
    <motion.div
      className="cq-memories-deck-card cq-memories-deck-card--active"
      style={{
        x: isTop ? dragX : 0,
        rotate: isTop ? rotate : baseRotate,
        zIndex: STACK_BEHIND + 1 - depth,
      }}
      drag={isTop && !reduceMotion ? "x" : false}
      dragElastic={0.9}
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={isTop ? onDragEnd : undefined}
      whileTap={isTop && !reduceMotion ? { scale: 0.985 } : undefined}
    >
      {card}
    </motion.div>
  );
}

export function MemoriesDeck({
  mode,
  locationId,
  locationName,
  initialMemoryId,
  currentUserId,
  onClose,
}: {
  mode: MemoriesDeckMode;
  locationId?: string;
  locationName?: string;
  initialMemoryId?: string;
  currentUserId: string;
  onClose: () => void;
}) {
  useRegisterImmersiveScreen(true);

  const reduceMotion = useReducedMotion();
  const dragX = useMotionValue(0);
  const [memories, setMemories] = useState<CampusMemory[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exitDir, setExitDir] = useState<"left" | "right" | null>(null);
  const [xpToast, setXpToast] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const advancingRef = useRef(false);

  const current = memories[index] ?? null;
  const subtitle =
    mode === "location" && locationName
      ? `Moments at ${locationName} ✨`
      : "Swipe through campus moments ✨";

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const rows = await fetchCampusMemoriesFeed({
        locationId: mode === "location" ? locationId : undefined,
      });
      setMemories(rows);
      if (initialMemoryId) {
        const start = rows.findIndex((m) => m.id === initialMemoryId);
        setIndex(start >= 0 ? start : 0);
      } else {
        setIndex(0);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load memories.");
    } finally {
      setLoading(false);
    }
  }, [initialMemoryId, locationId, mode]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => subscribeCampusMemoriesChanged(() => void load()), [load]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    for (let i = 1; i <= 3; i++) {
      preloadImage(memories[index + i]?.mediaUrl);
    }
  }, [index, memories]);

  const advance = useCallback(
    (direction: "left" | "right") => {
      if (advancingRef.current || !current) return;

      if (direction === "right") {
        if (index <= 0) {
          if (!reduceMotion) void animate(dragX, 0, { type: "spring", stiffness: 420, damping: 32 });
          else dragX.set(0);
          return;
        }
        advancingRef.current = true;
        setExitDir("right");
        const targetX = window.innerWidth;
        if (reduceMotion) {
          dragX.set(0);
          setExitDir(null);
          setIndex((i) => Math.max(0, i - 1));
          advancingRef.current = false;
          return;
        }
        void animate(dragX, targetX, { duration: 0.28, ease: [0.32, 0.72, 0, 1] }).then(() => {
          dragX.set(0);
          setExitDir(null);
          setIndex((i) => Math.max(0, i - 1));
          advancingRef.current = false;
        });
        return;
      }

      if (index >= memories.length - 1) {
        onClose();
        return;
      }
      advancingRef.current = true;
      setExitDir("left");
      const targetX = -window.innerWidth;
      if (reduceMotion) {
        dragX.set(0);
        setExitDir(null);
        setIndex((i) => Math.min(i + 1, memories.length - 1));
        advancingRef.current = false;
        return;
      }
      void animate(dragX, targetX, { duration: 0.28, ease: [0.32, 0.72, 0, 1] }).then(() => {
        dragX.set(0);
        setExitDir(null);
        setIndex((i) => Math.min(i + 1, memories.length - 1));
        advancingRef.current = false;
      });
    },
    [current, dragX, index, memories.length, onClose, reduceMotion],
  );

  const handleDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (Math.abs(info.offset.x) >= SWIPE_COMMIT_PX) {
        advance(info.offset.x > 0 ? "right" : "left");
        return;
      }
      if (!reduceMotion) {
        void animate(dragX, 0, { type: "spring", stiffness: 420, damping: 32 });
      } else {
        dragX.set(0);
      }
    },
    [advance, dragX, reduceMotion],
  );

  const patchMemory = useCallback((memoryId: string, patch: Partial<CampusMemory>) => {
    setMemories((rows) => rows.map((m) => (m.id === memoryId ? { ...m, ...patch } : m)));
  }, []);

  const handleStar = useCallback(async () => {
    if (!current || current.starredByMe) return;
    const snapshot = { ...current };
    patchMemory(current.id, {
      starredByMe: true,
      starCount: current.starCount + 1,
    });
    try {
      const result = await starCampusMemory(current.id);
      patchMemory(current.id, {
        starredByMe: result.starredByMe,
        starCount: result.starCount,
        likeCount: result.likeCount,
        likedByMe: result.likedByMe,
      });
      if (result.xpAwarded) {
        playXpDing();
        setXpToast(true);
        window.setTimeout(() => setXpToast(false), 2200);
      }
    } catch {
      patchMemory(current.id, snapshot);
    }
  }, [current, patchMemory]);

  const handleLike = useCallback(async () => {
    if (!current) return;
    const snapshot = { ...current };
    const nextLiked = !current.likedByMe;
    patchMemory(current.id, {
      likedByMe: nextLiked,
      likeCount: Math.max(0, current.likeCount + (nextLiked ? 1 : -1)),
    });
    try {
      const result = await toggleCampusMemoryLike(current.id);
      patchMemory(current.id, {
        likedByMe: result.likedByMe,
        likeCount: result.likeCount,
        starCount: result.starCount,
        starredByMe: result.starredByMe,
      });
    } catch {
      patchMemory(current.id, snapshot);
    }
  }, [current, patchMemory]);

  const handleDelete = useCallback(async () => {
    if (!current) return;
    try {
      await deleteCampusMemory(current.id);
      setMemories((rows) => rows.filter((m) => m.id !== current.id));
      setMenuOpen(false);
      setIndex((i) => Math.max(0, i - 1));
    } catch {
      setMenuOpen(false);
    }
  }, [current]);

  const stack = useMemo(() => {
    const items: { memory: CampusMemory; depth: number }[] = [];
    for (let d = STACK_BEHIND; d >= 0; d--) {
      const mem = memories[index + d];
      if (mem) items.push({ memory: mem, depth: d });
    }
    return items;
  }, [index, memories]);

  const emptyCopy =
    mode === "location"
      ? "No memories here yet. Be the first to post from this spot."
      : "No campus memories yet. Start the first one.";

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="cq-memories-deck"
      role="dialog"
      aria-modal="true"
      aria-label="Memories deck"
      data-cq-gesture-block="all"
    >
      <header className="cq-memories-deck-head">
        <button type="button" className="cq-memories-deck-back" onClick={onClose} aria-label="Back">
          <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
        </button>
        <div className="cq-memories-deck-head-text">
          <h1 className="cq-memories-deck-title">Memories</h1>
          <p className="cq-memories-deck-subtitle">{subtitle}</p>
        </div>
        <span className="cq-memories-deck-head-icon" aria-hidden>
          <Layers className="h-5 w-5" strokeWidth={2} />
        </span>
      </header>

      {memories.length > 0 ? (
        <div className="cq-memories-deck-progress" aria-hidden>
          {memories.map((m, i) => (
            <span
              key={m.id}
              className={`cq-memories-deck-progress-seg${i < index ? " cq-memories-deck-progress-seg--done" : ""}${i === index ? " cq-memories-deck-progress-seg--active" : ""}`}
            />
          ))}
        </div>
      ) : null}

      <div className="cq-memories-deck-stage">
        {loading ? (
          <p className="cq-memories-deck-empty">Loading memories…</p>
        ) : error ? (
          <p className="cq-memories-deck-empty">{error}</p>
        ) : memories.length === 0 ? (
          <div className="cq-memories-deck-empty-state">
            <Layers className="h-10 w-10 text-white/30" strokeWidth={1.6} />
            <p>{emptyCopy}</p>
          </div>
        ) : (
          <div className={`cq-memories-deck-stack${exitDir ? ` cq-memories-deck-stack--exit-${exitDir}` : ""}`}>
            {stack.map(({ memory, depth }) => (
              <MemoryDeckCard
                key={`${memory.id}-${depth}`}
                memory={memory}
                depth={depth}
                isTop={depth === 0}
                dragX={dragX}
                onDragEnd={depth === 0 ? handleDragEnd : undefined}
                reduceMotion={reduceMotion ?? false}
              />
            ))}
          </div>
        )}
      </div>

      {current ? (
        <footer className="cq-memories-deck-actions">
          <button
            type="button"
            className="cq-memories-deck-action cq-memories-deck-action--skip"
            onClick={() => advance("left")}
            aria-label="Skip memory"
          >
            <X className="h-7 w-7" strokeWidth={2.2} />
          </button>

          <button
            type="button"
            className={`cq-memories-deck-action cq-memories-deck-action--star${current.starredByMe ? " cq-memories-deck-action--active" : ""}`}
            onClick={() => void handleStar()}
            aria-label={current.starredByMe ? "Starred" : "Star memory for XP"}
            aria-pressed={current.starredByMe}
          >
            <Star className="h-7 w-7" strokeWidth={2.2} fill={current.starredByMe ? "currentColor" : "none"} />
            {current.starCount > 0 ? (
              <span className="cq-memories-deck-action-count">{current.starCount}</span>
            ) : null}
          </button>

          <button
            type="button"
            className={`cq-memories-deck-action cq-memories-deck-action--heart${current.likedByMe ? " cq-memories-deck-action--active" : ""}`}
            onClick={() => void handleLike()}
            aria-label={current.likedByMe ? "Unlike" : "Like"}
            aria-pressed={current.likedByMe}
          >
            <Heart className="h-7 w-7" strokeWidth={2.2} fill={current.likedByMe ? "currentColor" : "none"} />
            {current.likeCount > 0 ? (
              <span className="cq-memories-deck-action-count">{current.likeCount}</span>
            ) : null}
          </button>

          {current.userId === currentUserId ? (
            <div className="cq-memories-deck-menu-wrap">
              <button
                type="button"
                className="cq-memories-deck-action cq-memories-deck-action--menu"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Memory options"
                aria-expanded={menuOpen}
              >
                <MoreHorizontal className="h-6 w-6" />
              </button>
              {menuOpen ? (
                <div className="cq-memories-deck-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => void handleDelete()}>
                    Delete memory
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </footer>
      ) : null}

      {xpToast ? (
        <div className="cq-memories-deck-xp-toast" role="status" aria-live="polite">
          +1 XP
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
