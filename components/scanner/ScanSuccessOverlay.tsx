"use client";

import { useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import type { SigilScannerReward } from "@/components/scanner/sigilRewardTypes";
import { FloatingRewardText } from "@/components/scanner/FloatingRewardText";
import { playSigilLevelUp, playSigilXpBurst } from "@/lib/client/scannerFantasyFeedback";

type ScanSuccessOverlayProps = {
  reward: SigilScannerReward | null;
};

/** CQ Scanner victory burst — XP and stat blessings sealed to the player. */
export function ScanSuccessOverlay({ reward }: ScanSuccessOverlayProps) {
  const reduce = useReducedMotion();
  const show = Boolean(reward);

  useEffect(() => {
    if (!reward || reduce) return undefined;
    playSigilXpBurst();
    if (reward.leveledUp) playSigilLevelUp();
    return undefined;
  }, [reward, reduce]);

  return (
    <AnimatePresence mode="wait">
      {show && reward ? (
        <motion.div
          key="cq-scanner-success"
          className="pointer-events-none fixed inset-0 z-[160] flex flex-col items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          aria-hidden
        >
          <motion.div
            className="absolute inset-0 bg-cq-app/55 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          />

          <motion.div
            className="absolute h-[min(120vw,620px)] w-[min(120vw,620px)] rounded-full bg-[radial-gradient(circle_at_50%_45%,rgba(56,189,248,0.45),rgba(8,47,73,0.12)_38%,transparent_68%)] blur-[2px] mix-blend-screen"
            initial={{ scale: 0.2, opacity: 0 }}
            animate={{
              scale: [0.2, 1.08, 1.25],
              opacity: [0, 0.95, 0.35],
            }}
            transition={{ duration: reduce ? 0.18 : 0.72, ease: [0.16, 0.84, 0.24, 1] }}
          />

          {!reduce && (
            <motion.div
              className="absolute h-[min(76vw,340px)] w-[min(76vw,340px)] rounded-full border-2 border-cyan-300/60 shadow-[0_0_60px_rgba(56,189,248,0.45)]"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: [0.52, 1.05], opacity: [0.45, 0] }}
              transition={{ duration: 0.95, ease: "easeOut" }}
            />
          )}

          <motion.div className="relative z-[6] mb-6 h-36 w-[min(86vw,300px)]" initial={false}>
            {!reduce ? (
              <svg viewBox="0 0 200 96" className="h-full w-full drop-shadow-[0_0_22px_rgba(56,189,248,0.45)]" aria-hidden>
                <defs>
                  <linearGradient id="cqSigilXpStroke" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#67e8f9" />
                    <stop offset="55%" stopColor="#e0f2fe" />
                    <stop offset="100%" stopColor="#68ABE8" />
                  </linearGradient>
                </defs>
                <motion.path
                  d="M 14 92 A 92 92 0 0 1 186 92"
                  fill="none"
                  stroke="url(#cqSigilXpStroke)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray="267"
                  initial={{ strokeDashoffset: 267 }}
                  animate={{ strokeDashoffset: 8 }}
                  transition={{ delay: 0.08, duration: 1.05, ease: [0.22, 1, 0.36, 1] }}
                />
              </svg>
            ) : (
              <div className="mx-auto h-2 w-4/5 max-w-xs rounded-full bg-white/15">
                <div className="h-full rounded-full bg-uri-keaney/60" />
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 flex justify-center pt-3">
              <p className="max-w-[90%] text-center font-display text-base font-bold text-white">
                {reward.sigilName} logged!
              </p>
            </div>
          </motion.div>

          {!reduce &&
            Array.from({ length: 18 }).map((_, i) => (
              <motion.span
                key={i}
                className="absolute h-1.5 w-1.5 rounded-full bg-cyan-200 shadow-[0_0_10px_rgba(186,230,253,0.9)]"
                style={{ left: "50%", top: "48%" }}
                initial={{ opacity: 0, scale: 0 }}
                animate={{
                  opacity: [0, 1, 0.35, 0],
                  x: Math.cos((i / 18) * Math.PI * 2) * (90 + (i % 5) * 18),
                  y: Math.sin((i / 18) * Math.PI * 2) * (90 + (i % 4) * 15) - 24,
                  scale: [0, 1.35, 0.55],
                }}
                transition={{ duration: 0.95 + (i % 4) * 0.06, ease: [0.12, 0.73, 0.24, 0.99], delay: 0.04 }}
              />
            ))}

          <div className="relative z-[8] mt-[-2.5rem] flex w-[min(92vw,340px)] flex-col items-center gap-4 pb-24">
            <FloatingRewardText
              tone="xp"
              label={`+${reward.xp} XP`}
              sub="XP blessing received."
              delay={0.12}
            />
            {reward.statIncrease > 0 ? (
              <FloatingRewardText
                tone="stat"
                label={`${reward.statLabel} +${reward.statIncrease}`}
                sub="Campus stat attuned on your CQ sheet."
                delay={0.22}
              />
            ) : null}
            {reward.milestonesUnlocked && reward.milestonesUnlocked.length > 0 ? (
              <FloatingRewardText
                tone="stat"
                label={reward.milestonesUnlocked[0]!}
                sub={
                  reward.milestonesUnlocked.length > 1
                    ? `+${reward.milestonesUnlocked.length - 1} more milestone${reward.milestonesUnlocked.length > 2 ? "s" : ""} unlocked`
                    : "Location milestone unlocked."
                }
                delay={0.32}
              />
            ) : null}
            {reward.leveledUp ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.75, rotate: -8 }}
                animate={{ opacity: 1, scale: 1.05, rotate: 0 }}
                transition={{ delay: 0.5, type: "spring", stiffness: 440, damping: 18 }}
                className="font-display bg-gradient-to-br from-uri-gold via-amber-200 to-yellow-400 bg-clip-text text-xl font-black tracking-[0.15em] text-transparent drop-shadow-[0_0_20px_rgba(197,165,40,0.55)]"
              >
                ASCENSION · LV {reward.levelAfter}
              </motion.div>
            ) : null}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
