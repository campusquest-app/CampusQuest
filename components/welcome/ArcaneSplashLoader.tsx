"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";

const LORE_MESSAGES = [
  "Preparing Your Adventure...",
  "Gathering Quests...",
  "Synchronizing XP...",
  "Opening The Quad...",
  "Awakening CQ Scanner...",
  "Entering The Realm...",
] as const;

const MESSAGE_ROTATE_MS = 3200;

const SPLASH_RAM_SRC = "/assets/ram-transparent.png";

const TRAIL_OFFSETS = [
  { x: -8, y: 4, delay: 0 },
  { x: -16, y: 8, delay: 0.05 },
  { x: -24, y: 2, delay: 0.1 },
] as const;

const FILL_SPARKLE_SLOTS = [12, 28, 44, 58, 72, 86] as const;

const BAR_RISE_PARTICLES = [
  { left: "18%", delay: 0, duration: 2.4 },
  { left: "48%", delay: 0.6, duration: 2.8 },
  { left: "78%", delay: 1.1, duration: 2.2 },
] as const;

type ArcaneSplashLoaderProps = {
  progress: number;
  className?: string;
};

export function ArcaneSplashLoader({ progress, className = "" }: ArcaneSplashLoaderProps) {
  const reduceMotion = useReducedMotion();
  const [messageIndex, setMessageIndex] = useState(0);
  const [displayPct, setDisplayPct] = useState(0);
  const [sparkKey, setSparkKey] = useState(0);
  const [burstKey, setBurstKey] = useState(0);
  const lastSparkPct = useRef(0);
  const wasComplete = useRef(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const ramImgRef = useRef<HTMLImageElement>(null);
  const [travel, setTravel] = useState({ barW: 0, ramW: 0 });
  const complete = progress >= 99.5;

  const progressSpring = useSpring(progress / 100, {
    stiffness: reduceMotion ? 100 : 42,
    damping: reduceMotion ? 26 : 20,
    mass: 1,
  });

  const fillWidth = useTransform(progressSpring, (v) => `${Math.max(2, Math.min(100, v * 100))}%`);

  const ramLeftPx = useTransform(progressSpring, (v) => {
    const max = Math.max(0, travel.barW - travel.ramW);
    return v * max;
  });

  useLayoutEffect(() => {
    const bar = trackRef.current;
    const ram = ramImgRef.current;
    if (!bar || !ram) return;

    const measure = () => {
      setTravel({
        barW: bar.offsetWidth,
        ramW: ram.offsetWidth,
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    ro.observe(ram);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    progressSpring.set(progress / 100);
  }, [progress, progressSpring]);

  useMotionValueEvent(progressSpring, "change", (v) => {
    const next = Math.round(Math.max(0, Math.min(100, v * 100)));
    setDisplayPct(next);
    if (!reduceMotion && next > lastSparkPct.current && next - lastSparkPct.current >= 5) {
      lastSparkPct.current = next;
      setSparkKey((k) => k + 1);
    }
  });

  useEffect(() => {
    setDisplayPct(Math.round(progress));
  }, [progress]);

  useEffect(() => {
    if (complete && !wasComplete.current) {
      wasComplete.current = true;
      setBurstKey((k) => k + 1);
    }
  }, [complete]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setMessageIndex((i) => (i + 1) % LORE_MESSAGES.length);
    }, MESSAGE_ROTATE_MS);
    return () => window.clearInterval(id);
  }, []);

  const activeMessage = useMemo(() => LORE_MESSAGES[messageIndex] ?? LORE_MESSAGES[0], [messageIndex]);

  const ramLeftStaticPx =
    (Math.max(0, Math.min(100, progress)) / 100) * Math.max(0, travel.barW - travel.ramW);

  const ramMascot = (
    <div className="cq-splash-ram-runner relative flex items-end justify-center">
      <div className="cq-splash-ram-foot-glow pointer-events-none absolute bottom-0 left-1/2 z-0 h-3 w-[70%] -translate-x-1/2" aria-hidden />
      <img
        ref={ramImgRef}
        src={SPLASH_RAM_SRC}
        alt=""
        width={200}
        height={120}
        className="cq-splash-ram-img relative z-[2] block w-auto max-w-none object-contain object-bottom"
        style={{
          opacity: 1,
          filter: "none",
          mixBlendMode: "normal",
        }}
        draggable={false}
        aria-hidden
      />
    </div>
  );

  const ramAnchorClass =
    "pointer-events-none absolute left-0 z-20 flex items-end cq-splash-ram-anchor";

  const ramAnchorContent = (
    <>
      {!reduceMotion && sparkKey > 0
        ? TRAIL_OFFSETS.map((o, i) => (
            <motion.span
              key={`${sparkKey}-trail-${i}`}
              className={`absolute z-[1] ${i === 0 ? "cq-splash-ram-star-burst" : "cq-splash-ram-trail-spark"}`}
              style={{ left: `${10 + i * 5}%`, bottom: i === 0 ? "28%" : "22%" }}
              initial={{ opacity: 0, scale: 0.2, x: o.x, y: o.y }}
              animate={{ opacity: [0, 1, 0], scale: [0.2, i === 0 ? 1.4 : 1, 0.3], x: o.x - 12, y: o.y - 6 }}
              transition={{ duration: i === 0 ? 0.55 : 0.5, delay: o.delay, ease: "easeOut" }}
              aria-hidden
            />
          ))
        : null}
      {ramMascot}
    </>
  );

  return (
    <div
      className={`cq-splash-loader relative w-full overflow-visible ${className}`}
      role="status"
      aria-live="polite"
      aria-label={`Loading CampusQuest, ${displayPct} percent`}
    >
      <div className="flex w-full flex-col items-center text-center">
        <div className="mb-4 flex w-full items-baseline justify-center gap-[clamp(0.375rem,2vw,0.5rem)]">
          <span className="cq-splash-status-label font-semibold uppercase text-cyan-200/80">
            Adventure Loading
          </span>
          <motion.span
            className="cq-splash-status-pct font-mono font-black tabular-nums text-cyan-100"
            animate={complete && !reduceMotion ? { scale: [1, 1.12, 1], textShadow: ["0 0 0 transparent", "0 0 18px rgba(125,211,252,0.9)", "0 0 0 transparent"] } : { scale: 1 }}
            transition={{ duration: 0.65, ease: "easeOut" }}
          >
            {displayPct}%
          </motion.span>
        </div>

        <div className="cq-splash-road relative w-full overflow-visible">
          <div className="cq-splash-road-stage relative w-full overflow-visible">
            <motion.div
              className={`cq-splash-track-rail-glow pointer-events-none absolute inset-x-0 bottom-0 z-0 translate-y-1/2 ${complete ? "cq-splash-track-rail-glow--complete" : ""}`}
              aria-hidden
              animate={reduceMotion ? undefined : { opacity: [0.55, 0.95, 0.55] }}
              transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
            />

            <div
              className={`cq-splash-crystal-shell relative z-[1] w-full ${complete ? "cq-splash-crystal-shell--complete" : ""}`}
            >
              <span className="cq-splash-track-cap cq-splash-track-cap--left" aria-hidden />
              <span className="cq-splash-track-cap cq-splash-track-cap--right" aria-hidden />

              <div
                ref={trackRef}
                className={`cq-splash-track cq-splash-crystal-channel relative w-full overflow-hidden rounded-full ${complete ? "cq-splash-track--complete" : ""}`}
              >
                <div className="cq-splash-crystal-core pointer-events-none absolute inset-0 rounded-full" aria-hidden />
                <div className="cq-splash-track-runes pointer-events-none absolute inset-0 z-[1] rounded-full" aria-hidden />
                <div className="cq-splash-crystal-glass pointer-events-none absolute inset-0 z-[4] rounded-full" aria-hidden />

                <motion.div
                  className="cq-splash-xp-fill absolute inset-y-0 left-0 z-[2] min-w-[5px] overflow-hidden rounded-full"
                  style={{ width: fillWidth }}
                >
                  <div className="cq-splash-xp-energy pointer-events-none absolute inset-0 rounded-full" aria-hidden />
                  <div className="cq-splash-xp-flow pointer-events-none absolute inset-0 rounded-full" aria-hidden />
                  <div className="cq-splash-xp-wave pointer-events-none absolute inset-0 rounded-full" aria-hidden />
                  <div className="cq-splash-xp-shimmer pointer-events-none absolute inset-0 rounded-full" aria-hidden />
                  <div className="cq-splash-fill-sparkles pointer-events-none absolute inset-0" aria-hidden>
                    {FILL_SPARKLE_SLOTS.map((left, i) => (
                      <span
                        key={left}
                        className="cq-splash-fill-spark"
                        style={{
                          left: `${left}%`,
                          top: `${22 + (i % 3) * 28}%`,
                          animationDelay: `${i * 0.22}s`,
                        }}
                      />
                    ))}
                  </div>
                </motion.div>
              </div>
            </div>

            {!reduceMotion &&
              BAR_RISE_PARTICLES.map((p) => (
                <motion.span
                  key={p.left}
                  className="cq-splash-bar-particle pointer-events-none absolute bottom-0 z-[3]"
                  style={{ left: p.left }}
                  animate={{ y: [0, -14, 0], opacity: [0, 0.85, 0], scale: [0.6, 1, 0.5] }}
                  transition={{
                    duration: p.duration,
                    delay: p.delay,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  aria-hidden
                />
              ))}

            {!reduceMotion && (
              <motion.div
                className="cq-splash-fill-edge pointer-events-none absolute top-1/2 z-[6] flex -translate-x-full -translate-y-1/2 items-center"
                style={{ left: fillWidth }}
              >
                <motion.span
                  className="cq-splash-edge-star cq-splash-edge-star--lead"
                  animate={{ opacity: [0.6, 1, 0.6], scale: [0.9, 1.35, 0.95] }}
                  transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
                  aria-hidden
                />
                <motion.span
                  className="cq-splash-edge-star"
                  animate={{ opacity: [0.45, 1, 0.5], scale: [0.75, 1.15, 0.8] }}
                  transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut", delay: 0.15 }}
                  aria-hidden
                />
                <motion.span
                  className="cq-splash-edge-star cq-splash-edge-star--sm"
                  animate={{ opacity: [0.35, 0.95, 0.4], scale: [0.65, 1, 0.7] }}
                  transition={{ duration: 0.85, repeat: Infinity, ease: "easeInOut", delay: 0.28 }}
                  aria-hidden
                />
              </motion.div>
            )}

            <AnimatePresence>
              {burstKey > 0 && !reduceMotion ? (
                <>
                  <motion.div
                    key={`${burstKey}-surge`}
                    className="cq-splash-complete-surge pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-5 rounded-full"
                    initial={{ opacity: 0, scaleX: 0.15 }}
                    animate={{ opacity: [0, 1, 0.35, 0], scaleX: [0.15, 1.12, 1.02, 1] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    aria-hidden
                  />
                  <motion.div
                    key={`${burstKey}-ring`}
                    className="cq-splash-complete-ring pointer-events-none absolute inset-x-0 bottom-0 z-[4] h-6 rounded-full"
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: [0, 0.9, 0], scale: [0.85, 1.15, 1.25] }}
                    transition={{ duration: 0.9, ease: "easeOut" }}
                    aria-hidden
                  />
                </>
              ) : null}
            </AnimatePresence>

            {reduceMotion ? (
              <div className={ramAnchorClass} style={{ left: ramLeftStaticPx }}>
                {ramMascot}
              </div>
            ) : (
              <motion.div className={ramAnchorClass} style={{ left: ramLeftPx }}>
                {ramAnchorContent}
              </motion.div>
            )}
          </div>
        </div>
      </div>

      <div className="relative min-h-[2.5rem] w-full text-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={activeMessage}
            className="cq-splash-lore-text mx-auto w-full text-balance font-medium leading-snug text-white/88"
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
            transition={{ duration: 0.45, ease: "easeInOut" }}
          >
            {activeMessage}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
