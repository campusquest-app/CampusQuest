"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  EMBER_CAST_DURATION_MS,
  EMBER_CAST_REDUCED_DURATION_MS,
  EMBER_COPY,
  clampEmberCastAnchor,
  emberCastFlameSlots,
  type EmberCastPlan,
} from "@/lib/embers";
import { EmberFlameMark } from "@/components/embers/EmberFlameMark";

export function EmberCastOverlay({
  plan,
  reducedMotion,
  getAnchorRect,
  onComplete,
}: {
  plan: EmberCastPlan;
  reducedMotion: boolean;
  getAnchorRect: () => DOMRect | null;
  onComplete: () => void;
}) {
  const [anchor, setAnchor] = useState(() => readAnchor(getAnchorRect));
  const slots = useMemo(() => emberCastFlameSlots(plan.startingCount), [plan.startingCount]);

  useEffect(() => {
    const duration = reducedMotion ? EMBER_CAST_REDUCED_DURATION_MS : EMBER_CAST_DURATION_MS;
    const tid = window.setTimeout(onComplete, duration);
    return () => window.clearTimeout(tid);
  }, [onComplete, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return undefined;
    let frame = 0;
    const tick = () => {
      setAnchor(readAnchor(getAnchorRect));
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [getAnchorRect, reducedMotion]);

  if (plan.unlimited) {
    return (
      <div
        className={`cq-ember-cast cq-ember-cast--unlimited ${reducedMotion ? "cq-ember-cast--reduced" : ""}`}
        style={{ left: anchor.left, top: anchor.top }}
        role="status"
        aria-live="polite"
      >
        {reducedMotion ? null : (
          <div className="cq-ember-cast__stage">
            <span className="cq-ember-cast__flame cq-ember-cast__flame--trail">
              <EmberFlameMark />
              {[0, 1, 2, 3].map((particle) => (
                <span key={particle} className={`cq-ember-cast__particle cq-ember-cast__particle--${particle}`} />
              ))}
            </span>
          </div>
        )}
        <div className="cq-ember-cast__toast">
          <strong>{EMBER_COPY.emberSent}</strong>
        </div>
      </div>
    );
  }

  if (reducedMotion) {
    return (
      <div
        className="cq-ember-cast cq-ember-cast--reduced"
        style={{ left: anchor.left, top: anchor.top }}
        role="status"
        aria-live="polite"
      >
        <div className="cq-ember-cast__toast">
          <strong>{EMBER_COPY.emberSent}</strong>
          <span>{plan.confirmationDetail}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="cq-ember-cast"
      style={{ left: anchor.left, top: anchor.top }}
      role="status"
      aria-live="polite"
    >
      <div className="cq-ember-cast__stage">
        {slots.map((slot, index) => {
          const consume = index === plan.consumeIndex;
          return (
            <span
              key={`${plan.startingCount}-${index}`}
              className={`cq-ember-cast__flame ${consume ? "cq-ember-cast__flame--consume" : "cq-ember-cast__flame--remain"}`}
              style={
                {
                  "--ember-x": `${slot.x}px`,
                  "--ember-y": `${slot.y}px`,
                } as CSSProperties
              }
            >
              <EmberFlameMark consume={consume} />
              {consume
                ? [0, 1, 2, 3].map((particle) => (
                    <span
                      key={particle}
                      className={`cq-ember-cast__particle cq-ember-cast__particle--${particle}`}
                    />
                  ))
                : null}
            </span>
          );
        })}
      </div>
      <p className="cq-ember-cast__label">{plan.remainingLabel}</p>
      <div className="cq-ember-cast__toast">
        <strong>{EMBER_COPY.emberSent}</strong>
        <span>{plan.confirmationDetail}</span>
      </div>
    </div>
  );
}

function readAnchor(getAnchorRect: () => DOMRect | null): { left: number; top: number } {
  const rect = getAnchorRect();
  const viewport = {
    width: typeof window === "undefined" ? 390 : window.innerWidth,
    height: typeof window === "undefined" ? 844 : window.innerHeight,
  };
  if (!rect) {
    return { left: viewport.width / 2, top: viewport.height * 0.45 };
  }
  return clampEmberCastAnchor({
    button: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    viewport,
  });
}
