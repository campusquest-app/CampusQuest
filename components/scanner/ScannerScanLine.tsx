"use client";

import { useReducedMotion } from "framer-motion";

type ScannerScanLineProps = {
  detecting?: boolean;
  absorbing?: boolean;
  cameraActive?: boolean;
};

export function ScannerScanLine({ detecting = false, absorbing = false, cameraActive = false }: ScannerScanLineProps) {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <div
        className="cq-qr-scan-line cq-sigil-scan-line-v pointer-events-none absolute left-[8%] right-[8%] z-[5] h-[2px] rounded-full opacity-50"
        aria-hidden
      />
    );
  }

  return (
    <div
      className={`cq-sigil-scan-line-group pointer-events-none absolute inset-0 z-[5] ${detecting ? "cq-sigil-scan-line--detecting" : ""} ${absorbing ? "cq-sigil-scan-line--absorbing" : ""} ${cameraActive ? "cq-sigil-scan-line--live" : ""}`}
      aria-hidden
    >
      <div className="cq-sigil-scan-trail absolute left-[8%] right-[8%] h-6 rounded-full" />
      <div className="cq-qr-scan-line cq-sigil-scan-line-v absolute left-[8%] right-[8%] h-[3px] rounded-full" />
    </div>
  );
}
