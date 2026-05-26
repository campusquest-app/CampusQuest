"use client";

import { motion } from "framer-motion";

type FloatingRewardTextProps = {
  label: string;
  sub?: string;
  delay?: number;
  tone?: "xp" | "stat" | "level";
};

const shellTone: Record<NonNullable<FloatingRewardTextProps["tone"]>, string> = {
  xp: "shadow-[0_0_28px_rgba(56,189,248,0.55)] border-cyan-300/35",
  stat: "shadow-[0_0_24px_rgba(104,171,232,0.5)] border-sky-300/40",
  level: "shadow-[0_0_32px_rgba(197,165,40,0.55)] border-amber-300/45",
};

const textGradient: Record<NonNullable<FloatingRewardTextProps["tone"]>, string> = {
  xp: "bg-gradient-to-r from-cyan-200 via-white to-sky-300",
  stat: "bg-gradient-to-r from-uri-keaney via-sky-100 to-cyan-200",
  level: "bg-gradient-to-r from-amber-200 via-uri-gold to-amber-50",
};

export function FloatingRewardText({ label, sub, delay = 0, tone = "xp" }: FloatingRewardTextProps) {
  return (
    <motion.div
      className={`pointer-events-none select-none rounded-2xl border bg-black/40 px-4 py-2.5 backdrop-blur-md ${shellTone[tone]}`}
      style={{
        backgroundImage: `linear-gradient(135deg, rgba(255,255,255,0.09), transparent 52%)`,
      }}
      initial={{ opacity: 0, y: 28, scale: 0.88, rotate: -4 }}
      animate={{ opacity: 1, y: -8, scale: 1, rotate: 0 }}
      exit={{ opacity: 0, y: -64, scale: 0.92 }}
      transition={{
        delay,
        type: "spring",
        stiffness: 420,
        damping: 22,
      }}
    >
      <p
        className={`font-display bg-clip-text text-lg font-black tracking-wide text-transparent sm:text-xl md:text-2xl ${textGradient[tone]}`}
      >
        {tone === "xp" ? <span aria-hidden>✧ </span> : null}
        {label}
      </p>
      {sub ? <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-100/80">{sub}</p> : null}
    </motion.div>
  );
}
