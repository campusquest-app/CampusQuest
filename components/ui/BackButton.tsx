"use client";

import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Shared CampusQuest back button. Premium iOS/Instagram-style circular control:
 * 44x44pt touch target, subtle translucent background, ChevronLeft glyph, and a
 * spring press animation (scale ~0.96). Reuse everywhere instead of re-implementing.
 */
export function BackButton({
  onClick,
  label = "Back",
  className = "",
}: {
  onClick: () => void;
  /** Accessible label (also used as the tooltip). Defaults to "Back". */
  label?: string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`cq-back-button ${className}`.trim()}
      whileTap={reduceMotion ? undefined : { scale: 0.96 }}
      transition={{ type: "spring", stiffness: 520, damping: 30 }}
    >
      <ChevronLeft className="h-6 w-6" strokeWidth={2.2} aria-hidden />
    </motion.button>
  );
}

/**
 * Sticky top header bar with a back button (and optional title / trailing slot).
 * Stays fixed to the top of the scroll viewport, respects the iPhone safe area,
 * and keeps a high z-index so it is never hidden behind content.
 */
export function ScreenBackHeader({
  title,
  onBack,
  backLabel,
  trailing,
}: {
  title?: string;
  onBack: () => void;
  backLabel?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="cq-screen-back-header">
      <BackButton onClick={onBack} label={backLabel ?? "Back"} />
      {title ? <h1 className="cq-screen-back-header-title">{title}</h1> : <span aria-hidden />}
      <div className="cq-screen-back-header-trailing">{trailing}</div>
    </div>
  );
}
