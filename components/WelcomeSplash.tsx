"use client";

import { useState, useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArcaneSplashLoader } from "@/components/welcome/ArcaneSplashLoader";
import { SplashMagicalBackdrop } from "@/components/welcome/SplashMagicalBackdrop";
import { CampusQuestLogo } from "@/components/CampusQuestLogo";
import {
  SPLASH_COMPLETE_DWELL_MS,
  SPLASH_FADEOUT_MS,
  SPLASH_PROGRESS_MS,
  splashProgressEase,
} from "@/components/welcome/splashTiming";

export function WelcomeSplash({ onComplete }: { onComplete: () => void }) {
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<"visible" | "fading">("visible");
  const [progress, setProgress] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setPhase("fading"), SPLASH_PROGRESS_MS + SPLASH_COMPLETE_DWELL_MS);
    return () => clearTimeout(fadeTimer);
  }, []);

  useEffect(() => {
    if (phase !== "fading") return;
    const doneTimer = setTimeout(onComplete, SPLASH_FADEOUT_MS);
    return () => clearTimeout(doneTimer);
  }, [phase, onComplete]);

  useEffect(() => {
    startRef.current = performance.now();
    let rafId: number;
    function tick(now: number) {
      const elapsed = startRef.current != null ? now - startRef.current : 0;
      const t = Math.min(1, elapsed / SPLASH_PROGRESS_MS);
      const p = t >= 1 ? 100 : splashProgressEase(t) * 100;
      setProgress(p);
      if (t < 1) rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col bg-uri-navy"
      initial={false}
      animate={{ opacity: phase === "fading" ? 0 : 1 }}
      transition={{ duration: SPLASH_FADEOUT_MS / 1000, ease: [0.4, 0, 0.2, 1] }}
      aria-hidden="true"
    >
      <SplashMagicalBackdrop variant="full" />

      <div className="pointer-events-none absolute inset-0 cq-splash-ambient-shift" aria-hidden>
        <div className="cq-splash-cinematic-vignette absolute inset-0" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 95% 65% at 50% 38%, rgba(104, 171, 232, 0.28) 0%, transparent 62%), radial-gradient(ellipse 70% 50% at 50% 72%, rgba(56, 189, 248, 0.14) 0%, transparent 58%)",
          }}
        />
        <div className="cq-splash-screen-mist absolute inset-0" />
      </div>

      <div className="cq-splash-viewport relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-[max(1rem,5vw)] pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="cq-splash-stack flex flex-col items-center justify-center text-center">
          <div className="welcome-splash-stack-hero flex w-full flex-col items-center text-center">
            <div className="welcome-splash-effects pointer-events-none absolute inset-0 -z-0" aria-hidden>
              <motion.div
                className="welcome-splash-logo-aura-pulse absolute inset-0 rounded-full"
                animate={
                  reduceMotion
                    ? undefined
                    : {
                        scale: [1, 1.06, 1],
                        opacity: [0.45, 0.72, 0.45],
                      }
                }
                transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
              />
              <div className="welcome-splash-energy-swirl" />
              <div className="welcome-splash-light-rays" />
              <div className="welcome-splash-stars rounded-[9999px]" />
              <div className="welcome-splash-bubble-glow" />
              <div className="welcome-splash-orbit" />
            </div>

            <motion.div
              className="relative z-10 mb-3 w-full shrink-0"
              animate={
                reduceMotion
                  ? undefined
                  : {
                      filter: [
                        "drop-shadow(0 0 24px rgba(104, 171, 232, 0.4))",
                        "drop-shadow(0 0 40px rgba(56, 189, 248, 0.65))",
                        "drop-shadow(0 0 24px rgba(104, 171, 232, 0.4))",
                      ],
                    }
              }
              transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
            >
              <CampusQuestLogo variant="splash" priority className="mx-auto block" />
            </motion.div>

            <p className="welcome-splash-word relative z-10 mb-2 w-full shrink-0 font-black uppercase text-white">
              CampusQuest
            </p>

            <p className="welcome-splash-tagline relative z-10 mb-8 w-full shrink-0 text-balance font-medium leading-snug tracking-[0.12em] text-uri-keaney/92 sm:tracking-[0.16em]">
              Level Up Your College Experience
            </p>
          </div>

          <div className="cq-splash-loader-zone relative">
            <SplashMagicalBackdrop variant="loader" />
            <div className="relative z-10 mb-4 w-full overflow-visible">
              <ArcaneSplashLoader progress={progress} className="mx-auto w-full" />
            </div>
            {progress >= 99.5 && !reduceMotion ? (
              <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center overflow-visible" aria-hidden>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <motion.span
                    key={`flare-${i}`}
                    className="cq-splash-magic-star cq-splash-magic-star--lg absolute"
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{
                      opacity: [0, 1, 0],
                      scale: [0.2, 1.2, 0.4],
                      x: `calc(${i - 2.5} * clamp(18px, 5vw, 28px))`,
                      y: `calc(-1 * clamp(14px, 4vw, 20px) - ${(i % 3) * 10}px)`,
                    }}
                    transition={{ duration: 0.7, delay: i * 0.04, ease: "easeOut" }}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <motion.div
        className="pointer-events-none absolute bottom-3 left-0 right-0 mx-auto h-px w-[min(70%,16rem)] rounded-full sm:bottom-4"
        style={{
          width: "min(70%, clamp(12rem, 56vw, 16rem))",
          background: "linear-gradient(90deg, transparent, rgba(104, 171, 232, 0.75), transparent)",
        }}
        animate={reduceMotion ? undefined : { opacity: [0.4, 0.9, 0.4] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      />
    </motion.div>
  );
}
