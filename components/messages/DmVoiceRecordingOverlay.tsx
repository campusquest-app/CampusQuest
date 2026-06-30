"use client";

import { Mic, X } from "lucide-react";
import type { DmVoiceRecordingState } from "@/lib/client/useDmVoiceRecorder";

export function DmVoiceRecordingOverlay({
  state,
  timerLabel,
}: {
  state: DmVoiceRecordingState;
  timerLabel: string;
}) {
  if (state === "idle") return null;

  const cancelling = state === "cancel_armed";

  return (
    <div
      className="cq-dm-voice-recording pointer-events-none absolute inset-x-0 bottom-full z-20 mb-2 px-3"
      role="status"
      aria-live="polite"
    >
      <div
        className={`mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-lg backdrop-blur-md ${
          cancelling
            ? "border-rose-400/40 bg-rose-950/80"
            : "border-white/15 bg-[#1c1c1e]/95"
        }`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              cancelling ? "bg-rose-500/20 text-rose-300" : "cq-dm-voice-recording-pulse bg-uri-keaney/20 text-uri-keaney"
            }`}
          >
            {cancelling ? <X className="h-5 w-5" aria-hidden /> : <Mic className="h-5 w-5" aria-hidden />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">
              {cancelling ? "Release to cancel" : "Recording…"}
            </p>
            <p className="text-xs text-white/55">
              {cancelling ? "Slide back to keep recording" : "Slide left to cancel"}
            </p>
          </div>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-white">{timerLabel}</span>
      </div>
    </div>
  );
}
