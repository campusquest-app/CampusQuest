"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { xpProgressInLevel, xpToLevel } from "@/lib/level";
import { playLevelUpFanfare } from "@/lib/playGameSound";
import { AnimatedXPRing } from "./AnimatedXPRing";
import type { ActivityXPGainSession, XPGainRingTheme } from "./xpGainTypes";
import { defaultXPGainTheme } from "./xpGainTypes";

type Props = {
  session: ActivityXPGainSession;
  theme?: XPGainRingTheme;
  onComplete: (session: ActivityXPGainSession) => void;
};

function triggerHapticCelebration() {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate?.([12, 40, 18, 55, 22]);
  } catch {
    /* ignore */
  }
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function LevelUpOverlay({ session, theme = defaultXPGainTheme, onComplete }: Props) {
  const reduced = useReducedMotion();
  const durationMs = reduced ? 650 : 2200;
  /** Extra pause before banner so the RPG overlay lingers on screen */
  const settleMs = reduced ? 120 : 420 + 1500;

  const [displayXP, setDisplayXP] = useState(session.beforeTotalXP);
  const [burstLevel, setBurstLevel] = useState<number | null>(null);
  const [screenFlash, setScreenFlash] = useState(false);
  const [ringSize, setRingSize] = useState(300);
  const [xpFloatKey, setXpFloatKey] = useState(0);
  const lastLevelRef = useRef(xpToLevel(session.beforeTotalXP));
  const fanfareForBurstRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const completedRef = useRef(false);
  const burstTimeoutsRef = useRef<number[]>([]);

  useLayoutEffect(() => {
    const w = typeof window !== "undefined" ? Math.min(320, Math.max(260, window.innerWidth - 48)) : 300;
    setRingSize(w);
  }, []);

  useEffect(() => {
    setXpFloatKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const from = session.beforeTotalXP;
    const to = session.afterTotalXP;
    const start = performance.now();
    lastLevelRef.current = xpToLevel(from);
    fanfareForBurstRef.current = false;

    function scheduleBurst(level: number, delay: number) {
      const tid = window.setTimeout(() => {
        setBurstLevel(level);
        setScreenFlash(true);
        triggerHapticCelebration();
        if (!fanfareForBurstRef.current) {
          playLevelUpFanfare();
          fanfareForBurstRef.current = true;
        }
        window.setTimeout(() => setBurstLevel(null), reduced ? 400 : 780);
        window.setTimeout(() => setScreenFlash(false), reduced ? 80 : 200);
      }, delay);
      burstTimeoutsRef.current.push(tid);
    }

    function frame(now: number) {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / durationMs);
      const eased = easeOutCubic(t);
      const value = Math.round(from + (to - from) * eased);
      setDisplayXP(value);

      const lvl = xpToLevel(value);
      if (lvl > lastLevelRef.current) {
        const prev = lastLevelRef.current;
        for (let L = prev + 1; L <= lvl; L++) {
          const delay = (L - prev - 1) * (reduced ? 0 : 200);
          scheduleBurst(L, delay);
        }
        lastLevelRef.current = lvl;
      }

      if (t < 1) {
        rafRef.current = requestAnimationFrame(frame);
      } else if (!completedRef.current) {
        completedRef.current = true;
        setDisplayXP(to);
        window.setTimeout(() => onComplete(session), settleMs);
      }
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      burstTimeoutsRef.current.forEach((id) => clearTimeout(id));
      burstTimeoutsRef.current = [];
    };
  }, [session, durationMs, onComplete, reduced, settleMs]);

  const level = xpToLevel(displayXP);
  const { current, needed } = xpProgressInLevel(displayXP);
  const ringProgress = needed > 0 ? current / needed : 0;
  const xpToNext = Math.max(0, needed - current);

  if (typeof document === "undefined") return null;

  return createPortal(
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Experience gained"
      className="fixed inset-0 z-[115] flex items-center justify-center overflow-hidden px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0.12 : 0.32 }}
    >
      <div className="absolute inset-0 bg-[#020617]/92 backdrop-blur-xl" aria-hidden />
      <motion.div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 80% 55% at 50% 38%, rgba(56, 189, 248, 0.35) 0%, transparent 55%), radial-gradient(ellipse 60% 40% at 50% 100%, rgba(104, 171, 232, 0.15) 0%, transparent 50%)",
        }}
        animate={reduced ? undefined : { opacity: [0.25, 0.5, 0.25] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />

      <AnimatePresence>
        {screenFlash && (
          <motion.div
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-sky-200/30 via-uri-keaney/20 to-transparent"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.85, 0] }}
            transition={{ duration: reduced ? 0.1 : 0.35 }}
          />
        )}
      </AnimatePresence>

      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {Array.from({ length: reduced ? 8 : 24 }).map((_, i) => (
            <motion.span
              key={i}
              className="absolute h-1 w-1 rounded-full bg-sky-200/80 shadow-[0_0_8px_rgba(125,211,252,0.9)]"
              style={{
                left: `${(i * 37) % 100}%`,
                top: `${(i * 23 + 15) % 100}%`,
              }}
              animate={{
                y: [0, -40 - (i % 5) * 8],
                x: [0, (i % 3) * 6 - 6],
                opacity: [0.2, 1, 0.2],
                scale: [0.6, 1.2, 0.6],
              }}
              transition={{
                duration: 3 + (i % 4) * 0.4,
                repeat: Infinity,
                delay: i * 0.08,
                ease: "easeInOut",
              }}
            />
          ))}
      </div>

      <motion.div
        className="relative z-10 flex max-h-[min(92vh,720px)] w-full max-w-md flex-col items-center"
        initial={{ scale: 0.88, opacity: 0, filter: "blur(6px)" }}
        animate={{
          scale: burstLevel ? [1, 1.03, 1] : 1,
          opacity: 1,
          filter: "blur(0px)",
        }}
        transition={{
          duration: reduced ? 0.12 : 0.5,
          scale: { duration: burstLevel ? 0.4 : 0.5 },
        }}
      >
        <motion.div
          key={xpFloatKey}
          className="pointer-events-none absolute -top-2 left-1/2 z-20 -translate-x-1/2 font-display text-2xl font-black tabular-nums text-sky-200 sm:text-3xl"
          style={{ textShadow: "0 0 24px rgba(56, 189, 248, 0.9)" }}
          initial={{ opacity: 0, y: 24, scale: 0.75 }}
          animate={{ opacity: [0, 1, 1, 0], y: [24, -6, -18, -40], scale: [0.75, 1.06, 1, 0.95] }}
          transition={{ duration: reduced ? 0.45 : 1.55, times: [0, 0.12, 0.65, 1] }}
        >
          +{session.xpGained} XP
        </motion.div>

        <AnimatedXPRing
          progress={ringProgress}
          size={ringSize}
          strokeWidth={16}
          ringColor={theme.ring}
          trackColor="rgba(15, 40, 82, 0.92)"
          reducedMotion={reduced ?? false}
        >
          <div className="flex max-w-[13rem] flex-col items-center">
            <span className="font-display text-5xl font-black tabular-nums tracking-tight text-white drop-shadow-[0_0_20px_rgba(104,171,232,0.6)] sm:text-6xl">
              {level}
            </span>
            <span className="mt-1 font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-200/85 sm:text-xs">
              Campus Adventurer
            </span>
          </div>
        </AnimatedXPRing>

        <div className="mt-2 flex flex-col items-center gap-1 text-center">
          <p className="font-mono text-sm text-white/90">
            <span className="text-uri-keaney">{current.toLocaleString()}</span>
            <span className="text-white/35"> / </span>
            <span className="text-white/75">{needed.toLocaleString()} XP</span>
          </p>
          <p className="text-xs text-sky-200/75">
            {xpToNext > 0 ? (
              <>
                <span className="font-semibold text-sky-100">{xpToNext.toLocaleString()} XP</span> to next level
              </>
            ) : (
              <span className="text-uri-gold/90">Maxed for this level — keep going!</span>
            )}
          </p>
        </div>

        <AnimatePresence>
          {burstLevel != null && (
            <motion.div
              className="pointer-events-none absolute left-1/2 top-[12%] z-30 w-[min(92vw,20rem)] -translate-x-1/2"
              initial={{ opacity: 0, y: 8, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: [0.94, 1.02, 1] }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: reduced ? 0.15 : 0.38 }}
            >
              <div
                className="rounded-2xl border border-sky-300/50 bg-uri-navy/95 px-4 py-3 text-center shadow-[0_0_32px_rgba(56,189,248,0.45)]"
                style={{ boxShadow: `0 0 40px ${theme.glow}` }}
              >
                <p className="font-display text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-sky-200 via-uri-keaney to-sky-300 sm:text-3xl">
                  LEVEL UP
                </p>
                <p className="font-display text-sm font-bold text-white">Level {burstLevel}</p>
                <p className="mt-0.5 text-[11px] text-sky-200/80">Skill point unlocked · Skill tree on Character</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="mt-6 max-w-sm text-center text-sm font-medium text-white/85">{session.title}</p>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
