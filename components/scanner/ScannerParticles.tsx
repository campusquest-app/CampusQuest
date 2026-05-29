"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";

const RUNE_CHARS = ["ᚠ", "ᚢ", "ᚦ", "ᚨ", "ᚱ", "ᚲ", "◈", "✦", "◇", "⬡"] as const;

type ScannerParticlesProps = {
  boosted?: boolean;
  cameraActive?: boolean;
  className?: string;
};

/** Bias runes toward the scanner frame edges (center stays clear for QR). */
function edgePosition(i: number, axis: "x" | "y"): number {
  const band = i % 4;
  if (axis === "x") {
    if (band === 0) return 4 + ((i * 7) % 10);
    if (band === 1) return 86 + ((i * 5) % 10);
    return 22 + ((i * 13) % 56);
  }
  if (band === 0) return 6 + ((i * 9) % 12);
  if (band === 1) return 82 + ((i * 6) % 10);
  return 18 + ((i * 11) % 64);
}

export function ScannerParticles({ boosted = false, cameraActive = false, className = "" }: ScannerParticlesProps) {
  const reduce = useReducedMotion();

  const seeds = useMemo(
    () =>
      Array.from({ length: reduce ? 6 : 18 }, (_, i) => ({
        i,
        left: edgePosition(i, "x"),
        top: edgePosition(i, "y"),
        size: 3 + ((i * 7) % 10) / 3,
        delay: ((i % 9) / 13) * 2.8,
        driftDuration: 5.5 + ((i % 5) / 11) * 4,
        rotateDuration: 18 + (i % 6) * 4,
        glyph: RUNE_CHARS[i % RUNE_CHARS.length],
      })),
    [reduce],
  );

  const runeOpacity = useMemo((): [number, number, number] => {
    if (boosted) {
      return cameraActive ? [0.38, 0.55, 0.42] : [0.48, 0.78, 0.52];
    }
    return cameraActive ? [0.2, 0.3, 0.24] : [0.28, 0.45, 0.32];
  }, [boosted, cameraActive]);

  return (
    <div className={`cq-sigil-runes-layer pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] ${className}`} aria-hidden>
      {seeds.map((s) =>
        reduce ? (
          <span
            key={s.i}
            className="cq-sigil-rune cq-sigil-rune--edge absolute text-[8px] text-cyan-200/50"
            style={{ left: `${s.left}%`, top: `${s.top}%`, fontSize: s.size + 7 }}
          >
            {s.glyph}
          </span>
        ) : (
          <motion.span
            key={s.i}
            className="cq-sigil-rune cq-sigil-rune--edge absolute text-[10px] text-cyan-50 mix-blend-screen"
            style={{
              left: `${s.left}%`,
              top: `${s.top}%`,
              fontSize: s.size + 9,
            }}
            animate={{
              y: [0, -12, 4, -6, 0],
              x: [0, 5, -4, 3, 0],
              opacity: runeOpacity,
              scale: boosted ? [1, 1.2, 1.05] : [1, 1.08, 0.98],
              rotate: [0, s.i % 2 === 0 ? 18 : -18, s.i % 2 === 0 ? -8 : 8, 0],
            }}
            transition={{
              y: { repeat: Infinity, duration: s.driftDuration, ease: "easeInOut", delay: s.delay },
              x: { repeat: Infinity, duration: s.driftDuration * 1.1, ease: "easeInOut", delay: s.delay },
              opacity: { repeat: Infinity, duration: s.driftDuration * 0.9, ease: "easeInOut", delay: s.delay },
              scale: { repeat: Infinity, duration: s.driftDuration, ease: "easeInOut", delay: s.delay },
              rotate: { repeat: Infinity, duration: s.rotateDuration, ease: "linear", delay: s.delay },
            }}
          >
            {s.glyph}
          </motion.span>
        ),
      )}
    </div>
  );
}
