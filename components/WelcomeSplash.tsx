"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { LaunchSplashFrame } from "@/components/LaunchSplashFrame";
import { SPLASH_LAUNCH_FADEOUT_MS, SPLASH_LAUNCH_STATUS } from "@/components/welcome/splashTiming";
import { useRegisterImmersiveScreen } from "@/lib/client/nestedImmersiveScreen";
import { hideNativeSplashScreen } from "@/lib/client/capacitorNative";

export type WelcomeSplashProps = {
  onComplete: () => void;
  /** Kept for existing call sites. Launch splash is the only startup presentation. */
  mode?: "launch" | "cinematic";
  /** Existing bootstrap/routing decision is ready. Animation never blocks this. */
  readyToDismiss?: boolean;
};

export function WelcomeSplash({ onComplete, readyToDismiss = false }: WelcomeSplashProps) {
  const reduceMotion = useReducedMotion();
  const [playIntro] = useState(() => !readyToDismiss);
  const [phase, setPhase] = useState<"visible" | "fading">("visible");

  useRegisterImmersiveScreen(true);

  useLayoutEffect(() => {
    void hideNativeSplashScreen();
  }, []);

  useEffect(() => {
    if (!readyToDismiss || phase !== "visible") return undefined;
    setPhase("fading");
    return undefined;
  }, [readyToDismiss, phase]);

  useEffect(() => {
    if (phase !== "fading") return undefined;
    const doneTimer = window.setTimeout(onComplete, SPLASH_LAUNCH_FADEOUT_MS);
    return () => window.clearTimeout(doneTimer);
  }, [phase, onComplete]);

  const splashClass = [
    "cq-launch-splash",
    playIntro && !reduceMotion ? "cq-launch-splash--intro" : "",
    reduceMotion ? "cq-launch-splash--reduced" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <motion.div
      className={splashClass}
      initial={false}
      animate={{ opacity: phase === "fading" ? 0 : 1 }}
      transition={{ duration: SPLASH_LAUNCH_FADEOUT_MS / 1000, ease: [0.4, 0, 0.2, 1] }}
      role="status"
      aria-live="polite"
      aria-busy={phase === "visible"}
      aria-label={SPLASH_LAUNCH_STATUS}
    >
      <LaunchSplashFrame showSpecks={playIntro && !reduceMotion} />
    </motion.div>
  );
}
