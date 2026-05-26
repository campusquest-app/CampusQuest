"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";

const RUNE_CHARS = ["ᚠ", "ᚢ", "ᚦ", "ᚨ", "ᚱ", "ᚲ", "◈", "✦", "◇", "⬡"] as const;

type ScannerParticlesProps = {
  boosted?: boolean;
  className?: string;
};

export function ScannerParticles({ boosted = false, className = "" }: ScannerParticlesProps) {
  const reduce = useReducedMotion();

  const seeds = useMemo(
    () =>
      Array.from({ length: reduce ? 5 : 16 }, (_, i) => ({
        i,
        left: (i * 17 + 13) % 92,
        top: (i * 31 + 7) % 88,
        size: 3 + ((i * 7) % 10) / 3,
        delay: ((i % 9) / 13) * 2.8,
        duration: reduce ? 0 : 3.8 + ((i % 5) / 11) * 3.2,
        glyph: RUNE_CHARS[i % RUNE_CHARS.length],
      })),
    [reduce],
  );

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] ${className}`} aria-hidden>
      {seeds.map((s) =>
        reduce ? (
          <span
            key={s.i}
            className="absolute text-[8px] text-cyan-200/35"
            style={{ left: `${s.left}%`, top: `${s.top}%`, fontSize: s.size + 7 }}
          >
            {s.glyph}
          </span>
        ) : (
          <motion.span
            key={s.i}
            className="absolute text-[9px] text-cyan-100/55 mix-blend-screen"
            style={{ left: `${s.left}%`, top: `${s.top}%`, fontSize: s.size + 9 }}
            animate={{
              y: boosted ? [-2, -18, -4] : [0, -10, 2],
              x: boosted ? [-1, 6, -3] : [0, 4, -2],
              opacity: boosted ? [0.42, 0.92, 0.5] : [0.25, 0.55, 0.32],
              scale: boosted ? [1, 1.35, 1.05] : [1, 1.06, 0.96],
              rotate: [0, s.i % 2 === 0 ? 8 : -8, 0],
            }}
            transition={{
              repeat: Infinity,
              duration: s.duration / (boosted ? 1.45 : 1),
              ease: "easeInOut",
              delay: s.delay,
            }}
          >
            {s.glyph}
          </motion.span>
        ),
      )}
    </div>
  );
}
