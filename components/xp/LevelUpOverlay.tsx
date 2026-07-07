"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { xpToLevel } from "@/lib/level";
import { getLevelThresholds } from "@/lib/xpOverlayMath";
import {
  playLevelUpSound,
  playXpCompleteSound,
  playXpForgeSound,
  playXpGainSound,
  stopXpForgeSound,
  syncXpForgeFillProgress,
  vibrateLevelUp,
  vibrateXpGain,
} from "@/lib/client/xpCelebration";
import {
  buildRewardAnimationSnapshot,
  type RewardAnimationSnapshot,
} from "@/lib/client/rewardAnimationSnapshot";
import { logRewardFlow, logXpAnimation, logXpMobile } from "@/lib/client/xpAnimationDebug";
import {
  initialRingVisual,
  runXpRingCinematic,
  type XpRingVisualState,
} from "@/lib/client/runXpRingCinematic";
import {
  estimateXpOverlayDurationMs,
  XP_HIGHLIGHT_BLEND_MS,
  XP_COMPLETED_HOLD_MS,
  XP_HIGHLIGHT_HOLD_MS,
  XP_OVERLAY_ENTER_MS,
  XP_OVERLAY_POST_VISIBLE_MS,
  XP_OVERLAY_READY_HOLD_MS,
  readMobileViewport,
  xpOverlayFillDurationMs,
  type XpRewardPhase,
} from "@/lib/client/xpRewardAnimation";
import { AnimatedXPRing } from "./AnimatedXPRing";
import { MobileQrXpRewardOverlay } from "./MobileQrXpRewardOverlay";
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
  const rewardSnapshot =
    isSessionProps(props) && props.session.rewardSnapshot
      ? props.session.rewardSnapshot
      : buildRewardAnimationSnapshot(overlay.previousXP, overlay.newXP);

  return (
    <LevelUpOverlayRouter
      sessionKey={sessionKey}
      overlay={overlay}
      theme={theme}
      afterQrScan={afterQrScan}
      reduced={Boolean(reduced)}
      rewardSnapshot={rewardSnapshot}
    />
  );
}

function LevelUpOverlayRouter({
  sessionKey,
  overlay,
  theme,
  afterQrScan,
  reduced,
  rewardSnapshot,
}: {
  sessionKey: string;
  overlay: LevelUpOverlayProps;
  theme: XPGainRingTheme;
  afterQrScan: boolean;
  reduced: boolean;
  rewardSnapshot: RewardAnimationSnapshot;
}): ReactNode {
  const [mobileQrPath, setMobileQrPath] = useState<boolean | null>(() => {
    if (!afterQrScan) return false;
    if (reduced) return false;
    if (typeof window === "undefined") return null;
    return readMobileViewport();
  });

  useLayoutEffect(() => {
    setMobileQrPath(afterQrScan && !reduced && readMobileViewport());
  }, [afterQrScan, reduced]);

  if (mobileQrPath === null) return null;

  if (mobileQrPath) {
    return (
      <MobileQrXpRewardOverlay
        key={sessionKey}
        {...overlay}
        theme={theme}
        rewardSnapshot={rewardSnapshot}
        activityQuestType={overlay.activityQuestType}
        sessionKey={sessionKey}
      />
    );
  }

  return (
    <LevelUpOverlayInner
      key={sessionKey}
      {...overlay}
      reduced={Boolean(reduced)}
      theme={theme}
      afterQrScan={afterQrScan}
      rewardSnapshot={rewardSnapshot}
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
  rewardSnapshot,
}: LevelUpOverlayProps & {
  reduced: boolean;
  theme: XPGainRingTheme;
  afterQrScan?: boolean;
  rewardSnapshot: RewardAnimationSnapshot;
}) {
  const useCinematicTiming = afterQrScan && !reduced;
  const enterMs = useCinematicTiming ? XP_OVERLAY_ENTER_MS : reduced ? 0 : 280;
  const readyHoldMs = useCinematicTiming ? 0 : reduced ? 0 : 220;
  const postVisibleHoldMs = useCinematicTiming ? XP_OVERLAY_POST_VISIBLE_MS : readyHoldMs;
  const highlightHoldMs = reduced ? 200 : XP_HIGHLIGHT_HOLD_MS;
  const highlightBlendMs = reduced ? 280 : XP_HIGHLIGHT_BLEND_MS;

  /** Frozen per session so viewport hydration does not restart fill / stop audio. */
  const fillTimingRef = useRef({
    isMobile: readMobileViewport(),
    fillDurationMs: xpOverlayFillDurationMs(readMobileViewport()),
  });
  const fillDurationMs = reduced
    ? 700
    : useCinematicTiming
      ? fillTimingRef.current.fillDurationMs
      : fillTimingRef.current.isMobile
        ? 2400
        : RING_DURATION_MS;
  const minVisibleMs = minimumDurationMs;

  const snapshotRef = useRef(rewardSnapshot);
  const snapshot = snapshotRef.current;
  const useParentCinematic = useCinematicTiming && !reduced;
  const frozenIdleVisual = useMemo(() => initialRingVisual(rewardSnapshot), [rewardSnapshot]);

  const [phase, setPhase] = useState<XpRewardPhase>(() =>
    reduced ? "complete" : "overlayEntering",
  );
  const [fillEnabled, setFillEnabled] = useState(false);
  const [ringVisual, setRingVisual] = useState<XpRingVisualState>(() =>
    initialRingVisual(snapshot),
  );

  const [displayXP, setDisplayXP] = useState(snapshot.previousXP);
  const [burstLevel, setBurstLevel] = useState<number | null>(null);
  const [screenFlash, setScreenFlash] = useState(false);
  const [ringSize, setRingSize] = useState(300);
  const [glowIntensity, setGlowIntensity] = useState(1.15);
  const [exiting, setExiting] = useState(false);
  const [landingPulse, setLandingPulse] = useState(false);
  const [celebrationPulse, setCelebrationPulse] = useState(false);

  const mountAtRef = useRef(performance.now());
  const lastLevelRef = useRef(snapshot.previousLevel);
  const fanfarePlayedRef = useRef(false);
  const burstTimeoutsRef = useRef<number[]>([]);
  const completedRef = useRef(false);
  const cinematicCancelledRef = useRef(false);
  const cinematicRunIdRef = useRef(0);
  const levelUpPendingRef = useRef(snapshot.finalLevel > snapshot.previousLevel);
  const xpFillStartedRef = useRef(false);

  useEffect(() => {
    fillTimingRef.current = {
      isMobile: readMobileViewport(),
      fillDurationMs: xpOverlayFillDurationMs(readMobileViewport()),
    };
    logXpMobile("isMobile", {
      isMobile: fillTimingRef.current.isMobile,
      fillDurationMs: fillTimingRef.current.fillDurationMs,
      reduced,
      useCinematicTiming,
      afterQrScan,
    });
    logXpMobile("initial_dark_progress", { value: rewardSnapshot.previousProgress });
    logXpMobile("initial_light_progress", { value: rewardSnapshot.previousProgress });
    logXpAnimation("previousProgress", { value: rewardSnapshot.previousProgress });
    logXpAnimation("finalProgress", { value: rewardSnapshot.finalProgress });
  }, [reduced, useCinematicTiming, afterQrScan, rewardSnapshot]);

  const liveThresholds = useMemo(() => getLevelThresholds(displayXP), [displayXP]);

  useLayoutEffect(() => {
    const w = typeof window !== "undefined" ? Math.min(320, Math.max(260, window.innerWidth - 48)) : 300;
    setRingSize(w);
  }, []);

  const xpCountSpanMs = useMemo(() => {
    const gap = snapshot.segments.length > 1 ? (snapshot.segments.length - 1) * 280 : 0;
    const perSegMs = useCinematicTiming ? fillTimingRef.current.fillDurationMs : fillDurationMs;
    return snapshot.segments.length * perSegMs + gap;
  }, [fillDurationMs, snapshot.segments.length, useCinematicTiming]);

  const startCinematicRunRef = useRef<() => void>(() => {});
  const startXpFillAnimationRef = useRef<() => void>(() => {});

  startXpFillAnimationRef.current = () => {
    if (xpFillStartedRef.current || cinematicCancelledRef.current || reduced) return;
    xpFillStartedRef.current = true;

    const snap = snapshotRef.current;
    const fillMs = fillTimingRef.current.fillDurationMs;
    cinematicCancelledRef.current = false;

    setPhase("animatingXP");
    logRewardFlow("fill_started", {
      previousXP: snap.previousXP,
      finalXP: snap.finalXP,
      previousProgress: snap.previousProgress,
      finalProgress: snap.finalProgress,
      progressEqual: snap.previousProgress === snap.finalProgress,
      fillDurationMs: fillMs,
    });
    logXpAnimation("animating_xp", { afterQrScan, fillDurationMs: fillMs });

    vibrateXpGain();
    void playXpForgeSound({
      xpGained: snap.xpGained,
      leveledUp: snap.finalLevel > snap.previousLevel,
      segmentCount: snap.segments.length,
    });

    if (useParentCinematic) {
      startCinematicRunRef.current();
    } else {
      setFillEnabled(true);
    }
  };

  useEffect(() => {
    mountAtRef.current = performance.now();
    cinematicCancelledRef.current = false;
    xpFillStartedRef.current = false;
    snapshotRef.current = rewardSnapshot;
    fillTimingRef.current = {
      isMobile: readMobileViewport(),
      fillDurationMs: xpOverlayFillDurationMs(readMobileViewport()),
    };
    const snap = rewardSnapshot;

    setRingVisual(initialRingVisual(snap));
    setDisplayXP(snap.previousXP);
    lastLevelRef.current = snap.previousLevel;
    fanfarePlayedRef.current = false;
    completedRef.current = false;
    levelUpPendingRef.current = snap.finalLevel > snap.previousLevel;
    setExiting(false);
    setLandingPulse(false);
    setCelebrationPulse(false);
    setGlowIntensity(1.2);
    setFillEnabled(false);

    if (reduced) {
      setPhase("complete");
      setFillEnabled(true);
      playXpGainSound();
      vibrateXpGain();
      setDisplayXP(snap.finalXP);
      return () => {
        burstTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
        burstTimeoutsRef.current = [];
      };
    }

    logXpAnimation("overlay_entering", { enterMs });
    setPhase("overlayEntering");

    const tReady = window.setTimeout(() => {
      logXpAnimation("overlay_entered", {});
      logRewardFlow("overlay_visible", {
        previousProgress: snap.previousProgress,
        finalProgress: snap.finalProgress,
        postVisibleHoldMs,
      });
      logXpMobile("overlay_visible", { enterMs, postVisibleHoldMs });
      setPhase("overlayReady");
    }, enterMs);

    const tFill = window.setTimeout(() => {
      startXpFillAnimationRef.current();
    }, enterMs + postVisibleHoldMs);

    return () => {
      window.clearTimeout(tReady);
      window.clearTimeout(tFill);
      burstTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
      burstTimeoutsRef.current = [];
    };
  }, [
    enterMs,
    postVisibleHoldMs,
    reduced,
    rewardSnapshot.finalXP,
    rewardSnapshot.previousXP,
    rewardSnapshot.previousProgress,
    rewardSnapshot.finalProgress,
  ]);

  useEffect(() => {
    return () => {
      cinematicCancelledRef.current = true;
      cinematicRunIdRef.current += 1;
      stopXpForgeSound();
    };
  }, []);

  useEffect(() => {
    if (useParentCinematic || reduced || !fillEnabled) return;

    let raf = 0;
    const snap = snapshotRef.current;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / xpCountSpanMs);
      setDisplayXP(Math.round(snap.previousXP + (snap.finalXP - snap.previousXP) * easeOutCubic(t)));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setDisplayXP(snap.finalXP);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [fillEnabled, useParentCinematic, reduced, xpCountSpanMs]);

  const handleRingAnimationComplete = () => {
    const snap = snapshotRef.current;
    logRewardFlow("fill_complete", {
      finalProgress: snap.finalProgress,
      finalXP: snap.finalXP,
    });
    logXpMobile("fill_complete", {
      finalProgress: snap.finalProgress,
      finalXP: snap.finalXP,
    });
    stopXpForgeSound();
    void playXpCompleteSound({
      leveledUp: snap.finalLevel > snap.previousLevel,
    });
    setDisplayXP(snap.finalXP);
    setCelebrationPulse(false);
    setPhase("complete");
    scheduleExitAfterMinimum();
  };

  const handleHighlightSettling = () => {
    setPhase("highlightSettling");
  };

  function scheduleExitAfterMinimum() {
    if (completedRef.current) return;
    const ringEstimate = estimateXpOverlayDurationMs({
      isMobile: fillTimingRef.current.isMobile,
      segmentCount: snapshotRef.current.segments.length,
      reduced,
      afterQrScan: useCinematicTiming,
    });
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
    if (useParentCinematic) return;
    const snap = snapshotRef.current;
    handleHighlightSettling();
    setLandingPulse(true);
    setGlowIntensity(1.45);
    window.setTimeout(() => {
      setLandingPulse(false);
      setGlowIntensity(1.15);
    }, reduced ? 280 : 520);

    if (!levelUpPendingRef.current) return;
    const prev = lastLevelRef.current;
    for (let L = prev + 1; L <= snap.finalLevel; L++) {
      scheduleLevelBurst(L, (L - prev - 1) * (reduced ? 0 : 180));
    }
    lastLevelRef.current = snap.finalLevel;
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

  startCinematicRunRef.current = () => {
    if (!useParentCinematic || reduced || cinematicCancelledRef.current) return;

    const snap = snapshotRef.current;
    const runId = ++cinematicRunIdRef.current;
    cinematicCancelledRef.current = false;

    setRingVisual(initialRingVisual(snap));
    setDisplayXP(snap.previousXP);

    let counterRaf = 0;
    const counterStart = performance.now();
    const countSpanMs =
      snap.segments.length * fillTimingRef.current.fillDurationMs +
      (snap.segments.length > 1 ? (snap.segments.length - 1) * 280 : 0);
    const tickCounter = (now: number) => {
      if (cinematicCancelledRef.current || cinematicRunIdRef.current !== runId) return;
      const t = Math.min(1, (now - counterStart) / countSpanMs);
      setDisplayXP(Math.round(snap.previousXP + (snap.finalXP - snap.previousXP) * easeOutCubic(t)));
      if (t < 1) counterRaf = requestAnimationFrame(tickCounter);
      else setDisplayXP(snap.finalXP);
    };

    const segmentCount = snap.segments.length;
    const completedHoldMs = useCinematicTiming ? XP_COMPLETED_HOLD_MS : 0;
    const cinematicFillMs = fillTimingRef.current.fillDurationMs;

    const run = () => {
      if (cinematicCancelledRef.current || cinematicRunIdRef.current !== runId) return;

      counterRaf = requestAnimationFrame(tickCounter);

      void runXpRingCinematic({
        snapshot: snap,
        fillDurationMs: cinematicFillMs,
        highlightHoldMs,
        highlightBlendMs,
        completedHoldMs,
        leveledUp: snap.segments.length > 1,
        onVisual: setRingVisual,
        onFillProgress: (t, index) => {
          logXpAnimation("tick", {
            t: Number(t.toFixed(3)),
            index,
            progress: Number((index + t) / segmentCount).toFixed(3),
          });
          syncXpForgeFillProgress((index + t) / segmentCount);
        },
        onFillComplete: () => {
          setLandingPulse(true);
          setGlowIntensity(1.45);
          window.setTimeout(() => {
            setLandingPulse(false);
            setGlowIntensity(1.15);
          }, 520);
          if (levelUpPendingRef.current) {
            const snapNow = snapshotRef.current;
            const prev = lastLevelRef.current;
            for (let L = prev + 1; L <= snapNow.finalLevel; L++) {
              scheduleLevelBurst(L, (L - prev - 1) * 180);
            }
            lastLevelRef.current = snapNow.finalLevel;
            levelUpPendingRef.current = false;
          }
        },
        onSegmentComplete: (index) => {
          if (index > 0 && levelUpPendingRef.current) {
            const targetLevel = snap.finalLevel;
            const prev = lastLevelRef.current;
            for (let L = prev + 1; L <= targetLevel; L++) {
              scheduleLevelBurst(L, (L - prev - 1) * 180);
            }
            lastLevelRef.current = targetLevel;
            levelUpPendingRef.current = false;
          }
        },
        onCelebrationHoldStart: () => {
          setCelebrationPulse(true);
          setGlowIntensity(1.3);
        },
        onCelebrationHoldEnd: () => {
          setCelebrationPulse(false);
          setGlowIntensity(1.15);
        },
        shouldCancel: () =>
          cinematicCancelledRef.current || cinematicRunIdRef.current !== runId,
      }).then(() => {
        if (cinematicCancelledRef.current || cinematicRunIdRef.current !== runId) return;
        handleHighlightSettling();
        handleRingAnimationComplete();
      });
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
  };

  const level = xpToLevel(displayXP);

  if (typeof document === "undefined") return null;

  return createPortal(
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Experience gained"
      className="fixed inset-0 z-[10050] flex items-center justify-center overflow-hidden px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{
        duration: reduced
          ? 0.12
          : exiting
            ? FADE_OUT_MS / 1000
            : useCinematicTiming
              ? XP_OVERLAY_ENTER_MS / 1000
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
        className="relative z-10 flex max-h-[min(92dvh,760px)] w-full max-w-md flex-col items-center"
        initial={reduced ? false : { scale: 0.94, opacity: 0, filter: "blur(10px)" }}
        animate={{
          scale: burstLevel ? [1, 1.035, 1] : landingPulse ? [1, 1.02, 1] : 1,
          opacity: exiting ? 0 : phase === "overlayEntering" ? 0.35 : 1,
          y: exiting ? 8 : 0,
          filter: exiting ? "blur(4px)" : phase === "overlayEntering" ? "blur(8px)" : "blur(0px)",
        }}
        transition={{
          duration: reduced ? 0.15 : useCinematicTiming ? XP_OVERLAY_ENTER_MS / 1000 : 0.28,
          ease: [0.22, 1, 0.36, 1],
        }}
      >
        <motion.p
          className="mb-3 font-mono text-lg font-black tabular-nums text-sky-100 sm:text-xl"
          style={{ textShadow: `0 0 32px ${theme.glow}` }}
          initial={{ opacity: 0, scale: 1.02 }}
          animate={{
            opacity: phase === "overlayEntering" ? 0 : 1,
            scale: landingPulse ? [1.08, 1.14, 1.08] : [1.05, 1.08, 1.05],
          }}
          transition={{ duration: landingPulse ? 0.45 : 2.2, repeat: landingPulse ? 0 : Infinity, ease: "easeInOut" }}
        >
          +{xpGained} XP
        </motion.p>

        <AnimatedXPRing
          progressBefore={snapshot.previousProgress}
          progressAfter={snapshot.finalProgress}
          fillSegments={snapshot.segments}
          level={level}
          leveledUp={burstLevel != null || snapshot.segments.length > 1}
          durationMs={fillDurationMs}
          fillDelayMs={0}
          fillEnabled={useParentCinematic ? false : fillEnabled}
          externalVisual={
            useParentCinematic
              ? phase === "animatingXP" || phase === "highlightSettling"
                ? ringVisual
                : frozenIdleVisual
              : null
          }
          suppressEntranceMotion
          highlightHoldMs={highlightHoldMs}
          highlightBlendMs={highlightBlendMs}
          glowIntensity={celebrationPulse ? 1.32 : glowIntensity}
          completedHoldMs={useCinematicTiming ? XP_COMPLETED_HOLD_MS : 400}
          celebrationPulse={celebrationPulse}
          size={ringSize}
          strokeWidth={16}
          trackColor={theme.track}
          reducedMotion={reduced}
          onFillProgress={(t, index) => {
            syncXpForgeFillProgress((index + t) / snapshot.segments.length);
          }}
          onFillComplete={handleFillComplete}
          onCelebrationHoldStart={() => {
            setCelebrationPulse(true);
            setGlowIntensity(1.3);
          }}
          onCelebrationHoldEnd={() => {
            setCelebrationPulse(false);
            setGlowIntensity(1.15);
          }}
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
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: phase === "complete" ? 1 : 0, y: phase === "complete" ? 0 : 6 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          {activityTitle}
        </motion.p>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
