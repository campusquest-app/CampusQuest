"use client";

import { useState, useEffect, useRef } from "react";

const SPLASH_HOLD_MS = 4700;
const SPLASH_FADEOUT_MS = 700;

export function WelcomeSplash({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<"visible" | "fading">("visible");
  const [progress, setProgress] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    const holdTimer = setTimeout(() => setPhase("fading"), SPLASH_HOLD_MS);
    return () => clearTimeout(holdTimer);
  }, []);

  useEffect(() => {
    if (phase !== "fading") return;
    const doneTimer = setTimeout(onComplete, SPLASH_FADEOUT_MS);
    return () => clearTimeout(doneTimer);
  }, [phase, onComplete]);

  // Animate progress 0 → 100 over SPLASH_HOLD_MS
  useEffect(() => {
    startRef.current = performance.now();
    let rafId: number;
    function tick(now: number) {
      const elapsed = startRef.current != null ? now - startRef.current : 0;
      const p = Math.min(100, (elapsed / SPLASH_HOLD_MS) * 100);
      setProgress(p);
      if (p < 100) rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-uri-navy transition-opacity duration-700 ease-out ${
        phase === "fading" ? "opacity-0" : "opacity-100"
      }`}
      aria-hidden="true"
    >
      {/* Subtle radial glow behind text */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 80% 50% at 50% 45%, rgba(104, 171, 232, 0.2) 0%, transparent 60%)",
        }}
      />
      {/* Soft starfield + orbital glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="welcome-splash-stars" />
        <div className="welcome-splash-orbit" />
      </div>
      {/* Accent rays */}
      <div
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          background: "linear-gradient(135deg, transparent 40%, rgba(104, 171, 232, 0.08) 50%, transparent 60%)",
        }}
      />

      <div className="relative flex flex-col items-center justify-center gap-5 px-4 -translate-y-16 sm:-translate-y-20">
        <p className="welcome-splash-title text-uri-keaney/95 text-sm sm:text-base font-semibold tracking-[0.3em] uppercase">
          Welcome to
        </p>
        <img
          src="/campusquest-logo.png"
          alt="CampusQuest RPG — University of Rhode Island"
          className="welcome-splash-word w-full max-w-[220px] sm:max-w-[260px] md:max-w-[280px] h-auto object-contain drop-shadow-[0_0_24px_rgba(104,171,232,0.25)]"
        />
        <p className="welcome-splash-tagline text-uri-keaney/90 text-sm sm:text-base font-medium tracking-widest uppercase">
          URI · Level up for real
        </p>
      </div>

      {/* Loading bar: ram walking across grass field */}
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 w-[min(300px,88vw)] flex flex-col items-center gap-2">
        <p className="text-sm font-semibold text-white/90 tracking-[0.18em] uppercase">
          Loading CampusQuest
          <span className="inline-block w-4 text-center welcome-splash-dots" aria-hidden>
            ...
          </span>
        </p>
        <p className="text-[11px] sm:text-xs text-white/70 tracking-wide">
          {Math.round(progress)}% ready · Daily training keeps your streak alive
        </p>
        {/* Track: clean pill bar */}
        <div
          className="relative w-full h-10 rounded-full overflow-hidden border border-white/20 bg-white/5"
          style={{
            boxShadow: "inset 0 2px 6px rgba(0,0,0,0.25), 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          {/* Grass: single smooth gradient + very subtle texture */}
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(180deg, #234a23 0%, #1a3a1c 50%, #122d14 100%)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
            }}
          />
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage: "repeating-linear-gradient(90deg, transparent 0, transparent 6px, rgba(255,255,255,0.03) 6px, rgba(255,255,255,0.03) 7px)",
            }}
          />
          {/* Progress fill: clear Keaney bar */}
          <div
            className="absolute left-0 top-0 h-full rounded-full transition-none min-w-[4px]"
            style={{
              width: `${Math.max(progress, 2)}%`,
              background: "linear-gradient(180deg, #7ab8f0 0%, #5a9dd9 50%, #68ABE8 100%)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.1), 0 0 12px rgba(104, 171, 232, 0.25)",
            }}
          />
          {/* Ram */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-none z-10"
            style={{
              left: `${progress}%`,
              animation: "welcome-ram-walk 0.4s ease-in-out infinite",
            }}
          >
            <span className="text-2xl drop-shadow-lg inline-block scale-x-[-1] filter brightness-110" aria-hidden>🐏</span>
          </div>
          {/* Animated shine sweeping across the grass track */}
          <div className="welcome-splash-scanline pointer-events-none" />
        </div>
      </div>

      {/* Bottom decorative line */}
      <div
        className="absolute bottom-6 left-1/2 -translate-x-1/2 h-px w-48 rounded-full"
        style={{ background: "linear-gradient(90deg, transparent, rgba(104, 171, 232, 0.6), transparent)" }}
      />
    </div>
  );
}
