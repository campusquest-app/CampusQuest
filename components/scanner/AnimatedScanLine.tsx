"use client";

type AnimatedScanLineProps = {
  detecting?: boolean;
  absorbing?: boolean;
  lensLive?: boolean;
  cameraActive?: boolean;
};

/**
 * CSS-only vertical sweep — works on iOS Safari without Framer or CSS variables in keyframes.
 */
export function AnimatedScanLine({
  detecting = false,
  absorbing = false,
  lensLive = true,
}: AnimatedScanLineProps) {
  const duration = detecting ? 1.55 : 2;

  return (
    <div
      className={`cq-scan-track pointer-events-none absolute inset-[5%] z-30 overflow-visible rounded-[inherit] ${detecting ? "cq-sigil-scan-line--detecting" : ""} ${absorbing ? "cq-sigil-scan-line--absorbing" : ""} ${lensLive ? "cq-sigil-scan-line--live" : ""}`}
      aria-hidden
      style={{ ["--cq-scan-duration" as string]: `${duration}s` }}
    >
      <div className="cq-scanner-scan-trail cq-scanner-scan-sweep" aria-hidden />
      <div className="cq-scanner-scan-beam cq-scanner-scan-sweep" aria-hidden />
    </div>
  );
}
