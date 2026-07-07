"use client";

import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { xpToLevel } from "@/lib/level";
import { getLevelThresholds } from "@/lib/xpOverlayMath";
import { logRewardFlow, logScanner } from "@/lib/client/xpAnimationDebug";
import { logMobileXp } from "@/lib/client/mobileXpAnimationDebug";
import {
  playMobileForgeSound,
  stopMobileForgeSound,
} from "@/lib/client/mobileXpForgeAudio";
import {
  mobileInitialRingVisual,
  runMobileXpRewardFill,
  waitTwoAnimationFrames,
} from "@/lib/client/runMobileXpRewardFill";
import type { XpRingVisualState } from "@/lib/client/runXpRingCinematic";
import {
  XP_COMPLETED_HOLD_MS,
  XP_FILL_MS_MOBILE,
  XP_HIGHLIGHT_BLEND_MS,
  XP_HIGHLIGHT_HOLD_MS,
  XP_OVERLAY_ENTER_MS,
  XP_OVERLAY_POST_VISIBLE_MS,
} from "@/lib/client/xpRewardAnimation";
import {
  playLevelUpSound,
  playXpCompleteSound,
  vibrateLevelUp,
  vibrateXpGain,
} from "@/lib/client/xpCelebration";
import type { RewardAnimationSnapshot } from "@/lib/client/rewardAnimationSnapshot";
import type { LevelUpOverlayProps, XPGainRingTheme } from "./xpGainTypes";
import { AnimatedXPRing } from "./AnimatedXPRing";

const FADE_OUT_MS = 500;

type Props = LevelUpOverlayProps & {
  theme: XPGainRingTheme;
  rewardSnapshot: RewardAnimationSnapshot;
  activityQuestType?: string;
  sessionKey?: string;
};

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** Mobile QR reward — rAF ring fill (no Framer on ring); desktop uses LevelUpOverlayInner. */
export function MobileQrXpRewardOverlay({
  activityTitle,
  xpGained,
  onComplete,
  minimumDurationMs = 5000,
  theme,
  activityQuestType,
  rewardSnapshot,
  sessionKey,
}: Props) {
  const snapshotRef = useRef(rewardSnapshot);
  snapshotRef.current = rewardSnapshot;

  const snapshotKey =
    sessionKey ??
    `${rewardSnapshot.previousXP}-${rewardSnapshot.finalXP}-${rewardSnapshot.xpGained}`;

  const fillRunIdRef = useRef(0);
  const cancelledRef = useRef(false);
  const completedRef = useRef(false);
  const mountAtRef = useRef(0);
  const exitTimersRef = useRef<number[]>([]);
  const fanfarePlayedRef = useRef(false);

  const [ringVisual, setRingVisual] = useState<XpRingVisualState>(() =>
    mobileInitialRingVisual(rewardSnapshot),
  );
  const [displayXP, setDisplayXP] = useState(rewardSnapshot.previousXP);
  const [phase, setPhase] = useState<"entering" | "ready" | "filling" | "complete">("entering");
  const [backdropVisible, setBackdropVisible] = useState(false);
  const [contentVisible, setContentVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [ringSize, setRingSize] = useState(300);
  const [burstLevel, setBurstLevel] = useState<number | null>(null);

  const leveledUp = rewardSnapshot.finalLevel > rewardSnapshot.previousLevel;

  const fillRatio = useMemo(() => {
    const span = rewardSnapshot.finalXP - rewardSnapshot.previousXP;
    if (span <= 0) return 1;
    return easeOutCubic(
      Math.max(0, Math.min(1, (displayXP - rewardSnapshot.previousXP) / span)),
    );
  }, [displayXP, rewardSnapshot.finalXP, rewardSnapshot.previousXP]);

  const ringProgressLabel = useMemo(() => {
    const progress =
      rewardSnapshot.previousProgress +
      (rewardSnapshot.finalProgress - rewardSnapshot.previousProgress) * fillRatio;
    const syntheticXp =
      rewardSnapshot.previousXP +
      (rewardSnapshot.finalXP - rewardSnapshot.previousXP) * fillRatio;
    const t = getLevelThresholds(Math.round(syntheticXp));
    return {
      progressCurrent: Math.round(t.progressCurrent),
      progressNeeded: t.progressNeeded,
      xpToNext: t.xpToNext,
    };
  }, [fillRatio, rewardSnapshot]);

  const level = xpToLevel(displayXP);

  useLayoutEffect(() => {
    const w = typeof window !== "undefined" ? Math.min(320, Math.max(260, window.innerWidth - 48)) : 300;
    setRingSize(w);
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    completedRef.current = false;
    fanfarePlayedRef.current = false;
    fillRunIdRef.current += 1;
    mountAtRef.current = performance.now();

    const snap = snapshotRef.current;
    logScanner("xp_overlay_mount", { session: "mobile_qr", sessionKey: snapshotKey });
    logRewardFlow("overlay_visible", {
      previousProgress: snap.previousProgress,
      finalProgress: snap.finalProgress,
      mobile: true,
    });
    logMobileXp("snapshot", {
      previousXP: snap.previousXP,
      finalXP: snap.finalXP,
      xpGained: snap.xpGained,
      previousProgress: snap.previousProgress,
      finalProgress: snap.finalProgress,
    });
    logMobileXp("previous_progress", { value: snap.previousProgress });
    logMobileXp("final_progress", { value: snap.finalProgress });

    setRingVisual(mobileInitialRingVisual(snap));
    setDisplayXP(snap.previousXP);
    setPhase("entering");
    setBackdropVisible(false);
    setContentVisible(false);
    setExiting(false);
    setBurstLevel(null);

    const runId = fillRunIdRef.current;
    let enterTimer = 0;
    let fillTimer = 0;

    requestAnimationFrame(() => {
      setBackdropVisible(true);
      setContentVisible(true);
    });

    void (async () => {
      await waitTwoAnimationFrames();
      if (cancelledRef.current || fillRunIdRef.current !== runId) return;

      enterTimer = window.setTimeout(() => {
        if (cancelledRef.current || fillRunIdRef.current !== runId) return;
        setPhase("ready");
        logRewardFlow("overlay_visible", {
          previousProgress: snap.previousProgress,
          finalProgress: snap.finalProgress,
          mobile: true,
          postVisibleHoldMs: XP_OVERLAY_POST_VISIBLE_MS,
        });

        fillTimer = window.setTimeout(() => {
          if (cancelledRef.current || fillRunIdRef.current !== runId) return;

          logMobileXp("raf_started", {
            durationMs: XP_FILL_MS_MOBILE,
            previousProgress: snap.previousProgress,
            finalProgress: snap.finalProgress,
          });
          logRewardFlow("fill_started", { mobile: true, fillDurationMs: XP_FILL_MS_MOBILE });

          setPhase("filling");
          vibrateXpGain();

          void (async () => {
            const audioOk = await playMobileForgeSound();
            if (!audioOk) {
              logMobileXp("raf_started", { audio: "play_failed" });
            }

            await runMobileXpRewardFill({
              snapshot: snap,
              fillDurationMs: XP_FILL_MS_MOBILE,
              blendMs: XP_HIGHLIGHT_BLEND_MS,
              holdMs: XP_HIGHLIGHT_HOLD_MS,
              completedHoldMs: XP_COMPLETED_HOLD_MS,
              onVisual: setRingVisual,
              onDisplayXP: setDisplayXP,
              shouldCancel: () => cancelledRef.current || fillRunIdRef.current !== runId,
            });

            if (cancelledRef.current || fillRunIdRef.current !== runId) return;

            stopMobileForgeSound();
            void playXpCompleteSound({ leveledUp });

            if (leveledUp && !fanfarePlayedRef.current) {
              fanfarePlayedRef.current = true;
              setBurstLevel(snap.finalLevel);
              vibrateLevelUp();
              playLevelUpSound();
              window.setTimeout(() => setBurstLevel(null), 900);
            }

            logRewardFlow("fill_complete", { mobile: true, finalXP: snap.finalXP });
            logMobileXp("raf_complete", { finalXP: snap.finalXP });
            setPhase("complete");

            const elapsed = performance.now() - mountAtRef.current;
            const wait = Math.max(0, minimumDurationMs - elapsed);
            const exitTimer = window.setTimeout(() => {
              if (completedRef.current) return;
              completedRef.current = true;
              setExiting(true);
              window.setTimeout(() => onComplete(), FADE_OUT_MS);
            }, wait);
            exitTimersRef.current.push(exitTimer);
          })();
        }, XP_OVERLAY_POST_VISIBLE_MS);
      }, XP_OVERLAY_ENTER_MS);
    })();

    return () => {
      cancelledRef.current = true;
      fillRunIdRef.current += 1;
      window.clearTimeout(enterTimer);
      window.clearTimeout(fillTimer);
      stopMobileForgeSound();
      exitTimersRef.current.forEach((id) => window.clearTimeout(id));
      exitTimersRef.current = [];
    };
  }, [leveledUp, minimumDurationMs, onComplete, snapshotKey]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Experience gained"
      className="fixed inset-0 z-[10050] flex items-center justify-center overflow-hidden px-4"
      style={{
        opacity: exiting ? 0 : backdropVisible ? 1 : 0,
        transition: `opacity ${exiting ? FADE_OUT_MS : XP_OVERLAY_ENTER_MS}ms ease-out`,
      }}
    >
      <div className="absolute inset-0 bg-[#020617]/96 backdrop-blur-xl" aria-hidden />

      <div
        className="relative z-10 flex max-h-[min(92dvh,760px)] w-full max-w-md flex-col items-center"
        style={{
          opacity: contentVisible && !exiting ? 1 : 0,
          transform: contentVisible ? "scale(1)" : "scale(0.96)",
          filter: contentVisible ? "blur(0)" : "blur(8px)",
          transition: `opacity ${XP_OVERLAY_ENTER_MS}ms ease-out, transform ${XP_OVERLAY_ENTER_MS}ms ease-out, filter ${XP_OVERLAY_ENTER_MS}ms ease-out`,
          willChange: "opacity, transform",
        }}
      >
        <p
          className="mb-3 font-mono text-lg font-black tabular-nums text-sky-100"
          style={{ textShadow: `0 0 32px ${theme.glow}` }}
        >
          +{xpGained} XP
        </p>

        <AnimatedXPRing
          progressBefore={rewardSnapshot.previousProgress}
          progressAfter={rewardSnapshot.finalProgress}
          fillSegments={rewardSnapshot.segments}
          level={level}
          leveledUp={leveledUp || burstLevel != null}
          durationMs={XP_FILL_MS_MOBILE}
          fillEnabled={false}
          externalVisual={ringVisual}
          suppressEntranceMotion
          disableWrapperMotion
          highlightHoldMs={XP_HIGHLIGHT_HOLD_MS}
          highlightBlendMs={XP_HIGHLIGHT_BLEND_MS}
          completedHoldMs={XP_COMPLETED_HOLD_MS}
          size={ringSize}
          strokeWidth={16}
          trackColor={theme.track}
          reducedMotion={false}
        >
          <div className="flex max-w-[13rem] flex-col items-center">
            <span className="font-display text-5xl font-black tabular-nums tracking-tight text-white drop-shadow-[0_0_24px_rgba(104,171,232,0.65)]">
              {level}
            </span>
            <span className="mt-1 font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-200/90">
              Campus Adventurer
            </span>
          </div>
        </AnimatedXPRing>

        <div className="mt-3 flex flex-col items-center gap-1 text-center">
          <p className="font-mono text-sm text-white/92">
            <span className="font-semibold text-uri-keaney">{ringProgressLabel.progressCurrent.toLocaleString()}</span>
            <span className="text-white/35"> / </span>
            <span className="text-white/78">{ringProgressLabel.progressNeeded.toLocaleString()} XP</span>
          </p>
          <p className="text-xs text-sky-200/80">
            {ringProgressLabel.xpToNext > 0 ? (
              <>
                <span className="font-semibold text-sky-100">{ringProgressLabel.xpToNext.toLocaleString()} XP</span> to
                next level
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

        {burstLevel != null ? (
          <div className="pointer-events-none absolute left-1/2 top-[8%] z-30 w-[min(92vw,20rem)] -translate-x-1/2">
            <div
              className="rounded-2xl border border-sky-300/55 bg-uri-navy/95 px-5 py-3 text-center shadow-[0_0_48px_rgba(56,189,248,0.5)]"
              style={{ boxShadow: `0 0 48px ${theme.glow}` }}
            >
              <p className="font-display text-2xl font-black tracking-[0.12em] text-sky-100">LEVEL UP</p>
              <p className="font-display text-sm font-bold text-white">Level {burstLevel}</p>
            </div>
          </div>
        ) : null}

        <p
          className="mt-6 max-w-sm text-balance text-center text-base font-semibold leading-snug text-white/92"
          style={{
            opacity: phase === "complete" ? 1 : 0,
            transform: phase === "complete" ? "translateY(0)" : "translateY(6px)",
            transition: "opacity 0.35s ease-out, transform 0.35s ease-out",
          }}
        >
          {activityTitle}
        </p>
      </div>
    </div>,
    document.body,
  );
}
