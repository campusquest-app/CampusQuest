"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

type Props = {
  xp: number;
  label?: string;
  onDone?: () => void;
};

/** Lightweight fallback burst when the full XP overlay cannot mount. */
export function QrXpGainBurst({ xp, label = "QR Check-In Complete", onDone }: Props) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => setVisible(false), 1400);
    const doneTimer = window.setTimeout(() => onDone?.(), 1900);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
    };
  }, [onDone]);

  if (typeof document === "undefined" || xp <= 0) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-0 z-[10060] flex items-center justify-center px-4"
      aria-live="polite"
      aria-label={`+${xp} XP`}
    >
      <div
        className="flex flex-col items-center text-center"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(-12px) scale(1)" : "translateY(-48px) scale(1.04)",
          transition: "opacity 520ms ease-out, transform 520ms ease-out",
          willChange: "opacity, transform",
        }}
      >
        <p
          className="font-mono text-3xl font-black tabular-nums text-sky-100 sm:text-4xl"
          style={{ textShadow: "0 0 40px rgba(104, 171, 232, 0.85), 0 0 80px rgba(56, 189, 248, 0.45)" }}
        >
          +{xp} XP
        </p>
        <p className="mt-2 text-sm font-semibold uppercase tracking-[0.18em] text-cyan-200/85">
          {label}
        </p>
      </div>
    </div>,
    document.body,
  );
}
