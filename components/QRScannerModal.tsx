"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  parseCampusQuestQrPayload,
  type CampusQuestQrActivityPayloadParsed,
  type ParseQrActivityErrorCode,
} from "@/lib/qrCampusQuestActivity";
import { extractCampusQuestQrCode, isLegacyCampusQuestActivityJson } from "@/lib/qrCodeExtract";
import { MagicalScannerFrame } from "@/components/scanner/MagicalScannerFrame";
import { CQScannerScreen } from "@/components/scanner/CQScannerScreen";
import { ScanSuccessOverlay } from "@/components/scanner/ScanSuccessOverlay";
import type { QrScannerValidationResult, SigilScannerReward } from "@/components/scanner/sigilRewardTypes";
import {
  feedbackSigilAbsorption,
  playSigilScanLock,
} from "@/lib/client/scannerFantasyFeedback";

export type { SigilScannerReward, QrScannerValidationResult };

export type QRScannerModalProps = {
  open: boolean;
  onClose: () => void;
  /** CampusQuest ledger — persist rewards; return immersive errors or blessing summary for CQ Scanner. */
  onPayloadValidated: (payload: CampusQuestQrActivityPayloadParsed) => QrScannerValidationResult;
  /** Server-validated secure QR token (`cq_…` or `/scan?code=`). */
  onSecureCodeScanned?: (code: string) => QrScannerValidationResult | Promise<QrScannerValidationResult>;
  /** Deep-link token to validate once when the scanner opens. */
  pendingScanCode?: string | null;
};

type CamState = "idle" | "starting" | "ready" | "denied";

function CameraPermissionSealsAlert() {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="w-full max-w-md rounded-2xl border border-cyan-400/35 bg-[#04142d]/92 px-4 py-4 text-sm shadow-[0_0_36px_-10px_rgba(56,189,248,0.4)] backdrop-blur-md"
    >
      <p className="text-center font-display text-base font-bold tracking-[0.14em] text-cyan-100 drop-shadow-[0_0_12px_rgba(56,189,248,0.35)]">
        ✦ CQ Scanner ✦
      </p>
      <p className="mt-3 text-center text-[15px] font-semibold leading-snug text-white/95">
        The scanner lens could not be activated.
      </p>
      <p className="mt-4 leading-relaxed text-cyan-100/92">
        Camera access is blocked by this device&apos;s permission seals.
      </p>
      <p className="mt-2 leading-relaxed text-cyan-100/85">Enable camera access in settings and try again.</p>
    </div>
  );
}

function cameraDeniedMessage(err: unknown): string | "permission_blocked" {
  if (err instanceof Error && /NotAllowed/i.test(err.name)) {
    return "permission_blocked";
  }
  return "The scanner lens could not be activated.\n\nCQ Scanner could not open the camera on this device — check permissions and try again.";
}

function friendlyBannerForParseCode(code: ParseQrActivityErrorCode, message: string): string {
  if (code === "invalid_json")
    return "That code isn’t a CampusQuest QR code — CQ Scanner reads only official CampusQuest QR codes.";
  return message;
}

export function QRScannerModal({
  open,
  onClose,
  onPayloadValidated,
  onSecureCodeScanned,
  pendingScanCode = null,
}: QRScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  type ScannerApi = {
    start: () => Promise<void>;
    stop: () => void;
    destroy: () => void;
    pause: (stopStreamImmediately?: boolean) => Promise<boolean>;
  };
  const scannerRef = useRef<ScannerApi | null>(null);
  const lastHitRef = useRef<string>("");
  const reopenClearTimer = useRef<number | null>(null);
  const detectionTimer = useRef<number | null>(null);
  const successCloseTimer = useRef<number | null>(null);

  const [mounted, setMounted] = useState(false);
  const [camState, setCamState] = useState<CamState>("idle");
  const [banner, setBanner] = useState<string | null>(null);
  const [cameraPermissionBlocked, setCameraPermissionBlocked] = useState(false);
  const [sigilNear, setSigilNear] = useState(false);
  const [absorbing, setAbsorbing] = useState(false);
  const [successBlessing, setSuccessBlessing] = useState<SigilScannerReward | null>(null);
  const [screenJolt, setScreenJolt] = useState(false);

  const reduceMotion = useReducedMotion();

  useEffect(() => setMounted(true), []);

  const pulseSigilProximity = useCallback(() => {
    setSigilNear(true);
    if (detectionTimer.current != null) window.clearTimeout(detectionTimer.current);
    detectionTimer.current = window.setTimeout(() => {
      setSigilNear(false);
      detectionTimer.current = null;
    }, 340);
  }, []);

  const stopScanner = useCallback(() => {
    const sc = scannerRef.current;
    scannerRef.current = null;
    if (!sc) return;
    try {
      sc.stop();
    } catch {
      /* ignore */
    }
    try {
      sc.destroy();
    } catch {
      /* ignore */
    }
  }, []);

  const celebrateScanSuccess = useCallback(
    (verdict: Extract<QrScannerValidationResult, { ok: true }>) => {
      playSigilScanLock();
      feedbackSigilAbsorption();
      void scannerRef.current?.pause?.();
      setAbsorbing(true);
      if (!reduceMotion) {
        setScreenJolt(true);
        window.setTimeout(() => setScreenJolt(false), 420);
      }
      setSuccessBlessing(verdict.reward);
      if (successCloseTimer.current) window.clearTimeout(successCloseTimer.current);
      successCloseTimer.current = window.setTimeout(() => {
        successCloseTimer.current = null;
        setSuccessBlessing(null);
        setAbsorbing(false);
        lastHitRef.current = "";
        onClose();
      }, 2800);
    },
    [onClose, reduceMotion],
  );

  const handleDecodedPayload = useCallback(
    (text: string) => {
      pulseSigilProximity();

      const trimmed = text.trim();
      if (!trimmed || trimmed === lastHitRef.current) return;

      lastHitRef.current = trimmed;

      const secureCode = extractCampusQuestQrCode(trimmed);
      if (secureCode && onSecureCodeScanned) {
        void (async () => {
          const verdict = await onSecureCodeScanned(secureCode);
          if (!verdict.ok) {
            setBanner(verdict.banner);
            if (reopenClearTimer.current) window.clearTimeout(reopenClearTimer.current);
            reopenClearTimer.current = window.setTimeout(() => {
              lastHitRef.current = "";
            }, 2200);
            return;
          }
          celebrateScanSuccess(verdict);
        })();
        return;
      }

      if (!isLegacyCampusQuestActivityJson(trimmed)) {
        setBanner(
          secureCode
            ? "This CampusQuest QR must be scanned while signed in — open CQ Scanner from your dashboard."
            : "That code isn’t a CampusQuest QR code — CQ Scanner reads only official CampusQuest QR codes.",
        );
        if (reopenClearTimer.current) window.clearTimeout(reopenClearTimer.current);
        reopenClearTimer.current = window.setTimeout(() => {
          lastHitRef.current = "";
        }, 1700);
        return;
      }

      const parsed = parseCampusQuestQrPayload(trimmed);
      if (!parsed.ok) {
        setBanner(friendlyBannerForParseCode(parsed.code, parsed.message));
        if (reopenClearTimer.current) window.clearTimeout(reopenClearTimer.current);
        reopenClearTimer.current = window.setTimeout(() => {
          lastHitRef.current = "";
        }, 1700);
        return;
      }

      const verdict = onPayloadValidated(parsed.payload);
      if (!verdict.ok) {
        setBanner(verdict.banner);
        lastHitRef.current = "";
        return;
      }

      celebrateScanSuccess(verdict);
    },
    [celebrateScanSuccess, onPayloadValidated, onSecureCodeScanned, pulseSigilProximity],
  );

  useEffect(() => {
    if (!open || !pendingScanCode?.trim() || !onSecureCodeScanned) return;
    const code = pendingScanCode.trim();
    const t = window.setTimeout(() => {
      handleDecodedPayload(code.startsWith("http") ? code : `https://campusquest.local/scan?code=${encodeURIComponent(code)}`);
    }, 600);
    return () => window.clearTimeout(t);
  }, [open, pendingScanCode, onSecureCodeScanned, handleDecodedPayload]);

  useEffect(() => {
    if (!open) {
      setBanner(null);
      setCameraPermissionBlocked(false);
      setSigilNear(false);
      setAbsorbing(false);
      setSuccessBlessing(null);
      setScreenJolt(false);
      lastHitRef.current = "";
      if (successCloseTimer.current) {
        window.clearTimeout(successCloseTimer.current);
        successCloseTimer.current = null;
      }
    }
  }, [open]);

  useEffect(() => {
    if (!open || !mounted) return;
    setBanner(null);
    setCameraPermissionBlocked(false);
    setCamState("starting");
    lastHitRef.current = "";
    setSuccessBlessing(null);
    setAbsorbing(false);

    let cancelled = false;

    (async () => {
      try {
        const mod = await import("qr-scanner");
        const QrScanner = mod.default;
        QrScanner.WORKER_PATH = "/qr-scanner-worker.min.js";
        await new Promise<number>((r) => window.requestAnimationFrame(() => r(0)));

        const video = videoRef.current;
        if (cancelled || !video) return;

        try {
          const hasCam = await QrScanner.hasCamera();
          if (!hasCam && !cancelled) {
            setCamState("denied");
            setCameraPermissionBlocked(false);
            setBanner("CQ Scanner found no imaging crystal on this vessel.");
            return;
          }

          const scanner = new QrScanner(
            video,
            (result) => {
              handleDecodedPayload(result.data);
            },
            {
              preferredCamera: "environment",
              maxScansPerSecond: 4,
              highlightScanRegion: false,
              highlightCodeOutline: true,
              returnDetailedScanResult: true as const,
            },
          ) as ScannerApi;
          scannerRef.current = scanner;
          await scanner.start();
          if (!cancelled) setCamState("ready");
        } catch (e) {
          if (!cancelled) {
            setCamState("denied");
            const msg = cameraDeniedMessage(e);
            if (msg === "permission_blocked") {
              setCameraPermissionBlocked(true);
              setBanner(null);
            } else {
              setCameraPermissionBlocked(false);
              setBanner(msg);
            }
          }
        }
      } catch {
        if (!cancelled) {
          setCamState("denied");
          setCameraPermissionBlocked(false);
          setBanner("CQ Scanner failed to spawn — refresh and try once more.");
        }
      }
    })();

    return () => {
      cancelled = true;
      stopScanner();
      if (reopenClearTimer.current) {
        window.clearTimeout(reopenClearTimer.current);
        reopenClearTimer.current = null;
      }
      if (detectionTimer.current) {
        window.clearTimeout(detectionTimer.current);
        detectionTimer.current = null;
      }
    };
  }, [handleDecodedPayload, mounted, open, stopScanner]);

  useEffect(() => {
    return () => {
      if (successCloseTimer.current) window.clearTimeout(successCloseTimer.current);
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="cq-scanner-portal"
          className="fixed inset-0 z-[140] flex flex-col overflow-hidden bg-[#010810]/95 backdrop-blur-xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cq-cq-scanner-title"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={
            reduceMotion
              ? { opacity: 1 }
              : {
                  opacity: 1,
                  x: screenJolt ? [0, -3, 3, -2, 2, 0] : 0,
                }
          }
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={reduceMotion ? { duration: 0.15 } : { duration: screenJolt ? 0.38 : 0.45 }}
        >
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <motion.div
              className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,rgba(56,189,248,0.22),transparent_55%)] opacity-95"
              animate={reduceMotion ? {} : { opacity: [0.65, 0.95, 0.72] }}
              transition={{ repeat: Infinity, duration: 6.5, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute -left-1/4 top-1/3 h-[60vh] w-[60vh] rounded-full bg-cyan-500/14 blur-[100px]"
              animate={reduceMotion ? {} : { scale: [1, 1.08, 1], x: [0, 12, 0] }}
              transition={{ repeat: Infinity, duration: 12 }}
            />
            <motion.div
              className="absolute -right-1/3 bottom-[10%] h-[52vh] w-[52vh] rounded-full bg-uri-keaney/16 blur-[90px]"
              animate={reduceMotion ? {} : { scale: [1, 1.06, 1], opacity: [0.5, 0.75, 0.52] }}
              transition={{ repeat: Infinity, duration: 9 }}
            />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(transparent_20%,rgba(1,10,26,0.85)_105%)]" />
          </div>

          <CQScannerScreen
            onClose={() => {
              if (successCloseTimer.current) {
                window.clearTimeout(successCloseTimer.current);
                successCloseTimer.current = null;
              }
              lastHitRef.current = "";
              setSuccessBlessing(null);
              setAbsorbing(false);
              onClose();
            }}
            frameSlot={
              <MagicalScannerFrame
                detecting={sigilNear}
                absorbing={absorbing}
                camBusy={camState === "starting"}
                cameraActive={camState === "ready"}
                busyOverlay={
                  camState === "starting" ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 bg-[#020b1f]/92 text-[13px] text-cyan-50/92">
                      <span className="cq-qr-spinner h-11 w-11 rounded-full border-2 border-cyan-900/55 border-t-cyan-200" aria-hidden />
                      <span>CQ Scanner awakening the lens…</span>
                    </div>
                  ) : undefined
                }
              >
                <video ref={videoRef} className="h-full w-full object-cover opacity-[0.97]" muted playsInline />
              </MagicalScannerFrame>
            }
            bannerSlot={
              cameraPermissionBlocked && !successBlessing ? (
                <CameraPermissionSealsAlert />
              ) : (banner || camState === "denied") && !successBlessing ? (
                <div
                  role="alert"
                  className="w-full max-w-md whitespace-pre-line rounded-2xl border border-rose-400/40 bg-[#1f050d]/80 px-4 py-3 text-sm leading-relaxed text-rose-50/96 shadow-[0_0_36px_-8px_rgba(244,63,94,0.45)] backdrop-blur-sm"
                >
                  {banner ?? "CQ Scanner halted — the lens may still be sealed in system settings."}
                </div>
              ) : null
            }
          />

          <ScanSuccessOverlay reward={successBlessing} />
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
