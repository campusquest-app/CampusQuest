"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  dmPermissionDeniedMessage,
  isPermissionDeniedError,
  pickVoiceRecorderMimeType,
  requestMicrophoneStream,
} from "@/lib/client/dmMediaPermissions";

export type DmVoiceRecordingState = "idle" | "recording" | "cancel_armed";

export type DmVoiceRecordingResult = {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  previewUrl: string;
};

const MIN_DURATION_MS = 600;
const MAX_DURATION_MS = 120_000;
const CANCEL_DRAG_PX = 72;

function formatRecordingTimer(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function useDmVoiceRecorder(args: {
  disabled?: boolean;
  onRecorded: (result: DmVoiceRecordingResult) => void;
  onError: (message: string) => void;
}) {
  const { disabled = false, onRecorded, onError } = args;
  const [state, setState] = useState<DmVoiceRecordingState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startRef = useRef(0);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const cancelArmedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const maxTimerRef = useRef<number | null>(null);
  const finishingRef = useRef(false);
  const recordingRef = useRef(false);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const clearTimers = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (maxTimerRef.current !== null) {
      window.clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    cleanupStream();
    pointerStartRef.current = null;
    cancelArmedRef.current = false;
    finishingRef.current = false;
    recordingRef.current = false;
    setState("idle");
    setElapsedMs(0);
  }, [clearTimers, cleanupStream]);

  useEffect(() => () => reset(), [reset]);

  const finishRecording = useCallback(
    async (cancelled: boolean) => {
      if (finishingRef.current || !recordingRef.current) return;
      finishingRef.current = true;
      clearTimers();

      const recorder = recorderRef.current;
      const stream = streamRef.current;
      const startedAt = startRef.current;
      const shouldCancel = cancelled || cancelArmedRef.current;

      if (!recorder || recorder.state === "inactive") {
        reset();
        return;
      }

      const resultPromise = new Promise<DmVoiceRecordingResult | null>((resolve) => {
        recorder.onstop = () => {
          const durationMs = Math.max(0, Date.now() - startedAt);
          const mimeType = recorder.mimeType || pickVoiceRecorderMimeType();
          const blob = new Blob(chunksRef.current, { type: mimeType });
          cleanupStream();

          if (shouldCancel || durationMs < MIN_DURATION_MS || blob.size === 0) {
            resolve(null);
            return;
          }

          const previewUrl = URL.createObjectURL(blob);
          resolve({ blob, mimeType, durationMs, previewUrl });
        };
      });

      try {
        recorder.stop();
      } catch {
        reset();
        return;
      }

      stream?.getTracks().forEach((track) => track.stop());

      const result = await resultPromise;
      reset();
      if (result) onRecorded(result);
    },
    [cleanupStream, clearTimers, onRecorded, reset],
  );

  const startRecording = useCallback(
    async (clientX: number, clientY: number) => {
      if (disabled || recordingRef.current || finishingRef.current) return;

      try {
        const stream = await requestMicrophoneStream();
        const mimeType = pickVoiceRecorderMimeType();
        const recorder = new MediaRecorder(stream, { mimeType });
        chunksRef.current = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        };

        streamRef.current = stream;
        recorderRef.current = recorder;
        pointerStartRef.current = { x: clientX, y: clientY };
        cancelArmedRef.current = false;
        recordingRef.current = true;
        startRef.current = Date.now();
        setElapsedMs(0);
        setState("recording");

        recorder.start(250);
        timerRef.current = window.setInterval(() => {
          setElapsedMs(Date.now() - startRef.current);
        }, 200);
        maxTimerRef.current = window.setTimeout(() => {
          void finishRecording(false);
        }, MAX_DURATION_MS);
      } catch (error) {
        reset();
        if (isPermissionDeniedError(error)) {
          onError(dmPermissionDeniedMessage("microphone"));
          return;
        }
        const message = error instanceof Error ? error.message : "Could not start recording.";
        onError(message);
      }
    },
    [disabled, finishRecording, onError, reset],
  );

  const updatePointer = useCallback((clientX: number) => {
    const start = pointerStartRef.current;
    if (!start || !recordingRef.current) return;
    const dx = start.x - clientX;
    const armed = dx >= CANCEL_DRAG_PX;
    cancelArmedRef.current = armed;
    setState(armed ? "cancel_armed" : "recording");
  }, []);

  const cancelRecording = useCallback(() => {
    void finishRecording(true);
  }, [finishRecording]);

  const releaseRecording = useCallback(() => {
    void finishRecording(false);
  }, [finishRecording]);

  return {
    state,
    elapsedMs,
    timerLabel: formatRecordingTimer(elapsedMs),
    isRecording: state !== "idle",
    startRecording,
    updatePointer,
    cancelRecording,
    releaseRecording,
    reset,
  };
}
