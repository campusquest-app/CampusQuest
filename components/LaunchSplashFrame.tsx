import type { CSSProperties } from "react";
import { BRAND_LOGO_OFFICIAL } from "@/lib/onboarding/taxonomy";
import { CAMPUSQUEST_BRAND_NAME, CAMPUSQUEST_LOGO_ALT } from "@/lib/branding";
import { LAUNCH_SPLASH_SPECK_COUNT } from "@/components/welcome/splashTiming";

const SPECKS = [
  { x: -38, y: 10, delay: "120ms", dur: "1.05s", gold: false },
  { x: 34, y: -18, delay: "180ms", dur: "1.1s", gold: true },
  { x: -12, y: -36, delay: "80ms", dur: "0.95s", gold: false },
  { x: 22, y: 28, delay: "240ms", dur: "1.15s", gold: false },
  { x: -44, y: -22, delay: "300ms", dur: "1s", gold: true },
  { x: 46, y: 6, delay: "160ms", dur: "1.08s", gold: false },
  { x: 8, y: -44, delay: "220ms", dur: "0.98s", gold: false },
  { x: -28, y: 32, delay: "90ms", dur: "1.12s", gold: true },
  { x: 18, y: 40, delay: "340ms", dur: "1.02s", gold: false },
  { x: -6, y: 44, delay: "200ms", dur: "0.92s", gold: false },
  { x: 40, y: -32, delay: "140ms", dur: "1.18s", gold: true },
  { x: -48, y: 4, delay: "260ms", dur: "1.06s", gold: false },
] as const;

export function LaunchSplashFrame({
  showSpecks = true,
}: {
  showSpecks?: boolean;
}) {
  return (
    <div className="cq-launch-splash-inner">
      <div className="cq-launch-stage">
        <span className="cq-launch-glow" aria-hidden />
        <span className="cq-launch-ring" aria-hidden />
        <span className="cq-launch-sweep" aria-hidden />
        {showSpecks
          ? SPECKS.slice(0, LAUNCH_SPLASH_SPECK_COUNT).map((speck, index) => (
              <span
                key={index}
                className={`cq-launch-speck${speck.gold ? " cq-launch-speck--gold" : ""}`}
                style={
                  {
                    "--cq-speck-x": `${speck.x}px`,
                    "--cq-speck-y": `${speck.y}px`,
                    animationDelay: speck.delay,
                    animationDuration: speck.dur,
                  } as CSSProperties
                }
              />
            ))
          : null}
        {/* eslint-disable-next-line @next/next/no-img-element -- official brand PNG must remain unmodified */}
        <img
          src={BRAND_LOGO_OFFICIAL}
          alt={CAMPUSQUEST_LOGO_ALT}
          width={512}
          height={512}
          className="cq-launch-logo"
          decoding="sync"
          fetchPriority="high"
        />
      </div>
      <p className="cq-launch-word">{CAMPUSQUEST_BRAND_NAME.toUpperCase()}</p>
    </div>
  );
}
