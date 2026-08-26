"use client";

import { OnboardingMagicRing } from "@/components/onboarding/OnboardingAmbient";

export function KnightStage({
  src,
  size = "md",
  ring = "md",
  nudge = "center",
}: {
  src: string;
  size?: "sm" | "md" | "lg";
  ring?: "sm" | "md" | "lg" | "none";
  nudge?: "center" | "left" | "right" | "up";
}) {
  return (
    <div
      className={`cq-onboard-knight-stage cq-onboard-knight-stage--${size} cq-onboard-knight-stage--${nudge}`}
      aria-hidden="true"
    >
      {ring !== "none" ? <OnboardingMagicRing size={ring === "lg" ? "lg" : ring === "sm" ? "sm" : "md"} /> : null}
      <div className="cq-onboard-knight">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="cq-onboard-knight-img" width={240} height={240} decoding="async" />
      </div>
    </div>
  );
}

export function OnboardingProgressHeader({
  label,
  current,
  total,
}: {
  label: string;
  current: number;
  total: number;
}) {
  return (
    <div className="cq-onboard-progress-wrap">
      <p className="cq-onboard-progress-label">{label}</p>
      <div
        className="cq-onboard-progress"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-label={label}
      >
        {Array.from({ length: total }).map((_, i) => {
          const state = i < current - 1 ? "done" : i === current - 1 ? "active" : "todo";
          return <span key={i} className={`cq-onboard-dot cq-onboard-dot--${state}`} />;
        })}
      </div>
    </div>
  );
}
