"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { formatVoiceDuration } from "@/lib/client/dmMessagesClient";

export function DmAudioMessage({
  audioUrl,
  durationSeconds,
  pending = false,
  uploadProgress,
  isSent = true,
}: {
  audioUrl: string;
  durationSeconds?: number | null;
  pending?: boolean;
  uploadProgress?: number;
  isSent?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resolvedDuration, setResolvedDuration] = useState(durationSeconds ?? 0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    const onTimeUpdate = () => {
      if (!audio.duration || !Number.isFinite(audio.duration)) return;
      setProgress(audio.currentTime / audio.duration);
    };
    const onLoaded = () => {
      if (audio.duration && Number.isFinite(audio.duration)) {
        setResolvedDuration(audio.duration);
      }
    };
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
      audio.currentTime = 0;
    };
    const onPause = () => setPlaying(false);
    const onPlay = () => setPlaying(true);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
    };
  }, [audioUrl]);

  async function togglePlayback() {
    if (pending) return;
    const audio = audioRef.current;
    if (!audio) return;
    try {
      if (playing) {
        audio.pause();
      } else {
        await audio.play();
      }
    } catch {
      /* autoplay policies */
    }
  }

  const label = formatVoiceDuration(resolvedDuration || durationSeconds || 0);

  return (
    <div
      className={`cq-dm-audio-bubble inline-flex min-w-[168px] max-w-[240px] items-center gap-2.5 rounded-2xl px-3 py-2.5 ${
        isSent ? "bg-[#3797f0]/20" : "bg-white/[0.08]"
      }`}
    >
      <audio ref={audioRef} src={audioUrl} preload="metadata" className="hidden" />
      <button
        type="button"
        onClick={() => void togglePlayback()}
        disabled={pending}
        className="cq-dm-audio-play flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white disabled:opacity-50"
        aria-label={playing ? "Pause voice message" : "Play voice message"}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : playing ? (
          <Pause className="h-4 w-4" fill="currentColor" aria-hidden />
        ) : (
          <Play className="ml-0.5 h-4 w-4" fill="currentColor" aria-hidden />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          {Array.from({ length: 18 }).map((_, index) => (
            <span
              key={index}
              className={`cq-dm-audio-bar inline-block w-[3px] rounded-full bg-white/70 transition-opacity ${
                index / 18 <= progress ? "opacity-100" : "opacity-35"
              }`}
              style={{ height: `${8 + ((index * 5) % 12)}px` }}
            />
          ))}
        </div>
        <p className="mt-1 text-[11px] font-medium tabular-nums text-white/65">
          {pending && uploadProgress != null && uploadProgress > 0
            ? `Sending ${Math.round(uploadProgress)}%`
            : label}
        </p>
      </div>
    </div>
  );
}
