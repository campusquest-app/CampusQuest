"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ScannerParticles } from "@/components/scanner/ScannerParticles";

type MagicalScannerFrameProps = {
  /** Camera stream + overlays live here */
  children: React.ReactNode;
  detecting?: boolean;
  absorbing?: boolean;
  camBusy?: boolean;
};

export function MagicalScannerFrame({ children, detecting = false, absorbing = false, camBusy = false }: MagicalScannerFrameProps) {
  const reduce = useReducedMotion();
  const boost = detecting || absorbing;

  return (
    <motion.div
      className="cq-sigil-scanner-shell relative aspect-square w-full max-h-[52vh] mx-auto rounded-[1.65rem] p-[3px] will-change-transform"
      animate={
        reduce
          ? {}
          : {
              scale: absorbing ? 0.97 : detecting ? [1, 1.022, 1] : boost ? [1, 1.012, 1] : [1, 1.008, 1],
              filter: absorbing
                ? ["brightness(1.02)", "brightness(1.2)", "brightness(1.05)"]
                : detecting
                  ? ["brightness(1)", "brightness(1.12)", "brightness(1.03)"]
                  : ["brightness(1)", "brightness(1.06)", "brightness(1)"],
            }
      }
      transition={
        reduce
          ? {}
          : {
              repeat: absorbing ? 0 : Infinity,
              duration: absorbing ? 0.85 : detecting ? 0.65 : 3.8,
              ease: absorbing ? [0.22, 1, 0.36, 1] : "easeInOut",
            }
      }
    >
      {/* Energy crackle halo */}
      {!reduce && (
        <motion.span
          className="pointer-events-none absolute -inset-1 rounded-[1.85rem] bg-gradient-to-br from-sky-400/35 via-uri-keaney/15 to-transparent opacity-75 blur-[1px]"
          animate={{
            opacity: boost ? [0.45, 0.92, 0.55] : [0.3, 0.55, 0.38],
          }}
          transition={{ repeat: Infinity, duration: boost ? 0.85 : 2.9, ease: "easeInOut" }}
          aria-hidden
        />
      )}

      <div className="relative h-full w-full rounded-[inherit]">
        {/* Inner vignette */}
        <div className="pointer-events-none absolute inset-[2px] z-[14] rounded-[1.38rem] ring-2 ring-black/55 shadow-[inset_0_0_80px_rgba(4,18,54,0.65)] mix-blend-multiply opacity-95" />

        <div className="cq-sigil-scanner-inner cq-qr-scanner-shell-inner relative h-full w-full overflow-hidden rounded-[1.38rem] bg-black shadow-[inset_0_0_0_1px_rgba(104,171,232,0.38)]">
          <ScannerParticles boosted={boost} className="z-[6]" />

          {/* Light rays */}
          {!reduce ? (
            <motion.div
              className="pointer-events-none absolute -inset-[40%] z-[4] cq-sigil-light-rays opacity-55 mix-blend-screen"
              animate={{ rotate: [0, 360] }}
              transition={{ repeat: Infinity, duration: 48, ease: "linear" }}
            />
          ) : null}

          {/* Fog wash */}
          <motion.div
            className="pointer-events-none absolute inset-0 z-[5] cq-sigil-fog opacity-55"
            animate={reduce ? {} : { opacity: [0.35, 0.55, 0.42] }}
            transition={{ repeat: Infinity, duration: 4.2 }}
          />

          <div className="relative z-[8] h-full w-full cq-sigil-video-parallax">
            {/* Camera subtle sway applied to video stack */}
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

          {/* Vertical scan line */}
          <div
            className="cq-qr-scan-line pointer-events-none absolute left-[9%] right-[9%] z-12 h-[2px] rounded-full bg-gradient-to-r from-transparent via-cyan-100 to-transparent opacity-95 shadow-[0_0_16px_rgba(186,230,253,0.95)] cq-sigil-scan-line-v"
            aria-hidden
          />
          {/* Horizontal energy beam */}
          <div className="pointer-events-none absolute left-[6%] right-[6%] top-[52%] z-11 cq-sigil-h-beam opacity-95" aria-hidden />

          {/* Corners */}
          <div className="pointer-events-none absolute inset-[5.25%] z-[13] rounded-2xl" aria-hidden>
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
                      detecting || absorbing
                        ? [
                            "0 0 16px rgba(56,189,248,0.55), inset 0 0 22px rgba(56,189,248,0.15)",
                            "0 0 36px rgba(125,211,252,0.85), inset 0 0 28px rgba(186,230,253,0.22)",
                          ]
                        : [
                            "0 0 12px rgba(56,189,248,0.35), inset 0 0 12px rgba(56,189,248,0.08)",
                            "0 0 26px rgba(56,189,248,0.55), inset 0 0 18px rgba(56,189,248,0.12)",
                          ],
                    scale: detecting ? [1, 1.07, 1] : absorbing ? [1, 1.12, 0.94] : [1, 1.035, 1],
                  }}
                  transition={{
                    repeat: absorbing ? 1 : Infinity,
                    duration: absorbing ? 0.42 : detecting ? 0.72 : 2.85,
                    delay: stagger + (detecting ? 0 : absorbing ? 0 : 0),
                    ease: "easeInOut",
                  }}
                />
              ),
            )}
          </div>

          {/* CQ Scanner ward hint */}
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-[20] max-w-[92%] -translate-x-1/2 rounded-full border border-cyan-300/40 bg-uri-navy/75 px-3 py-2 text-center shadow-lg backdrop-blur-md">
            <p className="text-[11px] font-semibold leading-snug text-cyan-100/95 drop-shadow-[0_0_8px_rgba(56,189,248,0.35)]">
              Center your CampusQuest QR code in the ring — CQ Scanner locks and validates it in real time.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
