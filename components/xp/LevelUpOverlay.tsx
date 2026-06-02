"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { xpToLevel } from "@/lib/level";
import {
  computeVisualProgressKeyframes,
  computeXpRingFillPlan,
  getLevelThresholds,
} from "@/lib/xpOverlayMath";
import {
  playLevelUpSound,
  playXpGainSound,
  vibrateLevelUp,
  vibrateXpGain,
} from "@/lib/client/xpCelebration";
import {
  XP_HIGHLIGHT_BLEND_MS,
  XP_HIGHLIGHT_HOLD_MS,
  XP_SCREEN_ENTER_MS,
  xpFillDurationMs,
  xpFillStartDelayMs,
} from "@/lib/client/scanRewardFlow";
import { useMobileViewport } from "@/lib/client/useMobileViewport";
import { AnimatedXPRing } from "./AnimatedXPRing";
import type { ActivityXPGainSession, LevelUpOverlayProps, XPGainRingTheme } from "./xpGainTypes";
import { defaultXPGainTheme, sessionToLevelUpOverlayProps } from "./xpGainTypes";

type Props =
  | LevelUpOverlayProps
  | {
      session: ActivityXPGainSession;
      theme?: XPGainRingTheme;
      onComplete: (session: ActivityXPGainSession) => void;
      minimumDurationMs?: number;
    };

function isSessionProps(p: Props): p is {
  session: ActivityXPGainSession;
  theme?: XPGainRingTheme;
  onComplete: (session: ActivityXPGainSession) => void;
  minimumDurationMs?: number;
} {
  return "session" in p;
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

const RING_DURATION_MS = 3000;
const FADE_OUT_MS = 500;
const PARTICLE_COUNT = 18;

export function LevelUpOverlay(props: Props) {
  const reduced = useReducedMotion();
  const minimumDurationMs = isSessionProps(props) ? (props.minimumDurationMs ?? 5000) : (props.minimumDurationMs ?? 5000);
  const theme = isSessionProps(props) ? (props.theme ?? defaultXPGainTheme) : (props.theme ?? defaultXPGainTheme);
  const sessionKey = isSessionProps(props) ? props.session.sessionKey : "level-up-overlay";

  const overlay: LevelUpOverlayProps = isSessionProps(props)
    ? sessionToLevelUpOverlayProps(props.session, () => props.onComplete(props.session), minimumDurationMs)
    : props;

  if (!overlay.isOpen) return null;

  const afterQrScan = isSessionProps(props) ? Boolean(props.session.afterQrScan) : false;

  return (
    <LevelUpOverlayInner
      key={sessionKey}
      {...overlay}
      reduced={Boolean(reduced)}
      theme={theme}
      afterQrScan={afterQrScan}
    />
  );
}

function LevelUpOverlayInner({
  activityTitle,
  xpGained,
  previousXP,
  newXP,
  progressBefore,
  progressAfter,
  onComplete,
  minimumDurationMs = 5000,
  reduced,
  theme,
  activityQuestType,
  afterQrScan = false,
}: LevelUpOverlayProps & { reduced: boolean; theme: XPGainRingTheme; afterQrScan?: boolean }) {
  const isMobile = useMobileViewport();
  const fillStartDelayMs = afterQrScan && !reduced ? xpFillStartDelayMs() : reduced ? 0 : 300;
  const highlightHoldMs = reduced ? 200 : XP_HIGHLIGHT_HOLD_MS;
  const highlightBlendMs = reduced ? 280 : XP_HIGHLIGHT_BLEND_MS;
  const fillDurationMs = afterQrScan
    ? reduced
      ? 700
      : xpFillDurationMs(isMobile)
    : reduced
      ? 800
      : RING_DURATION_MS;
  const minVisibleMs = minimumDurationMs;
  const [fillEnabled, setFillEnabled] = useState(!afterQrScan || reduced);
  const progressKeyframes = useMemo(
    () => computeVisualProgressKeyframes(progressBefore, progressAfter, xpGained),
    [progressAfter, progressBefore, xpGained],
  );
  const ringFillPlan = useMemo(
    () => computeXpRingFillPlan(previousXP, newXP),
    [newXP, previousXP],
  );

  const [displayXP, setDisplayXP] = useState(previousXP);
  const [burstLevel, setBurstLevel] = useState<number | null>(null);
  const [screenFlash, setScreenFlash] = useState(false);
  const [ringSize, setRingSize] = useState(300);
  const [glowIntensity, setGlowIntensity] = useState(1.15);
  const [exiting, setExiting] = useState(false);
  const [landingPulse, setLandingPulse] = useState(false);

  const mountAtRef = useRef(performance.now());
  const lastLevelRef = useRef(xpToLevel(previousXP));
  const fanfarePlayedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const burstTimeoutsRef = useRef<number[]>([]);
  const completedRef = useRef(false);
  const levelUpPendingRef = useRef(xpToLevel(newXP) > xpToLevel(previousXP));

  const liveThresholds = useMemo(() => getLevelThresholds(displayXP), [displayXP]);

  useLayoutEffect(() => {
    const w = typeof window !== "undefined" ? Math.min(320, Math.max(260, window.innerWidth - 48)) : 300;
    setRingSize(w);
  }, []);

  const xpCountSpanMs = useMemo(() => {
    const gap = ringFillPlan.segments.length > 1 ? (ringFillPlan.segments.length - 1) * 220 : 0;
    return ringFillPlan.segments.length * fillDurationMs + gap;
  }, [fillDurationMs, ringFillPlan.segments.length]);

  useEffect(() => {
    if (!afterQrScan || reduced) {
      setFillEnabled(true);
      return;
    }
    setFillEnabled(false);
    const t = window.setTimeout(() => setFillEnabled(true), fillStartDelayMs);
    return () => window.clearTimeout(t);
  }, [afterQrScan, reduced, fillStartDelayMs]);

  useEffect(() => {
    mountAtRef.current = performance.now();
    setDisplayXP(previousXP);
    lastLevelRef.current = xpToLevel(previousXP);
    fanfarePlayedRef.current = false;
    completedRef.current = false;
    levelUpPendingRef.current = xpToLevel(newXP) > xpToLevel(previousXP);
    setExiting(false);
    setLandingPulse(false);
    setGlowIntensity(1.2);

    if (reduced) {
      playXpGainSound();
      vibrateXpGain();
      setDisplayXP(newXP);
    }

    return () => {
      burstTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
      burstTimeoutsRef.current = [];
    };
  }, [newXP, previousXP, reduced]);

  useEffect(() => {
    if (!fillEnabled || reduced) return;

    playXpGainSound();
    vibrateXpGain();

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / xpCountSpanMs);
      setDisplayXP(Math.round(previousXP + (newXP - previousXP) * easeOutCubic(t)));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setDisplayXP(newXP);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [fillEnabled, newXP, previousXP, reduced, xpCountSpanMs]);

  const handleRingAnimationComplete = () => {
    setDisplayXP(newXP);
    scheduleExitAfterMinimum();
  };

  function scheduleExitAfterMinimum() {
    if (completedRef.current) return;
    const segmentGap = ringFillPlan.segments.length > 1 ? (ringFillPlan.segments.length - 1) * 220 : 0;
    const ringEstimate =
      fillStartDelayMs +
      segmentGap +
      ringFillPlan.segments.length * (fillDurationMs + highlightHoldMs + highlightBlendMs + 140);
    const elapsed = performance.now() - mountAtRef.current;
    const wait = Math.max(0, Math.max(minVisibleMs, ringEstimate + 320) - elapsed);
    const exitTimer = window.setTimeout(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      setExiting(true);
      window.setTimeout(() => onComplete(), reduced ? 120 : FADE_OUT_MS);
    }, wait);
    burstTimeoutsRef.current.push(exitTimer);
  }

  const handleFillComplete = () => {
    setLandingPulse(true);
    setGlowIntensity(1.45);
    window.setTimeout(() => {
      setLandingPulse(false);
      setGlowIntensity(1.15);
    }, reduced ? 280 : 520);

    if (!levelUpPendingRef.current) return;
    const targetLevel = xpToLevel(newXP);
    const prev = lastLevelRef.current;
    for (let L = prev + 1; L <= targetLevel; L++) {
      scheduleLevelBurst(L, (L - prev - 1) * (reduced ? 0 : 180));
    }
    lastLevelRef.current = targetLevel;
    levelUpPendingRef.current = false;
  };

  function scheduleLevelBurst(level: number, delay: number) {
    const tid = window.setTimeout(() => {
      setBurstLevel(level);
      setScreenFlash(true);
      setGlowIntensity(1.55);
      vibrateLevelUp();
      if (!fanfarePlayedRef.current) {
        playLevelUpSound();
        fanfarePlayedRef.current = true;
      }
      window.setTimeout(() => setBurstLevel(null), reduced ? 420 : 900);
      window.setTimeout(() => setScreenFlash(false), reduced ? 90 : 240);
      window.setTimeout(() => setGlowIntensity(1.15), reduced ? 500 : 1000);
    }, delay);
    burstTimeoutsRef.current.push(tid);
  }

  const level = xpToLevel(displayXP);

  if (typeof document === "undefined") return null;

  return createPortal(
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Experience gained"
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{
        duration: reduced
          ? 0.12
          : exiting
            ? FADE_OUT_MS / 1000
            : afterQrScan
              ? XP_SCREEN_ENTER_MS / 1000
              : 0.22,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <div className="absolute inset-0 bg-[#020617]/96 backdrop-blur-xl" aria-hidden />

      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 85% 60% at 50% 35%, rgba(56, 189, 248, 0.42) 0%, transparent 58%), radial-gradient(ellipse 70% 50% at 50% 100%, rgba(104, 171, 232, 0.14) 0%, transparent 55%)",
        }}
        animate={reduced || exiting ? undefined : { opacity: [0.35, 0.6, 0.38] }}
        transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
      />

      <AnimatePresence>
        {screenFlash && (
          <motion.div
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-sky-100/35 via-uri-keaney/25 to-transparent"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.9, 0] }}
            transition={{ duration: reduced ? 0.12 : 0.4 }}
          />
        )}
      </AnimatePresence>

      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {Array.from({ length: reduced ? 8 : PARTICLE_COUNT }).map((_, i) => (
          <motion.span
            key={i}
            className="absolute rounded-full bg-sky-200/90 shadow-[0_0_10px_rgba(125,211,252,0.85)]"
            style={{
              width: 2 + (i % 3),
              height: 2 + (i % 3),
              left: `${(i * 41) % 100}%`,
              top: `${(i * 29 + 10) % 100}%`,
            }}
            animate={
              exiting
                ? { opacity: 0 }
                : {
                    y: [0, -50 - (i % 6) * 10],
                    opacity: [0.15, 1, 0.15],
                    scale: [0.5, 1.3, 0.5],
                  }
            }
            transition={{
              duration: 2.8 + (i % 5) * 0.35,
              repeat: exiting ? 0 : Infinity,
              delay: i * 0.07,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      <motion.div
        className="relative z-10 flex max-h-[min(92vh,760px)] w-full max-w-md flex-col items-center"
        initial={reduced ? false : { scale: 0.94, opacity: 0, filter: "blur(10px)" }}
        animate={{
          scale: burstLevel ? [1, 1.035, 1] : landingPulse ? [1, 1.02, 1] : 1,
          opacity: exiting ? 0 : 1,
          y: exiting ? 8 : 0,
          filter: exiting ? "blur(4px)" : "blur(0px)",
        }}
        transition={{
          duration: reduced ? 0.15 : afterQrScan ? XP_SCREEN_ENTER_MS / 1000 : 0.28,
          ease: [0.22, 1, 0.36, 1],
        }}
      >
        <motion.p
          className="mb-3 font-mono text-lg font-black tabular-nums text-sky-100 sm:text-xl"
          style={{ textShadow: `0 0 32px ${theme.glow}` }}
          initial={{ opacity: 1, scale: 1.08, y: 0 }}
          animate={{ opacity: 1, scale: landingPulse ? [1.08, 1.14, 1.08] : [1.05, 1.08, 1.05] }}
          transition={{ duration: landingPulse ? 0.45 : 2.2, repeat: landingPulse ? 0 : Infinity, ease: "easeInOut" }}
        >
          +{xpGained} XP
        </motion.p>

        <AnimatedXPRing
          progressBefore={progressKeyframes.start}
          progressAfter={progressKeyframes.end}
          fillSegments={ringFillPlan.segments}
          level={level}
          leveledUp={burstLevel != null || ringFillPlan.segments.length > 1}
          durationMs={fillDurationMs}
          fillDelayMs={0}
          fillEnabled={fillEnabled}
          highlightHoldMs={highlightHoldMs}
          highlightBlendMs={highlightBlendMs}
          glowIntensity={glowIntensity}
          size={ringSize}
          strokeWidth={16}
          trackColor={theme.track}
          reducedMotion={reduced}
          onFillComplete={handleFillComplete}
          onAnimationComplete={handleRingAnimationComplete}
        >
          <div className="flex max-w-[13rem] flex-col items-center">
            <span className="font-display text-5xl font-black tabular-nums tracking-tight text-white drop-shadow-[0_0_24px_rgba(104,171,232,0.65)] sm:text-6xl">
              {level}
            </span>
            <span className="mt-1 font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-200/90 sm:text-xs">
              Campus Adventurer
            </span>
          </div>
        </AnimatedXPRing>

        <div className="mt-3 flex flex-col items-center gap-1 text-center">
          <p className="font-mono text-sm text-white/92">
            <span className="font-semibold text-uri-keaney">{liveThresholds.progressCurrent.toLocaleString()}</span>
            <span className="text-white/35"> / </span>
            <span className="text-white/78">{liveThresholds.progressNeeded.toLocaleString()} XP</span>
          </p>
          <p className="text-xs text-sky-200/80">
            {liveThresholds.xpToNext > 0 ? (
              <>
                <span className="font-semibold text-sky-100">{liveThresholds.xpToNext.toLocaleString()} XP</span> to next
                level
              </>
            ) : (
              <span className="text-uri-gold/90">Level bar full — keep adventuring!</span>
            )}
          </p>
          {activityQuestType ? (
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300/75">
              {activityQuestType}
            </p>
          ) : null}
        </div>

        <AnimatePresence>
          {burstLevel != null && (
            <motion.div
              className="pointer-events-none absolute left-1/2 top-[8%] z-30 w-[min(92vw,20rem)] -translate-x-1/2"
              initial={{ opacity: 0, y: 12, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: [0.92, 1.05, 1] }}
              exit={{ opacity: 0, y: -8 }}
            >
              <div
                className="rounded-2xl border border-sky-300/55 bg-uri-navy/95 px-5 py-3 text-center shadow-[0_0_48px_rgba(56,189,248,0.5)]"
                style={{ boxShadow: `0 0 48px ${theme.glow}` }}
              >
                <p className="font-display text-2xl font-black tracking-[0.12em] text-transparent bg-clip-text bg-gradient-to-r from-sky-100 via-white to-sky-300 sm:text-3xl">
                  LEVEL UP
                </p>
                <p className="font-display text-sm font-bold text-white">Level {burstLevel}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.p
          className="mt-6 max-w-sm text-balance text-center text-base font-semibold leading-snug text-white/92 sm:text-lg"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.12 }}
        >
          {activityTitle}
        </motion.p>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
