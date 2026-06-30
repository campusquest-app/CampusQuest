"use client";

import { motion, useReducedMotion } from "framer-motion";

export type AuthMode = "signin" | "signup";

function hapticTap() {
  try {
    navigator.vibrate?.(8);
  } catch {
    /* optional */
  }
}

/** iOS-style Sign Up / Sign In capsule with sliding cyan pill. */
export function AuthModeSegment({
  mode,
  onChange,
}: {
  mode: AuthMode;
  onChange: (mode: AuthMode) => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="cq-auth-segment" role="tablist" aria-label="Authentication mode">
      {(
        [
          { id: "signup" as const, label: "Sign Up" },
          { id: "signin" as const, label: "Sign In" },
        ] as const
      ).map((tab) => {
        const selected = mode === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`auth-panel-${tab.id}`}
            id={`auth-tab-${tab.id}`}
            onClick={() => {
              if (tab.id === mode) return;
              hapticTap();
              onChange(tab.id);
            }}
            className={`cq-auth-segment-tab${selected ? " cq-auth-segment-tab--active" : ""}`}
          >
            {selected && !reduceMotion ? (
              <motion.span
                layoutId="cq-auth-segment-pill"
                className="cq-auth-segment-pill"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                aria-hidden
              />
            ) : selected ? (
              <span className="cq-auth-segment-pill" aria-hidden />
            ) : null}
            <span className="cq-auth-segment-label">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
