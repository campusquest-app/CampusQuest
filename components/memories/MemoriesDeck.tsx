"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type AnimationPlaybackControls,
} from "framer-motion";
import { ChevronLeft, Heart, Layers, MoreHorizontal, Star, Trash2, X } from "lucide-react";
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

const DEFAULT_CARD_W = 340;
/** Fraction of card width that commits a swipe (when velocity is low). */
const COMMIT_RATIO = 0.26;
/** Flick velocity (px/s) that commits regardless of distance dragged. */
const COMMIT_VELOCITY = 480;

export type MemoriesDeckMode = "global" | "location";

/** Always-positive modular index so the wheel loops forever in both directions. */
function wrapIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function preloadImage(url: string | null | undefined) {
  if (!url || typeof window === "undefined") return;
  const img = new window.Image();
  img.src = url;
}

/** Static visual contents of a single memory card (no motion logic here). */
function CardFace({ memory, priority = false }: { memory: CampusMemory; priority?: boolean }) {
  return (
    <div className="cq-memories-deck-card-inner">
      {memory.mediaType === "image" && memory.mediaUrl ? (
        <Image
          src={memory.mediaUrl}
          alt=""
          fill
          className="cq-memories-deck-card-img object-cover"
          sizes="(max-width: 480px) 92vw, 380px"
          priority={priority}
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

  const reduceMotion = useReducedMotion() ?? false;
  const dragX = useMotionValue(0);

  const [memories, setMemories] = useState<CampusMemory[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [xpToast, setXpToast] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const stackRef = useRef<HTMLDivElement | null>(null);
  const widthRef = useRef(DEFAULT_CARD_W);
  const animRef = useRef<AnimationPlaybackControls | null>(null);
  const animatingRef = useRef(false);
  const draggingRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const lastXRef = useRef(0);
  const lastTRef = useRef(0);
  const velocityRef = useRef(0);

  const len = memories.length;
  const safeIndex = len > 0 ? wrapIndex(index, len) : 0;
  const current = len > 0 ? memories[safeIndex] : null;
  const canSwipe = len > 1;

  const subtitle =
    mode === "location" && locationName
      ? `Moments at ${locationName} ✨`
      : "Swipe through campus moments ✨";

  // ── Data ────────────────────────────────────────────────────────────────
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

  // Preload neighbours in both directions so the loop never shows a blank.
  useEffect(() => {
    if (len === 0) return;
    preloadImage(memories[wrapIndex(safeIndex + 1, len)]?.mediaUrl);
    preloadImage(memories[wrapIndex(safeIndex + 2, len)]?.mediaUrl);
    preloadImage(memories[wrapIndex(safeIndex - 1, len)]?.mediaUrl);
  }, [safeIndex, memories, len]);

  // Track the card width so drag distance and spring targets stay in sync with
  // the rendered size (read through a ref so transforms always see the latest).
  useEffect(() => {
    const el = stackRef.current;
    if (!el) return;
    const update = () => {
      widthRef.current = el.offsetWidth || DEFAULT_CARD_W;
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading, len]);

  // ── Motion transforms (stable hooks, read live width via widthRef) ────────
  // Active card only ever slides LEFT (forward). On backward swipes it stays put
  // as the "floor" so the centre is always covered — no blank space appears.
  const activeX = useTransform(dragX, (v) => Math.min(v, 0));
  const activeRotate = useTransform(dragX, (v) =>
    reduceMotion ? 0 : clamp((Math.min(v, 0) / widthRef.current) * 10, -10, 0),
  );
  const activeScale = useTransform(dragX, (v) => {
    const f = clamp(-Math.min(v, 0) / widthRef.current, 0, 1);
    return 1 - f * 0.04;
  });

  // Next card sits centred behind the active card and grows into place as the
  // active card is swiped forward.
  const nextScale = useTransform(dragX, (v) => {
    const f = clamp(-Math.min(v, 0) / widthRef.current, 0, 1);
    return reduceMotion ? 1 : 0.95 + f * 0.05;
  });
  const nextY = useTransform(dragX, (v) => {
    const f = clamp(-Math.min(v, 0) / widthRef.current, 0, 1);
    return reduceMotion ? 0 : 18 * (1 - f);
  });

  // Previous card flies in from the left (on top) during backward swipes.
  const prevX = useTransform(dragX, (v) => -widthRef.current + Math.max(v, 0));
  const prevRotate = useTransform(dragX, (v) =>
    reduceMotion ? 0 : clamp(((Math.max(v, 0) - widthRef.current) / widthRef.current) * 10, -10, 0),
  );
  const prevOpacity = useTransform(dragX, (v) => (v > 0.5 ? 1 : 0));

  // ── Commit / cancel ───────────────────────────────────────────────────────
  const commit = useCallback(
    (direction: "forward" | "backward", velocity = 0) => {
      if (animatingRef.current || len <= 1) return;
      animatingRef.current = true;
      const width = widthRef.current;
      const target = direction === "forward" ? -width : width;
      const finish = () => {
        setIndex((i) => wrapIndex(direction === "forward" ? i + 1 : i - 1, len));
        dragX.set(0);
        animatingRef.current = false;
      };
      if (reduceMotion) {
        finish();
        return;
      }
      animRef.current = animate(dragX, target, {
        type: "spring",
        velocity,
        stiffness: 360,
        damping: 38,
        restDelta: 0.5,
      });
      animRef.current.then(finish);
    },
    [dragX, len, reduceMotion],
  );

  const cancelDrag = useCallback(
    (velocity = 0) => {
      if (reduceMotion) {
        dragX.set(0);
        return;
      }
      animRef.current = animate(dragX, 0, {
        type: "spring",
        velocity,
        stiffness: 380,
        damping: 36,
      });
    },
    [dragX, reduceMotion],
  );

  // ── Pointer drag (manual so we can keep a covering "floor" card both ways) ──
  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!canSwipe || animatingRef.current) return;
      const target = event.target as HTMLElement;
      if (target.closest("[data-cq-owner]")) return;
      animRef.current?.stop();
      draggingRef.current = true;
      pointerIdRef.current = event.pointerId;
      stackRef.current?.setPointerCapture?.(event.pointerId);
      startXRef.current = event.clientX;
      lastXRef.current = event.clientX;
      lastTRef.current = performance.now();
      velocityRef.current = 0;
    },
    [canSwipe],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current || event.pointerId !== pointerIdRef.current) return;
      const now = performance.now();
      dragX.set(event.clientX - startXRef.current);
      const dt = now - lastTRef.current;
      if (dt > 0) velocityRef.current = ((event.clientX - lastXRef.current) / dt) * 1000;
      lastXRef.current = event.clientX;
      lastTRef.current = now;
    },
    [dragX],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      if (pointerIdRef.current != null) {
        stackRef.current?.releasePointerCapture?.(pointerIdRef.current);
      }
      pointerIdRef.current = null;

      const offset = dragX.get();
      const velocity = velocityRef.current;
      const threshold = widthRef.current * COMMIT_RATIO;

      let direction: "forward" | "backward" | null = null;
      if (Math.abs(velocity) >= COMMIT_VELOCITY) direction = velocity < 0 ? "forward" : "backward";
      else if (Math.abs(offset) >= threshold) direction = offset < 0 ? "forward" : "backward";

      if (direction) commit(direction, velocity);
      else cancelDrag(velocity);
    },
    [cancelDrag, commit, dragX],
  );

  // ── Reactions ───────────────────────────────────────────────────────────
  const patchMemory = useCallback((memoryId: string, patch: Partial<CampusMemory>) => {
    setMemories((rows) => rows.map((m) => (m.id === memoryId ? { ...m, ...patch } : m)));
  }, []);

  const handleStar = useCallback(async () => {
    if (!current || current.starredByMe) return;
    const snapshot = { ...current };
    patchMemory(current.id, { starredByMe: true, starCount: current.starCount + 1 });
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
      patchMemory(snapshot.id, snapshot);
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
      patchMemory(snapshot.id, {
        likedByMe: result.likedByMe,
        likeCount: result.likeCount,
        starCount: result.starCount,
        starredByMe: result.starredByMe,
      });
    } catch {
      patchMemory(snapshot.id, snapshot);
    }
  }, [current, patchMemory]);

  const handleDelete = useCallback(async () => {
    if (!current) return;
    const id = current.id;
    try {
      await deleteCampusMemory(id);
      const next = memories.filter((m) => m.id !== id);
      setMemories(next);
      setIndex((i) => (next.length > 0 ? wrapIndex(i, next.length) : 0));
      setMenuOpen(false);
    } catch {
      setMenuOpen(false);
    }
  }, [current, memories]);

  const handleSkip = useCallback(() => {
    if (canSwipe) commit("forward");
    else onClose();
  }, [canSwipe, commit, onClose]);

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

      {len > 0 ? (
        <div className="cq-memories-deck-progress" aria-hidden>
          {memories.map((m, i) => (
            <span
              key={m.id}
              className={`cq-memories-deck-progress-seg${i === safeIndex ? " cq-memories-deck-progress-seg--active" : ""}`}
            />
          ))}
        </div>
      ) : null}

      <div className="cq-memories-deck-stage">
        {loading ? (
          <p className="cq-memories-deck-empty">Loading memories…</p>
        ) : error ? (
          <p className="cq-memories-deck-empty">{error}</p>
        ) : len === 0 ? (
          <div className="cq-memories-deck-empty-state">
            <Layers className="h-10 w-10 text-white/30" strokeWidth={1.6} />
            <p>{emptyCopy}</p>
          </div>
        ) : (
          <div
            ref={stackRef}
            className="cq-memories-deck-stack"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {current && current.userId === currentUserId ? (
              <div className="cq-memories-deck-owner" data-cq-owner>
                <button
                  type="button"
                  className="cq-memories-deck-owner-btn"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label="Memory options"
                  aria-expanded={menuOpen}
                >
                  <MoreHorizontal className="h-5 w-5" />
                </button>
                {menuOpen ? (
                  <div className="cq-memories-deck-owner-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => void handleDelete()}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                      Delete memory
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {len > 2 ? (
              <div
                className="cq-memories-deck-card cq-memories-deck-card--stacked"
                style={{ transform: "translateY(32px) scale(0.9)", zIndex: 1 }}
                aria-hidden
              >
                <CardFace memory={memories[wrapIndex(safeIndex + 2, len)]} />
              </div>
            ) : null}

            {len > 1 ? (
              <motion.div
                className="cq-memories-deck-card"
                style={{ scale: nextScale, y: nextY, zIndex: 2 }}
                aria-hidden
              >
                <CardFace memory={memories[wrapIndex(safeIndex + 1, len)]} priority />
              </motion.div>
            ) : null}

            {current ? (
              <motion.div
                className="cq-memories-deck-card cq-memories-deck-card--active"
                style={{ x: activeX, rotate: activeRotate, scale: activeScale, zIndex: 3 }}
              >
                <CardFace memory={current} priority />
              </motion.div>
            ) : null}

            {len > 1 ? (
              <motion.div
                className="cq-memories-deck-card"
                style={{ x: prevX, rotate: prevRotate, opacity: prevOpacity, zIndex: 4 }}
                aria-hidden
              >
                <CardFace memory={memories[wrapIndex(safeIndex - 1, len)]} />
              </motion.div>
            ) : null}
          </div>
        )}
      </div>

      {current ? (
        <footer className="cq-memories-deck-actions">
          <button
            type="button"
            className="cq-memories-deck-action cq-memories-deck-action--skip"
            onClick={handleSkip}
            aria-label="Next memory"
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
