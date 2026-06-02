"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

type ScannerFrameMagicProps = {
  detecting?: boolean;
  cameraActive?: boolean;
};

const SPARKLE_POSITIONS = [
  { left: "8%", top: "12%" },
  { left: "92%", top: "18%" },
  { left: "6%", top: "78%" },
  { left: "94%", top: "72%" },
  { left: "50%", top: "6%" },
  { left: "48%", top: "94%" },
] as const;

function buildFloaters(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: i % 2 === 0 ? 2 + ((i * 11) % 14) : 86 + ((i * 9) % 12),
    top: 8 + ((i * 19) % 78),
    size: 2 + (i % 3),
    delay: (i % 7) * 0.45,
    duration: 4.5 + (i % 4) * 0.8,
    drift: i % 2 === 0 ? 10 : -8,
  }));
}

export function ScannerFrameMagic({ detecting = false, cameraActive = false }: ScannerFrameMagicProps) {
  const reduce = useReducedMotion();
  const floaters = useMemo(() => buildFloaters(reduce ? 6 : 12), [reduce]);
  const [sparkleBurst, setSparkleBurst] = useState(0);

  useEffect(() => {
    if (reduce || !cameraActive) return;
    const id = window.setInterval(() => setSparkleBurst((n) => n + 1), 2400);
    return () => window.clearInterval(id);
  }, [reduce, cameraActive]);

  return (
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden rounded-[inherit]" aria-hidden>
      {!reduce && (
        <motion.div
          className="cq-sigil-border-shimmer absolute -inset-[1px] rounded-[inherit]"
          animate={{ rotate: [0, 360] }}
          transition={{ repeat: Infinity, duration: 14, ease: "linear" }}
        />
      )}

      <div
        className={`cq-sigil-frame-glow absolute inset-0 rounded-[inherit] ${detecting ? "cq-sigil-frame-glow--detecting" : ""}`}
      />

      {floaters.map((f) =>
        reduce ? (
          <span
            key={f.id}
            className="cq-sigil-frame-particle absolute rounded-full bg-cyan-200/50"
            style={{ left: `${f.left}%`, top: `${f.top}%`, width: f.size, height: f.size }}
          />
        ) : (
          <motion.span
            key={f.id}
            className="cq-sigil-frame-particle absolute rounded-full"
            style={{ left: `${f.left}%`, top: `${f.top}%`, width: f.size + 1, height: f.size + 1 }}
            animate={{
              y: [0, f.drift, 0],
              x: [0, f.drift * 0.4, 0],
              opacity: cameraActive ? [0.4, 0.8, 0.45] : [0.3, 0.6, 0.35],
              scale: [0.9, 1.2, 0.95],
            }}
            transition={{
              repeat: Infinity,
              duration: f.duration,
              delay: f.delay,
              ease: "easeInOut",
            }}
          />
        ),
      )}

      {!reduce &&
        cameraActive &&
        SPARKLE_POSITIONS.map((pos, i) => (
          <motion.span
            key={`${sparkleBurst}-${i}`}
            className="cq-sigil-frame-sparkle absolute"
            style={{ left: pos.left, top: pos.top }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: [0, 1, 0], scale: [0.2, 1.5, 0.4] }}
            transition={{ duration: 0.85, delay: i * 0.07, ease: "easeOut" }}
          />
        ))}
    </div>
  );
}
