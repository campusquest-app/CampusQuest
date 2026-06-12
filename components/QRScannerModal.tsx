"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { CampusQuestQrActivityPayloadParsed } from "@/lib/qrCampusQuestActivity";
import { MagicalScannerFrame } from "@/components/scanner/MagicalScannerFrame";
import { ScannerCameraFeed } from "@/components/scanner/ScannerCameraFeed";
import { isIosLike } from "@/lib/client/isIosDevice";
import { CQScannerScreen } from "@/components/scanner/CQScannerScreen";
import { ScanSuccessOverlay } from "@/components/scanner/ScanSuccessOverlay";
import { ScanValidatedCinematic } from "@/components/scanner/ScanValidatedCinematic";
import type { QrScannerValidationResult, SigilScannerReward } from "@/components/scanner/sigilRewardTypes";
import type { ActivityXPGainSession } from "@/components/xp/xpGainTypes";
import { classifyQrScanText } from "@/lib/client/qrScanClassify";
import { normalizeQrScanInput } from "@/lib/client/normalizeQrScanInput";
import { logQrScanDebug, logQrScanRawResult } from "@/lib/client/qrScanDebug";
import {
  QR_SCAN_USER_MESSAGES,
  qrScanBannerFromUnknownError,
  userMessageForParseError,
} from "@/lib/client/qrScanUserMessages";
import {
  feedbackSigilAbsorption,
  playSigilScanLock,
} from "@/lib/client/scannerFantasyFeedback";
import { unlockRewardAudioSilently, unlockMobileForgeAudio } from "@/lib/client/xpCelebration";
import { readMobileViewport } from "@/lib/client/xpRewardAnimation";
import { logRewardFlow, logScanner } from "@/lib/client/xpAnimationDebug";
import {
  isScanRewardFlowActive,
  SCAN_TRANSITION_TO_XP_MS,
  SCAN_VALIDATED_MS,
  SCAN_XP_HANDOFF_MS,
  type ScanRewardState,
} from "@/lib/client/scanRewardFlow";

export type { SigilScannerReward, QrScannerValidationResult };

export type QRScannerModalProps = {
  open: boolean;
  onClose: () => void;
  onPayloadValidated: (payload: CampusQuestQrActivityPayloadParsed) => QrScannerValidationResult;
  onSecureCodeScanned?: (code: string) => QrScannerValidationResult | Promise<QrScannerValidationResult>;
  /** After scanner cinematic — parent mounts XP overlay (do not flash immediately on scan). */
  onXpHandoff?: (session: ActivityXPGainSession) => void;
  pendingScanCode?: string | null;
  /** Shown when deep-link validation failed before the lens opens. */
  prefillErrorBanner?: string | null;
  /** Platform admins may scan the same code repeatedly for testing. */
  allowRepeatQrScan?: boolean;
};

type ScanSuccessVerdict = Extract<QrScannerValidationResult, { ok: true }>;

type CamState = "idle" | "starting" | "ready" | "denied";
type ScannerPhase = "idle" | "scanning" | "processing" | "success" | "error";

const SCAN_SEARCH_HINT_MS = 4000;
const PROCESSING_TIMEOUT_MS = 8000;
const ERROR_MIN_DISPLAY_MS = 2000;
const ERROR_REVEAL_DELAY_MS = 450;
const INVALID_QR_DEBOUNCE_MS = 2800;
/** Fast enough for 1–2s detection when QR is centered; default library max is 25. */
const MAX_SCANS_PER_SECOND = 12;

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function calculateCenterScanRegion(video: HTMLVideoElement) {
  const w = video.videoWidth;
  const h = video.videoHeight;
  const side = Math.round(Math.min(w, h) * 0.72);
  return {
    x: Math.round((w - side) / 2),
    y: Math.round((h - side) / 2),
    width: side,
    height: side,
  };
}

async function applyIdealCameraConstraints(video: HTMLVideoElement) {
  const stream = video.srcObject;
  if (!stream || !(stream instanceof MediaStream)) return;
  const track = stream.getVideoTracks()[0];
  if (!track) return;
  try {
    await track.applyConstraints({
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: { ideal: "environment" },
    });
  } catch {
    /* device may ignore ideal constraints */
  }
}

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

export function QRScannerModal({
  open,
  onClose,
  onPayloadValidated,
  onSecureCodeScanned,
  onXpHandoff,
  pendingScanCode = null,
  prefillErrorBanner = null,
  allowRepeatQrScan = false,
}: QRScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  type ScannerApi = {
    start: () => Promise<void>;
    stop: () => void;
    destroy: () => void;
    pause: (stopStreamImmediately?: boolean) => Promise<boolean>;
  };
  const scannerRef = useRef<ScannerApi | null>(null);
  const isProcessingScanRef = useRef(false);
  /** Set synchronously on first decode; blocks rapid duplicate onScan events. */
  const scanInProgressRef = useRef(false);
  const scannerPhaseRef = useRef<ScannerPhase>("idle");
  const camStateRef = useRef<CamState>("idle");
  const lastProcessedCodeRef = useRef<string>("");
  const lastInvalidAtRef = useRef(0);
  const proximityTimerRef = useRef<number | null>(null);
  const scanHintTimerRef = useRef<number | null>(null);
  const processingTimeoutRef = useRef<number | null>(null);
  const handleDecodedRef = useRef<(text: string) => void>(() => {});

  const [mounted, setMounted] = useState(false);
  const [camState, setCamState] = useState<CamState>("idle");
  const [scannerPhase, setScannerPhase] = useState<ScannerPhase>("idle");
  const [scanSearchHint, setScanSearchHint] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [cameraPermissionBlocked, setCameraPermissionBlocked] = useState(false);
  const [sigilNear, setSigilNear] = useState(false);
  const [absorbing, setAbsorbing] = useState(false);
  const [successBlessing, setSuccessBlessing] = useState<SigilScannerReward | null>(null);
  const [screenJolt, setScreenJolt] = useState(false);
  const [scanRewardState, setScanRewardState] = useState<ScanRewardState>("idle");

  const scanRewardStateRef = useRef<ScanRewardState>("idle");
  const scanRewardFlowRef = useRef(false);

  const reduceMotion = useReducedMotion();
  const [iosScanner, setIosScanner] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    document.documentElement.setAttribute("data-cq-scanner-active", "");
    return () => {
      document.documentElement.removeAttribute("data-cq-scanner-active");
    };
  }, [open]);

  camStateRef.current = camState;
  scannerPhaseRef.current = scannerPhase;
  scanRewardStateRef.current = scanRewardState;

  useEffect(() => {
    setMounted(true);
    setIosScanner(isIosLike());
  }, []);

  useEffect(() => {
    if (!open) return;
    logScanner("opened", { ios: isIosLike() });
    return () => {
      logScanner("closed", {});
    };
  }, [open]);

  const clearScanHintTimer = useCallback(() => {
    if (scanHintTimerRef.current != null) {
      window.clearTimeout(scanHintTimerRef.current);
      scanHintTimerRef.current = null;
    }
  }, []);

  const clearProcessingTimeout = useCallback(() => {
    if (processingTimeoutRef.current != null) {
      window.clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }
  }, []);

  const startScanHintTimer = useCallback(() => {
    clearScanHintTimer();
    setScanSearchHint(false);
    scanHintTimerRef.current = window.setTimeout(() => {
      if (scannerPhaseRef.current === "scanning") {
        setScanSearchHint(true);
      }
    }, SCAN_SEARCH_HINT_MS);
  }, [clearScanHintTimer]);

  const pulseSigilProximity = useCallback(() => {
    setSigilNear(true);
    if (proximityTimerRef.current != null) window.clearTimeout(proximityTimerRef.current);
    proximityTimerRef.current = window.setTimeout(() => {
      setSigilNear(false);
      proximityTimerRef.current = null;
    }, 280);
  }, []);

  const stopScanner = useCallback(() => {
    clearScanHintTimer();
    clearProcessingTimeout();
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
  }, [clearProcessingTimeout, clearScanHintTimer]);

  const releaseScanProgressLock = useCallback((clearLastCode: boolean) => {
    scanInProgressRef.current = false;
    isProcessingScanRef.current = false;
    if (clearLastCode) lastProcessedCodeRef.current = "";
  }, []);

  const tryAcquireScanForCode = useCallback(
    (code: string): boolean => {
      if (scanInProgressRef.current) {
        logQrScanDebug("scan_ignored_duplicate", { code, reason: "scan_in_progress" });
        return false;
      }
      if (!allowRepeatQrScan && code === lastProcessedCodeRef.current) {
        logQrScanDebug("scan_ignored_duplicate", { code, reason: "same_code" });
        return false;
      }
      scanInProgressRef.current = true;
      lastProcessedCodeRef.current = code;
      logQrScanDebug("scan_detected", { code, allowRepeatQrScan });
      return true;
    },
    [allowRepeatQrScan],
  );

  const resumeScanning = useCallback(async () => {
    const sc = scannerRef.current;
    if (!sc || camStateRef.current !== "ready") return;
    isProcessingScanRef.current = false;
    setScannerPhase("scanning");
    setScanSearchHint(false);
    startScanHintTimer();
    try {
      await sc.start();
    } catch {
      /* keep scanning phase */
    }
  }, [startScanHintTimer]);

  const resetForAnotherScan = useCallback(() => {
    releaseScanProgressLock(true);
    scanRewardFlowRef.current = false;
    setScanRewardState("idle");
    setBanner(null);
    setSuccessBlessing(null);
    setAbsorbing(false);
    setScreenJolt(false);
    void resumeScanning();
  }, [releaseScanProgressLock, resumeScanning]);

  const showDelayedError = useCallback(async (message: string) => {
    clearProcessingTimeout();
    await sleep(ERROR_REVEAL_DELAY_MS);
    setBanner(message);
    setScannerPhase("error");
    setScanSearchHint(false);
    clearScanHintTimer();
    releaseScanProgressLock(true);
    try {
      await scannerRef.current?.pause?.(false);
    } catch {
      /* ignore */
    }
    await sleep(ERROR_MIN_DISPLAY_MS);
  }, [clearProcessingTimeout, clearScanHintTimer, releaseScanProgressLock]);

  const beginProcessing = useCallback(() => {
    isProcessingScanRef.current = true;
    setScannerPhase("processing");
    setScanSearchHint(false);
    clearScanHintTimer();
    void scannerRef.current?.pause?.(false);
  }, [clearScanHintTimer]);

  const playXpRewardCinematic = useCallback(
    async (verdict: ScanSuccessVerdict & { xpSession: ActivityXPGainSession }) => {
      clearProcessingTimeout();
      isProcessingScanRef.current = true;
      scanRewardFlowRef.current = true;
      setScanSearchHint(false);
      clearScanHintTimer();
      playSigilScanLock();
      feedbackSigilAbsorption();
      setAbsorbing(true);
      if (!reduceMotion) {
        setScreenJolt(true);
        window.setTimeout(() => setScreenJolt(false), 420);
      }
      setScannerPhase("success");
      setScanRewardState("validated");
      logScanner("qr_validated_cinematic", { xp: verdict.xpSession.xpGained });
      try {
        await scannerRef.current?.pause?.(true);
      } catch {
        /* ignore */
      }
      await sleep(SCAN_VALIDATED_MS);
      setScanRewardState("transitioningToXP");
      logScanner("transitioning_to_xp", {});
      await sleep(SCAN_TRANSITION_TO_XP_MS);
      setScanRewardState("xpScreenVisible");
      await sleep(SCAN_XP_HANDOFF_MS);
      stopScanner();
      logScanner("xp_handoff", { sessionKey: verdict.xpSession.sessionKey });
      onXpHandoff?.(verdict.xpSession);
      setScanRewardState("complete");
      setAbsorbing(false);
      scanRewardFlowRef.current = false;
      scanInProgressRef.current = false;
      isProcessingScanRef.current = false;
      if (allowRepeatQrScan) {
        lastProcessedCodeRef.current = "";
      }
    },
    [allowRepeatQrScan, clearProcessingTimeout, clearScanHintTimer, onXpHandoff, reduceMotion, stopScanner],
  );

  const celebrateScanSuccess = useCallback(
    (verdict: ScanSuccessVerdict) => {
      clearProcessingTimeout();
      playSigilScanLock();
      feedbackSigilAbsorption();
      setAbsorbing(true);
      if (!reduceMotion) {
        setScreenJolt(true);
        window.setTimeout(() => setScreenJolt(false), 420);
      }
      window.setTimeout(() => setAbsorbing(false), 900);
      if (!verdict.suppressVictoryOverlay) {
        setSuccessBlessing(verdict.reward);
      } else {
        setSuccessBlessing(null);
      }
      setScannerPhase("success");
      isProcessingScanRef.current = true;
    },
    [clearProcessingTimeout, reduceMotion],
  );

  const processSecureCode = useCallback(
    async (secureCode: string) => {
      if (!onSecureCodeScanned) return;
      logRewardFlow("qr_scanned", { codeLength: secureCode.length });
      logScanner("qr_scanned", { path: "secure" });

      const timeoutPromise = new Promise<never>((_, reject) => {
        processingTimeoutRef.current = window.setTimeout(() => {
          reject(new Error("PROCESSING_TIMEOUT"));
        }, PROCESSING_TIMEOUT_MS);
      });

      try {
        const verdict = await Promise.race([onSecureCodeScanned(secureCode), timeoutPromise]);
        if (!verdict.ok) {
          logQrScanDebug("validation_failed", {
            path: "secure",
            userBanner: verdict.banner,
            failureReason: "validation_rejected",
          });
          await showDelayedError(verdict.banner);
          void resumeScanning();
          return;
        }
        logRewardFlow("validation_success", {
          xp: verdict.reward.xp,
          handoffToXpOverlay: Boolean(verdict.xpSession),
          forgeAudio: "silent_until_fill_started",
        });
        logRewardFlow("validation_ok", {
          xp: verdict.reward.xp,
          handoffToXpOverlay: Boolean(verdict.xpSession),
        });
        if (verdict.xpSession) {
          void unlockRewardAudioSilently();
          if (readMobileViewport()) void unlockMobileForgeAudio();
          await playXpRewardCinematic({ ...verdict, xpSession: verdict.xpSession });
          return;
        }
        celebrateScanSuccess(verdict);
      } catch (error) {
        logQrScanDebug("validation_failed", {
          path: "secure",
          reason: error instanceof Error ? error.message : "unknown",
        });
        await showDelayedError(qrScanBannerFromUnknownError(error));
        void resumeScanning();
      } finally {
        clearProcessingTimeout();
      }
    },
    [
      celebrateScanSuccess,
      clearProcessingTimeout,
      onSecureCodeScanned,
      playXpRewardCinematic,
      resumeScanning,
      showDelayedError,
    ],
  );

  const processLegacyPayload = useCallback(
    async (payload: CampusQuestQrActivityPayloadParsed) => {
      logRewardFlow("qr_scanned", { activityId: payload.activityId });
      beginProcessing();
      const verdict = onPayloadValidated(payload);
      if (!verdict.ok) {
        logQrScanDebug("validation_failed", {
          path: "legacy",
          activityId: payload.activityId,
          userBanner: verdict.banner,
          failureReason: "validation_rejected",
        });
        await showDelayedError(verdict.banner);
        void resumeScanning();
        return;
      }
      logRewardFlow("validation_ok", {
        xp: verdict.reward.xp,
        handoffToXpOverlay: Boolean(verdict.xpSession),
        forgeAudio: "silent_until_fill_started",
      });
      if (verdict.xpSession) {
        void unlockRewardAudioSilently();
        if (readMobileViewport()) void unlockMobileForgeAudio();
        await playXpRewardCinematic({ ...verdict, xpSession: verdict.xpSession });
        return;
      }
      celebrateScanSuccess(verdict);
    },
    [
      beginProcessing,
      celebrateScanSuccess,
      clearProcessingTimeout,
      onPayloadValidated,
      playXpRewardCinematic,
      resumeScanning,
      showDelayedError,
    ],
  );

  const handleDecodedPayload = useCallback(
    (text: string) => {
      if (scannerPhaseRef.current === "success") return;
      if (scanInProgressRef.current) {
        logQrScanDebug("scan_ignored_duplicate", { reason: "scan_in_progress_gate" });
        return;
      }
      if (isProcessingScanRef.current) return;
      if (scanRewardFlowRef.current) return;
      if (isScanRewardFlowActive(scanRewardStateRef.current)) return;

      pulseSigilProximity();
      logQrScanRawResult(text);

      const classification = classifyQrScanText(text);
      logQrScanDebug("format_detected", {
        kind: classification.kind,
        format: classification.kind === "empty" ? "empty" : classification.format,
      });

      if (classification.kind === "empty") return;

      if (classification.kind === "secure") {
        logQrScanDebug("secure_extract", {
          code: classification.code,
          activityId: classification.code,
          type: "secure_code",
        });
        if (!tryAcquireScanForCode(classification.code)) return;
        beginProcessing();
        void processSecureCode(classification.code);
        return;
      }

      const now = Date.now();
      if (now - lastInvalidAtRef.current < INVALID_QR_DEBOUNCE_MS) return;

      if (classification.kind === "legacy_parse_error") {
        logQrScanDebug("legacy_parse", {
          ok: false,
          code: classification.code,
          failureReason: classification.message,
        });
        lastInvalidAtRef.current = now;
        void (async () => {
          await showDelayedError(userMessageForParseError(classification.code, text));
          void resumeScanning();
        })();
        return;
      }

      if (classification.kind === "unrecognized") {
        logQrScanDebug("validation_failed", {
          path: "client_format",
          failureReason: "unrecognized_payload",
        });
        lastInvalidAtRef.current = now;
        void (async () => {
          await showDelayedError(QR_SCAN_USER_MESSAGES.invalidFormat);
          void resumeScanning();
        })();
        return;
      }

      logQrScanDebug("legacy_parse", {
        ok: true,
        activityId: classification.payload.activityId,
        type: classification.payload.activityId,
      });
      if (!tryAcquireScanForCode(classification.payload.activityId)) return;
      beginProcessing();
      void processLegacyPayload(classification.payload);
    },
    [
      beginProcessing,
      processLegacyPayload,
      processSecureCode,
      pulseSigilProximity,
      resumeScanning,
      showDelayedError,
      tryAcquireScanForCode,
    ],
  );

  handleDecodedRef.current = handleDecodedPayload;

  const pendingScanHandledRef = useRef<string | null>(null);
  const prefillErrorShownRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !onSecureCodeScanned) return;

    const prefill = prefillErrorBanner?.trim();
    if (prefill) {
      if (prefillErrorShownRef.current !== prefill) {
        prefillErrorShownRef.current = prefill;
        void (async () => {
          await showDelayedError(prefill);
          void resumeScanning();
        })();
      }
      return;
    }
    prefillErrorShownRef.current = null;

    if (!pendingScanCode?.trim()) return;
    const raw = pendingScanCode.trim();
    if (pendingScanHandledRef.current === raw) return;
    pendingScanHandledRef.current = raw;

    const normalized = normalizeQrScanInput(raw);
    logQrScanDebug("format_detected", {
      path: "pending_scan",
      rawPreview: raw,
      format: normalized?.format ?? "unrecognized",
      extractedCode: normalized?.code ?? null,
    });

    if (!normalized) {
      void (async () => {
        await showDelayedError(QR_SCAN_USER_MESSAGES.invalidFormat);
        void resumeScanning();
      })();
      return;
    }

    if (!tryAcquireScanForCode(normalized.code)) return;
    beginProcessing();
    void processSecureCode(normalized.code);
  }, [
    beginProcessing,
    onSecureCodeScanned,
    open,
    pendingScanCode,
    prefillErrorBanner,
    processSecureCode,
    resumeScanning,
    showDelayedError,
    tryAcquireScanForCode,
  ]);

  useEffect(() => {
    if (!open) {
      setBanner(null);
      setCameraPermissionBlocked(false);
      setSigilNear(false);
      setAbsorbing(false);
      setSuccessBlessing(null);
      setScreenJolt(false);
      setScannerPhase("idle");
      setScanSearchHint(false);
      setScanRewardState("idle");
      scanRewardFlowRef.current = false;
      releaseScanProgressLock(true);
      pendingScanHandledRef.current = null;
      clearScanHintTimer();
      clearProcessingTimeout();
    }
  }, [open, clearScanHintTimer, clearProcessingTimeout, releaseScanProgressLock]);

  useEffect(() => {
    if (!open || !mounted) return;
    setBanner(null);
    setCameraPermissionBlocked(false);
    setCamState("starting");
    setScannerPhase("idle");
    setScanSearchHint(false);
    setSuccessBlessing(null);
    setAbsorbing(false);

    let cancelled = false;

    (async () => {
      try {
        const mod = await import("qr-scanner");
        const QrScanner = mod.default;
        QrScanner.WORKER_PATH = "/qr-scanner-worker.min.js";

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
              handleDecodedRef.current(result.data);
            },
            {
              preferredCamera: "environment",
              maxScansPerSecond: MAX_SCANS_PER_SECOND,
              highlightScanRegion: false,
              highlightCodeOutline: false,
              calculateScanRegion: calculateCenterScanRegion,
              returnDetailedScanResult: true as const,
            },
          ) as ScannerApi;
          scannerRef.current = scanner;
          await scanner.start();
          await applyIdealCameraConstraints(video);
          if (!cancelled) {
            setCamState("ready");
            setScannerPhase("scanning");
            startScanHintTimer();
          }
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
      if (proximityTimerRef.current) {
        window.clearTimeout(proximityTimerRef.current);
        proximityTimerRef.current = null;
      }
    };
  }, [mounted, open, startScanHintTimer, stopScanner]);

  if (!mounted) return null;

  const phaseLabel =
    scannerPhase === "processing"
      ? "Verifying QR…"
      : scannerPhase === "success"
        ? "Check-in complete"
        : scannerPhase === "error"
          ? "Scan again when ready"
          : camState === "ready" && scannerPhase === "scanning"
            ? "Scanning for CampusQuest QR…"
            : camState === "starting"
              ? "Opening lens…"
              : null;

  const searchHelperText =
    scanSearchHint && scannerPhase === "scanning"
      ? "Still searching… center the QR code in the frame."
      : null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="cq-scanner-portal"
          className={`cq-scanner-portal fixed inset-0 z-[140] flex min-h-[100dvh] flex-col overflow-hidden bg-[#010810]/95 ${iosScanner ? "cq-scanner-portal--ios" : "backdrop-blur-xl"}`}
          data-cq-gesture-block="all"
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
              if (scanRewardFlowRef.current) return;
              releaseScanProgressLock(true);
              setSuccessBlessing(null);
              setAbsorbing(false);
              setScanRewardState("idle");
              onClose();
            }}
            frameSlot={
              <div className="relative w-full">
                <MagicalScannerFrame
                  detecting={
                    sigilNear ||
                    scannerPhase === "processing" ||
                    scanRewardState === "validated"
                  }
                  absorbing={absorbing}
                  camBusy={camState === "starting"}
                  cameraActive={camState === "ready"}
                  busyOverlay={
                    camState === "starting" ? (
                      <div className="flex h-full flex-col items-center justify-center gap-2 bg-[#020b1f]/40 text-[13px] text-cyan-50/90 backdrop-blur-[1px]">
                        <span
                          className="cq-qr-spinner h-9 w-9 rounded-full border-2 border-cyan-900/55 border-t-cyan-200"
                          aria-hidden
                        />
                        <span>Opening camera…</span>
                      </div>
                    ) : undefined
                  }
                >
                  <ScannerCameraFeed ref={videoRef} />
                </MagicalScannerFrame>
                <ScanValidatedCinematic
                  visible={scanRewardState === "validated" || scanRewardState === "transitioningToXP"}
                  phase={scanRewardState === "transitioningToXP" ? "transitioningToXP" : "validated"}
                />
              </div>
            }
            bannerSlot={
              <>
                {phaseLabel ? (
                  <p className="w-full max-w-md text-center text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-200/70">
                    {phaseLabel}
                  </p>
                ) : null}
                {searchHelperText ? (
                  <p className="w-full max-w-md text-center text-sm leading-relaxed text-cyan-100/85">
                    {searchHelperText}
                  </p>
                ) : null}
                {scanSearchHint && scannerPhase === "scanning" ? (
                  <p className="w-full max-w-md text-center text-xs text-cyan-200/65">
                    Move closer and center the QR code.
                  </p>
                ) : null}
                {cameraPermissionBlocked && scannerPhase !== "success" ? (
                  <CameraPermissionSealsAlert />
                ) : banner && scannerPhase === "error" ? (
                  <div
                    role="alert"
                    className="pointer-events-auto w-full max-w-md space-y-3 rounded-2xl border border-rose-400/40 bg-[#1f050d]/75 px-4 py-3 text-sm leading-relaxed text-rose-50/96 shadow-[0_0_36px_-8px_rgba(244,63,94,0.45)] backdrop-blur-sm"
                  >
                    <p>{banner}</p>
                    <button
                      type="button"
                      onClick={resetForAnotherScan}
                      className="w-full rounded-xl border border-cyan-400/40 bg-cyan-500/15 px-4 py-2.5 text-sm font-semibold text-cyan-50 hover:bg-cyan-500/25"
                    >
                      Scan Again
                    </button>
                  </div>
                ) : (banner || camState === "denied") && scannerPhase !== "success" ? (
                  <div
                    role="alert"
                    className="w-full max-w-md whitespace-pre-line rounded-2xl border border-rose-400/40 bg-[#1f050d]/80 px-4 py-3 text-sm leading-relaxed text-rose-50/96 shadow-[0_0_36px_-8px_rgba(244,63,94,0.45)] backdrop-blur-sm"
                  >
                    {banner ?? "CQ Scanner halted — the lens may still be sealed in system settings."}
                  </div>
                ) : null}
                {scannerPhase === "success" && scanRewardState === "complete" && !successBlessing ? (
                  <div className="pointer-events-auto flex w-full max-w-md flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 rounded-xl border border-uri-keaney/45 bg-uri-keaney/20 px-4 py-2.5 text-sm font-semibold text-cyan-50 hover:bg-uri-keaney/30"
                    >
                      Back to dashboard
                    </button>
                    <button
                      type="button"
                      onClick={resetForAnotherScan}
                      className="flex-1 rounded-xl border border-cyan-400/40 bg-cyan-500/15 px-4 py-2.5 text-sm font-semibold text-cyan-50 hover:bg-cyan-500/25"
                    >
                      Scan Again
                    </button>
                  </div>
                ) : null}
              </>
            }
          />

          <ScanSuccessOverlay reward={successBlessing} />
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
