"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { startSigilAmbientHum } from "@/lib/client/scannerFantasyFeedback";

type CQScannerScreenProps = {
  onClose: () => void;
  frameSlot: ReactNode;
  bannerSlot?: ReactNode;
  loreFootnote?: ReactNode;
};

const HUD_WHISPERS = [
  "CQ Scanner validating sigil glyphs… standby.",
  "Arcane validation active.",
  "CampusQuest sigils honor one claim per crest — forged marks are refused.",
  "The realm recognizes your progress.",
  "Twin sigils collapse — CQ Scanner rejects duplicate crests.",
] as const;

export function CQScannerScreen({ onClose, frameSlot, bannerSlot, loreFootnote }: CQScannerScreenProps) {
  const reduce = useReducedMotion();
  const whisper = HUD_WHISPERS[Math.floor(Math.random() * HUD_WHISPERS.length)] ?? HUD_WHISPERS[0];

  useEffect(() => {
    const hum = startSigilAmbientHum();
    return () => hum.stop();
  }, []);

  return (
    <motion.div
      role="presentation"
      className="flex min-h-0 flex-1 flex-col"
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduce ? undefined : { opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="relative flex-shrink-0 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <motion.h2
              id="cq-cq-scanner-title"
              className="mt-1 font-display text-xl font-black tracking-[0.12em] text-white drop-shadow-[0_0_22px_rgba(56,189,248,0.45)] sm:text-2xl"
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12, type: "spring", stiffness: 280, damping: 24 }}
            >
              ✦ CQ SCANNER ✦
            </motion.h2>
            <motion.p
              className="mt-1 max-w-xl text-[13px] leading-snug text-cyan-100/90"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.18 }}
            >
              Align a CampusQuest sigil within the frame to reveal its power.
            </motion.p>
            <p className="mt-2 text-[11px] font-medium italic text-uri-keaney/88">&ldquo;{whisper}&rdquo;</p>
          </div>
          <motion.button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/25 bg-[#041E42]/80 text-cyan-100 shadow-[0_0_24px_rgba(56,189,248,0.15)] backdrop-blur-md hover:border-cyan-300/50 hover:bg-cyan-500/10 active:scale-95"
            aria-label="Close CQ Scanner"
            whileTap={{ scale: 0.92 }}
            initial={reduce ? false : { opacity: 0, rotate: -12 }}
            animate={{ opacity: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
          >
            <X className="h-5 w-5" aria-hidden strokeWidth={2.4} />
          </motion.button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col items-center gap-5 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        <motion.div
          className="relative w-full max-w-sm shrink-0"
          initial={reduce ? false : { opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.14, type: "spring", stiffness: 260, damping: 26 }}
        >
          {!reduce ? (
            <motion.div
              className="pointer-events-none absolute -bottom-20 -left-10 -right-10 -top-14 opacity-90"
              aria-hidden
              animate={{ opacity: [0.45, 0.72, 0.5] }}
              transition={{ repeat: Infinity, duration: 5 }}
            >
              <div className="absolute left-[8%] top-[10%] h-28 w-28 rounded-full bg-cyan-400/14 blur-2xl" />
              <div className="absolute bottom-[0%] right-[12%] h-36 w-36 rounded-full bg-sky-500/12 blur-3xl" />
            </motion.div>
          ) : null}
          {frameSlot}
        </motion.div>

        {bannerSlot ?? null}

        <motion.div
          className="w-full max-w-md rounded-2xl border border-cyan-500/25 bg-gradient-to-br from-[#041E42]/95 via-[#061a3a]/90 to-[#020b1a]/95 px-4 py-3 shadow-[0_0_40px_-12px_rgba(56,189,248,0.35)] backdrop-blur-md"
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28 }}
        >
          {loreFootnote ?? (
            <p className="text-xs leading-relaxed text-cyan-100/80">
              Each authentic CampusQuest sigil channels XP and one campus stat blessing. Runes with a bound nonce can only seal once — CQ Scanner syncs with The Quad so your journey stays legendary.
            </p>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}
