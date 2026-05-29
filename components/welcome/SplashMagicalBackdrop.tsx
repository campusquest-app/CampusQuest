"use client";

import { motion, useReducedMotion } from "framer-motion";

type SplashMagicalBackdropProps = {
  variant?: "full" | "loader";
};

const STAR_SPARKS = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  left: 8 + ((i * 47) % 84),
  top: 12 + ((i * 31) % 76),
  large: i % 4 === 0,
  delay: (i % 6) * 0.35,
  duration: 3.2 + (i % 4) * 0.8,
}));

function buildParticles(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: (i * 41) % 100,
    top: (i * 67) % 100,
    large: i % 3 === 0,
    delay: (i % 8) * 0.25,
    duration: 5 + (i % 5) * 0.6,
    drift: i % 2 === 0 ? 14 : -12,
  }));
}

export function SplashMagicalBackdrop({ variant = "full" }: SplashMagicalBackdropProps) {
  const reduceMotion = useReducedMotion();
  const isLoader = variant === "loader";
  const particles = buildParticles(isLoader ? 14 : 24);

  if (reduceMotion) {
    return (
      <div
        className={`pointer-events-none absolute inset-0 ${isLoader ? "cq-splash-loader-mist" : "cq-splash-realm-mist"}`}
        aria-hidden
      />
    );
  }

  const wrapClass = isLoader
    ? "cq-splash-loader-mist-wrap pointer-events-none absolute inset-0 overflow-visible"
    : "pointer-events-none absolute inset-0 overflow-hidden";

  return (
    <div className={wrapClass} aria-hidden>
      <div className={isLoader ? "cq-splash-loader-mist" : "cq-splash-realm-mist"} />

      <motion.div
        className="cq-splash-aura-swirl absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        animate={{ rotate: 360, opacity: [0.35, 0.55, 0.35] }}
        transition={{
          rotate: { duration: 48, repeat: Infinity, ease: "linear" },
          opacity: { duration: 6, repeat: Infinity, ease: "easeInOut" },
        }}
      />

      {particles.map((p) => (
        <motion.span
          key={`p-${p.id}`}
          className={`cq-splash-magic-particle absolute rounded-full ${p.large ? "cq-splash-magic-particle--lg" : ""}`}
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
          }}
          animate={{
            y: [0, p.drift, 0],
            x: [0, p.drift * 0.35, 0],
            opacity: [0.25, 0.95, 0.35],
            scale: [0.85, 1.15, 0.9],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}

      {!isLoader &&
        STAR_SPARKS.map((s) => (
          <motion.span
            key={`s-${s.id}`}
            className={`cq-splash-magic-star absolute ${s.large ? "cq-splash-magic-star--lg" : ""}`}
            style={{
              left: `${s.left}%`,
              top: `${s.top}%`,
            }}
            animate={{
              opacity: [0.15, 1, 0.2],
              scale: [0.6, 1.4, 0.7],
            }}
            transition={{
              duration: s.duration,
              delay: s.delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
    </div>
  );
}
