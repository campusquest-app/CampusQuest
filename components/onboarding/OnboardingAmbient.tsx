"use client";

/**
 * Decorative ambient layer for demographic onboarding.
 * CSS-only motion; pointer-events none; aria-hidden.
 * Does not alter brand image assets.
 */

export type OnboardingAmbientDensity = "calm" | "normal" | "celebrate";

type OnboardingAmbientProps = {
  density?: OnboardingAmbientDensity;
  /** Soft abstract campus haze (CSS shapes only — no generated university art). */
  showCampusHaze?: boolean;
};

function Sparkle({ className }: { className: string }) {
  return <span className={`cq-onboard-sparkle ${className}`} />;
}

function Crystal({ className }: { className: string }) {
  return <span className={`cq-onboard-crystal ${className}`} />;
}

function Orb({ className }: { className: string }) {
  return <span className={`cq-onboard-orb ${className}`} />;
}

function FloatingBook({ className }: { className: string }) {
  return <span className={`cq-onboard-book ${className}`} />;
}

export function OnboardingAmbient({
  density = "normal",
  showCampusHaze = false,
}: OnboardingAmbientProps) {
  const celebrate = density === "celebrate";
  const calm = density === "calm";

  return (
    <div className={`cq-onboard-ambient cq-onboard-ambient--${density}`} aria-hidden="true">
      <div className="cq-onboard-ambient-wash" />
      <div className="cq-onboard-ambient-mist cq-onboard-ambient-mist--bottom" />
      <div className="cq-onboard-ambient-mist cq-onboard-ambient-mist--edge" />

      {showCampusHaze ? <div className="cq-onboard-campus-haze" /> : null}

      <Orb className="cq-onboard-orb--a" />
      {!calm ? <Orb className="cq-onboard-orb--b" /> : null}

      <Sparkle className="cq-onboard-sparkle--1" />
      <Sparkle className="cq-onboard-sparkle--2" />
      <Sparkle className="cq-onboard-sparkle--3" />
      {!calm ? <Sparkle className="cq-onboard-sparkle--4" /> : null}
      {!calm ? <Sparkle className="cq-onboard-sparkle--5" /> : null}
      {celebrate ? <Sparkle className="cq-onboard-sparkle--6" /> : null}
      {celebrate ? <Sparkle className="cq-onboard-sparkle--7 cq-onboard-sparkle--gold" /> : null}

      {!calm ? <Crystal className="cq-onboard-crystal--a" /> : null}
      {celebrate || density === "normal" ? <Crystal className="cq-onboard-crystal--b" /> : null}

      {density !== "calm" ? <FloatingBook className="cq-onboard-book--a" /> : null}

      {celebrate ? <div className="cq-onboard-confetti-layer" /> : null}
    </div>
  );
}

export function OnboardingMagicRing({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  return (
    <div className={`cq-onboard-magic-ring cq-onboard-magic-ring--${size}`} aria-hidden="true">
      <span className="cq-onboard-magic-ring-core" />
      <span className="cq-onboard-magic-ring-halo" />
    </div>
  );
}
