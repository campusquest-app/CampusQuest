"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { isIosLike } from "@/lib/client/isIosDevice";
import { AnimatedScanLine } from "@/components/scanner/AnimatedScanLine";
import { ScannerFrameMagic } from "@/components/scanner/ScannerFrameMagic";
import { ScannerRuneHieroglyphics } from "@/components/scanner/ScannerRuneHieroglyphics";

type MagicalScannerFrameProps = {
  children: React.ReactNode;
  busyOverlay?: React.ReactNode;
  detecting?: boolean;
  absorbing?: boolean;
  camBusy?: boolean;
  cameraActive?: boolean;
};

export function MagicalScannerFrame({
  children,
  busyOverlay,
  detecting = false,
  absorbing = false,
  camBusy = false,
  cameraActive = false,
}: MagicalScannerFrameProps) {
  const reduce = useReducedMotion();
  const boost = detecting || absorbing;
  const lensLive = cameraActive || camBusy;
  const [ios, setIos] = useState(false);
  useEffect(() => {
    setIos(isIosLike());
  }, []);

  return (
    <div className="cq-sigil-scanner-shell relative mx-auto aspect-square w-[min(86vw,420px)] max-w-[420px] shrink-0 sm:max-h-[min(52vh,420px)] sm:w-full">
      {!reduce ? (
        <motion.span
          className="cq-sigil-shell-halo pointer-events-none absolute -inset-1 z-0 rounded-[1.85rem] bg-gradient-to-br from-sky-400/40 via-uri-keaney/18 to-transparent blur-[1px]"
          animate={{
            opacity: boost ? [0.5, 0.9, 0.55] : lensLive ? [0.4, 0.55, 0.44] : [0.42, 0.58, 0.45],
          }}
          transition={{ repeat: Infinity, duration: boost ? 0.75 : 2.6, ease: "easeInOut" }}
          aria-hidden
        />
      ) : null}

      <div
        className={`cq-sigil-scanner-inner cq-qr-scanner-shell-inner relative h-full w-full rounded-[1.38rem] bg-black shadow-[inset_0_0_0_1px_rgba(104,171,232,0.42)] ${ios ? "cq-sigil-scanner-inner--ios overflow-hidden" : "overflow-hidden"}`}
        data-camera-active={cameraActive || camBusy ? "true" : "false"}
        data-cam-busy={camBusy ? "true" : "false"}
        data-detecting={detecting ? "true" : "false"}
        data-absorbing={absorbing ? "true" : "false"}
        data-ios-scanner={ios ? "true" : "false"}
      >
        <div className="cq-scanner-camera-layer absolute inset-0 z-0 overflow-hidden rounded-[inherit] bg-black">
          {children}
          {busyOverlay ? (
            <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden rounded-[inherit]">
              {busyOverlay}
            </div>
          ) : null}
        </div>

        <div className="cq-scanner-anim-zone cq-scanner-effects-overlay pointer-events-none absolute inset-0 z-[30] overflow-visible rounded-[inherit]">
          <div className="cq-sigil-scan-dim absolute inset-0 z-10 rounded-[inherit]" aria-hidden />
          {!reduce ? (
            <motion.div
              className="cq-sigil-fog absolute inset-0 z-10 rounded-[inherit]"
              animate={{ opacity: lensLive ? [0.08, 0.14, 0.1] : [0.24, 0.34, 0.26] }}
              transition={{ repeat: Infinity, duration: 4.2 }}
              aria-hidden
            />
          ) : (
            <div className="cq-sigil-fog absolute inset-0 z-10 rounded-[inherit] opacity-20" aria-hidden />
          )}

          <ScannerRuneHieroglyphics boosted={boost} lensLive={lensLive} iosMode={ios} />

          <AnimatedScanLine detecting={detecting} absorbing={absorbing} lensLive={lensLive} />

          <ScannerFrameMagic detecting={detecting} cameraActive={cameraActive || camBusy} />

          <div className="pointer-events-none absolute inset-[5.25%] z-40 rounded-2xl" aria-hidden>
            {(
              [
                [0, "left-0 top-0 border-l-4 border-t-4 rounded-tl-[1rem]", 0],
                [1, "right-0 top-0 border-r-4 border-t-4 rounded-tr-[1rem]", 0.2],
                [2, "left-0 bottom-0 border-l-4 border-b-4 rounded-bl-[1rem]", 0.45],
                [3, "right-0 bottom-0 border-r-4 border-b-4 rounded-br-[1rem]", 0.65],
              ] as const
            ).map(([id, positioning, stagger]) =>
              reduce ? (
                <span key={id} className={`cq-qr-corner absolute ${positioning as string} h-11 w-11 border-sky-200/95`} />
              ) : (
                <motion.span
                  key={id}
                  className={`cq-qr-corner absolute ${positioning as string} h-11 w-11 border-sky-200`}
                  initial={false}
                  animate={{
                    opacity: lensLive ? [0.88, 1, 0.9] : [0.78, 0.95, 0.82],
                    scale: detecting ? [1, 1.08, 1] : absorbing ? [1, 1.14, 0.96] : [1, 1.04, 1],
                  }}
                  transition={{
                    repeat: absorbing ? 0 : Infinity,
                    duration: absorbing ? 0.55 : detecting ? 0.5 : 2.4,
                    delay: stagger,
                    ease: "easeInOut",
                  }}
                  style={{
                    boxShadow: lensLive
                      ? "0 0 14px rgba(56,189,248,0.55), inset 0 0 18px rgba(56,189,248,0.14)"
                      : "0 0 12px rgba(56,189,248,0.4), inset 0 0 12px rgba(56,189,248,0.1)",
                  }}
                />
              ),
            )}
          </div>
        </div>

        <div className="cq-scanner-lens-caption pointer-events-none absolute bottom-3 left-1/2 z-[50] max-w-[92%] -translate-x-1/2 rounded-full border border-cyan-300/45 bg-uri-navy/90 px-3 py-2 text-center shadow-lg">
          <p className="text-[11px] font-semibold leading-snug text-cyan-100/95">
            Center your CampusQuest QR code in the ring — CQ Scanner locks and validates it in real time.
          </p>
        </div>
      </div>
    </div>
  );
}
