"use client";

import { useRef, useState, type PointerEvent, type Ref } from "react";
import { Flame } from "lucide-react";
import { EMBER_COLOR_ACTIVE, EMBER_COLOR_IDLE, EMBER_COPY, ownerEmberCountCopy } from "@/lib/embers";
import { emberActionLabel, remainingEmbersCopy } from "@/lib/client/emberAllowance";

export function EmberReactionButton({
  active,
  count,
  remaining,
  isOwnPost,
  unlimited = false,
  compact,
  pending,
  pulse,
  onToggle,
  onBlocked,
  anchorRef,
}: {
  active: boolean;
  count: number;
  remaining: number | null;
  isOwnPost: boolean;
  unlimited?: boolean;
  compact?: boolean;
  pending?: boolean;
  pulse?: boolean;
  onToggle: () => void;
  /** Called when the tap is valid UI feedback but no network toggle should run. */
  onBlocked?: (reason: "exhausted" | "own_post" | "already_given") => void;
  anchorRef?: Ref<HTMLSpanElement>;
}) {
  const [hintOpen, setHintOpen] = useState(false);
  const holdTimer = useRef<number | null>(null);
  const holdFiredRef = useRef(false);
  const touchHandledRef = useRef(false);

  const label = emberActionLabel({ active, count, remaining, isOwnPost, unlimited });
  const ownerTotal = isOwnPost ? ownerEmberCountCopy(count) : null;
  const title = isOwnPost
    ? ownerTotal ?? EMBER_COPY.ownPost
    : active
      ? EMBER_COPY.alreadyGiven
      : EMBER_COPY.giveTitle;
  const color = active ? EMBER_COLOR_ACTIVE : EMBER_COLOR_IDLE;
  const hint = isOwnPost
    ? ownerTotal
    : unlimited
      ? EMBER_COPY.explainerBodyUnlimited
      : remaining == null
        ? EMBER_COPY.explainerBody
        : remainingEmbersCopy(remaining);
  const exhausted = !unlimited && !active && remaining === 0;

  function clearHold() {
    if (holdTimer.current != null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }

  function activate() {
    if (pending) return;
    if (isOwnPost) {
      onBlocked?.("own_post");
      return;
    }
    if (active) {
      // Already awarded — keep purple state; do not spend again or replay cast.
      onBlocked?.("already_given");
      return;
    }
    if (exhausted) {
      onBlocked?.("exhausted");
      return;
    }
    onToggle();
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    holdFiredRef.current = false;
    if (event.pointerType === "touch" || event.pointerType === "pen") {
      clearHold();
      holdTimer.current = window.setTimeout(() => {
        holdFiredRef.current = true;
        setHintOpen(true);
      }, 480);
    }
  }

  function onPointerUp(event: PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    clearHold();
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
    if (holdFiredRef.current) {
      // Long-press only opens the hint; do not also cast.
      return;
    }
    touchHandledRef.current = true;
    setHintOpen(false);
    activate();
  }

  function onPointerCancel(event: PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    clearHold();
    holdFiredRef.current = false;
  }

  return (
    <span
      ref={anchorRef}
      className="cq-ember-reaction-wrap relative inline-flex items-center"
      data-cq-media-control="true"
      data-no-drawer-swipe="true"
    >
      {ownerTotal ? <span className="cq-ember-owner-total">{ownerTotal}</span> : null}
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (touchHandledRef.current) {
            touchHandledRef.current = false;
            return;
          }
          if (holdFiredRef.current) {
            holdFiredRef.current = false;
            setHintOpen(false);
            return;
          }
          if (hintOpen) {
            setHintOpen(false);
            return;
          }
          activate();
        }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={(event) => {
          if (event.pointerType !== "touch") clearHold();
        }}
        title={title}
        aria-label={label}
        aria-pressed={active}
        aria-busy={pending}
        disabled={pending}
        className={`cq-feed-reaction cq-ember-reaction group inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-0.5 rounded-lg px-1.5 py-2 transition-colors duration-150 touch-manipulation disabled:cursor-not-allowed disabled:opacity-50 ${
          compact ? "" : "min-w-[2.75rem] rounded-xl px-2 py-1.5"
        } ${pulse ? "cq-ember-pulse" : ""} ${active ? "cq-ember-reaction--active" : ""} ${
          exhausted ? "cq-ember-reaction--exhausted" : ""
        } ${isOwnPost ? "cq-ember-reaction--own" : ""}`}
        style={{ color }}
        data-cq-ember-state={active ? "active" : exhausted ? "exhausted" : "idle"}
      >
        <Flame
          className={`cq-ember-flame${active ? " cq-ember-flame--active" : ""}`}
          size={22}
          strokeWidth={active ? 1.75 : 2}
          color={color}
          fill={active ? "currentColor" : "none"}
          absoluteStrokeWidth
          aria-hidden
        />
      </button>
      {hintOpen && hint ? (
        <span className="cq-ember-hint" role="status">
          {hint}
        </span>
      ) : null}
    </span>
  );
}
