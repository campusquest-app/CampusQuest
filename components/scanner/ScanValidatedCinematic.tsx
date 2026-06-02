"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

type ScanValidatedCinematicProps = {
  visible: boolean;
  phase: "validated" | "transitioningToXP";
};

/** QR scanned pulse, energy inward, camera dim — before XP overlay. */
export function ScanValidatedCinematic({ visible, phase }: ScanValidatedCinematicProps) {
  const reduce = useReducedMotion();
  const dim = phase === "transitioningToXP";

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key="scan-validated-cinematic"
          className="pointer-events-none absolute inset-0 z-[45] flex items-center justify-center overflow-hidden rounded-[inherit]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0.12 : 0.28 }}
          aria-hidden
        >
          <motion.div
            className="absolute inset-0 rounded-[inherit] bg-[#020817]"
            initial={{ opacity: 0 }}
            animate={{ opacity: dim ? 0.82 : 0.35 }}
            transition={{ duration: reduce ? 0.15 : 0.48, ease: "easeInOut" }}
          />

          {!reduce &&
            Array.from({ length: 14 }).map((_, i) => (
              <motion.span
                key={i}
                className="absolute h-1.5 w-1.5 rounded-full bg-cyan-200 shadow-[0_0_12px_rgba(125,211,252,0.95)]"
                style={{ left: `${12 + (i % 5) * 18}%`, top: `${8 + (i % 4) * 22}%` }}
                initial={{ opacity: 0, scale: 0 }}
                animate={
                  dim
                    ? {
                        opacity: [0, 0.95, 0],
                        scale: [0.2, 1.2, 0.3],
                        x: ["0%", `${(50 - (12 + (i % 5) * 18)) * 0.85}%`],
                        y: ["0%", `${(48 - (8 + (i % 4) * 22)) * 0.9}%`],
                      }
                    : { opacity: [0, 0.7, 0], scale: [0, 1, 0.5] }
                }
                transition={{
                  duration: dim ? 0.55 : 0.4,
                  delay: dim ? 0.04 + i * 0.025 : i * 0.03,
                  ease: "easeInOut",
                }}
              />
            ))}

          <motion.div
            className="absolute h-24 w-24 rounded-full bg-cyan-400/30 blur-xl"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: [0.4, 1.35, 1.1], opacity: [0, 0.85, 0.25] }}
            transition={{ duration: reduce ? 0.2 : 0.42, ease: "easeOut" }}
          />

          <motion.p
            className="relative z-10 font-display text-sm font-black uppercase tracking-[0.28em] text-cyan-50 drop-shadow-[0_0_16px_rgba(56,189,248,0.75)] sm:text-base"
            initial={{ opacity: 0, scale: 0.92, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: reduce ? 0.12 : 0.32, delay: 0.06 }}
          >
            QR Scanned
          </motion.p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
