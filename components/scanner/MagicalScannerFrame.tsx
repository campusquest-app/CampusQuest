"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ScannerFrameMagic } from "@/components/scanner/ScannerFrameMagic";
import { ScannerParticles } from "@/components/scanner/ScannerParticles";
import { ScannerScanLine } from "@/components/scanner/ScannerScanLine";

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
  const camOn = cameraActive && !camBusy;

  return (
    <motion.div
      className="cq-sigil-scanner-shell relative mx-auto aspect-square w-full max-h-[52vh] rounded-[1.65rem] p-[3px] will-change-transform"
      animate={
        reduce
          ? {}
          : {
              scale: absorbing ? 0.97 : detecting ? [1, 1.024, 1] : [1, 1.01, 1],
              filter: absorbing
                ? ["brightness(1.02)", "brightness(1.18)", "brightness(1.05)"]
                : detecting
                  ? ["brightness(1)", "brightness(1.1)", "brightness(1.02)"]
                  : ["brightness(1)", "brightness(1.06)", "brightness(1)"],
            }
      }
      transition={
        reduce
          ? {}
          : {
              repeat: absorbing ? 0 : Infinity,
              duration: absorbing ? 0.85 : detecting ? 0.55 : 3.6,
              ease: absorbing ? [0.22, 1, 0.36, 1] : "easeInOut",
            }
      }
    >
      {!reduce && (
        <motion.span
          className="cq-sigil-shell-halo pointer-events-none absolute -inset-1 rounded-[1.85rem] bg-gradient-to-br from-sky-400/40 via-uri-keaney/18 to-transparent blur-[1px]"
          animate={{
            opacity: boost
              ? [0.5, 0.9, 0.55]
              : camOn
                ? [0.38, 0.52, 0.42]
                : [0.42, 0.58, 0.45],
          }}
          transition={{ repeat: Infinity, duration: boost ? 0.75 : 2.6, ease: "easeInOut" }}
          aria-hidden
        />
      )}

      <div
        className="cq-sigil-scanner-inner cq-qr-scanner-shell-inner relative h-full w-full overflow-hidden rounded-[1.38rem] bg-black shadow-[inset_0_0_0_1px_rgba(104,171,232,0.42)]"
        data-camera-active={camOn ? "true" : "false"}
        data-cam-busy={camBusy ? "true" : "false"}
        data-detecting={detecting ? "true" : "false"}
        data-absorbing={absorbing ? "true" : "false"}
      >
        {/* 1 — Camera feed */}
        <div className="absolute inset-0 z-[1] overflow-hidden rounded-[inherit] bg-black">
          <motion.div
            className="relative h-full w-full"
            animate={
              reduce || camBusy
                ? {}
                : {
                    x: [0, 2.5, -2, 1.2, 0],
                    y: [0, -1.8, 1.2, -1, 0],
                  }
            }
            transition={{ repeat: Infinity, duration: 9.8, ease: "easeInOut" }}
          >
            {children}
          </motion.div>
        </div>

        {/* 2 — Dark overlay (very subtle when live) */}
        <div className="cq-sigil-scan-dim pointer-events-none absolute inset-0 z-[2] rounded-[inherit]" aria-hidden />

        <motion.div
          className="cq-sigil-fog pointer-events-none absolute inset-0 z-[3]"
          animate={reduce ? {} : { opacity: camOn ? [0.18, 0.28, 0.2] : [0.32, 0.45, 0.35] }}
          transition={{ repeat: Infinity, duration: 4.2 }}
          aria-hidden
        />

        {/* 3 — Runes */}
        <ScannerParticles boosted={boost} cameraActive={camOn} className="z-[4]" />

        {/* 4 — Scan line (always animating when live) */}
        <ScannerScanLine detecting={detecting} absorbing={absorbing} cameraActive={camOn} />

        {/* 5 — Frame magic + corners */}
        <ScannerFrameMagic detecting={detecting} cameraActive={camOn} />
        <div className="pointer-events-none absolute inset-[5.25%] z-[7] rounded-2xl" aria-hidden>
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
                  boxShadow:
                    absorbing
                      ? [
                          "0 0 20px rgba(125,211,252,0.95), inset 0 0 28px rgba(186,230,253,0.28)",
                          "0 0 40px rgba(56,189,248,0.9), inset 0 0 32px rgba(125,211,252,0.22)",
                          "0 0 18px rgba(56,189,248,0.55), inset 0 0 20px rgba(56,189,248,0.14)",
                        ]
                      : detecting
                        ? [
                            "0 0 18px rgba(56,189,248,0.65), inset 0 0 22px rgba(56,189,248,0.18)",
                            "0 0 36px rgba(125,211,252,0.9), inset 0 0 26px rgba(186,230,253,0.24)",
                            "0 0 16px rgba(56,189,248,0.5), inset 0 0 18px rgba(56,189,248,0.12)",
                          ]
                        : camOn
                          ? [
                              "0 0 12px rgba(56,189,248,0.45), inset 0 0 16px rgba(56,189,248,0.12)",
                              "0 0 28px rgba(56,189,248,0.62), inset 0 0 20px rgba(56,189,248,0.16)",
                              "0 0 12px rgba(56,189,248,0.45), inset 0 0 16px rgba(56,189,248,0.12)",
                            ]
                          : [
                              "0 0 12px rgba(56,189,248,0.4), inset 0 0 12px rgba(56,189,248,0.1)",
                              "0 0 30px rgba(56,189,248,0.55), inset 0 0 18px rgba(56,189,248,0.14)",
                              "0 0 12px rgba(56,189,248,0.4), inset 0 0 12px rgba(56,189,248,0.1)",
                            ],
                  scale: detecting ? [1, 1.08, 1] : absorbing ? [1, 1.14, 0.96] : [1, 1.04, 1],
                  opacity: camOn ? [0.85, 1, 0.88] : [0.78, 0.95, 0.82],
                }}
                transition={{
                  repeat: absorbing ? 0 : Infinity,
                  duration: absorbing ? 0.55 : detecting ? 0.5 : 2.4,
                  delay: stagger,
                  ease: "easeInOut",
                }}
              />
            ),
          )}
        </div>

        {busyOverlay ? (
          <div className="absolute inset-0 z-[35] overflow-hidden rounded-[inherit]">{busyOverlay}</div>
        ) : null}

        {/* 6 — Instructions */}
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-[30] max-w-[92%] -translate-x-1/2 rounded-full border border-cyan-300/45 bg-uri-navy/78 px-3 py-2 text-center shadow-lg backdrop-blur-md">
          <p className="text-[11px] font-semibold leading-snug text-cyan-100/95 drop-shadow-[0_0_8px_rgba(56,189,248,0.4)]">
            Center your CampusQuest QR code in the ring — CQ Scanner locks and validates it in real time.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
