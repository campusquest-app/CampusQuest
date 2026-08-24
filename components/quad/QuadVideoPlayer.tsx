"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { formatVideoDuration } from "@/lib/quadVideo";
import {
  getQuadFeedUnmuted,
  setQuadFeedUnmuted,
  subscribeQuadFeedMute,
} from "@/lib/client/quadFeedMuteStore";

let activePlayerId: string | null = null;
const playerRegistry = new Map<string, HTMLVideoElement>();

function claimPlayback(id: string) {
  if (activePlayerId && activePlayerId !== id) {
    const prev = playerRegistry.get(activePlayerId);
    if (prev && !prev.paused) prev.pause();
  }
  activePlayerId = id;
}

export function QuadVideoPlayer({
  playerId,
  src,
  poster,
  durationSeconds,
  autoplayWhenVisible = true,
  showMuteControl = true,
  className = "",
  onError,
}: {
  playerId: string;
  src: string;
  poster?: string | null;
  durationSeconds?: number | null;
  autoplayWhenVisible?: boolean;
  /** When false, hide speaker control (silent videos). */
  showMuteControl?: boolean;
  className?: string;
  onError?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [unmuted, setUnmuted] = useState(getQuadFeedUnmuted);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(durationSeconds ?? 0);
  const [loading, setLoading] = useState(true);

  useEffect(() => subscribeQuadFeedMute(() => setUnmuted(getQuadFeedUnmuted())), []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    playerRegistry.set(playerId, el);
    return () => {
      try {
        el.pause();
      } catch {
        /* ignore */
      }
      playerRegistry.delete(playerId);
      if (activePlayerId === playerId) activePlayerId = null;
    };
  }, [playerId]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !unmuted;
  }, [unmuted]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (!autoplayWhenVisible) {
      el.pause();
      return;
    }
    const root = rootRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.intersectionRatio >= 0.6) {
          claimPlayback(playerId);
          el.muted = !getQuadFeedUnmuted();
          void el.play().catch(() => undefined);
        } else {
          el.pause();
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [autoplayWhenVisible, playerId, src]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        videoRef.current?.pause();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  function togglePlay(e: React.MouseEvent) {
    e.stopPropagation();
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      claimPlayback(playerId);
      void el.play().catch(() => undefined);
    } else {
      el.pause();
    }
  }

  function toggleMute(e: React.MouseEvent) {
    e.stopPropagation();
    const next = !unmuted;
    setUnmuted(next);
    setQuadFeedUnmuted(next);
    const el = videoRef.current;
    if (el) {
      const t = el.currentTime;
      el.muted = !next;
      // Ensure mute toggle does not restart playback.
      if (Math.abs(el.currentTime - t) > 0.05) el.currentTime = t;
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === " " || e.key === "k" || e.key === "K") {
      e.preventDefault();
      togglePlay(e as unknown as React.MouseEvent);
    } else if (e.key === "m" || e.key === "M") {
      e.preventDefault();
      toggleMute(e as unknown as React.MouseEvent);
    } else if (e.key === "f" || e.key === "F") {
      e.preventDefault();
      const el = videoRef.current;
      if (!el) return;
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => undefined);
      } else if (el.requestFullscreen) {
        void el.requestFullscreen().catch(() => undefined);
      }
    }
  }

  return (
    <div
      ref={rootRef}
      className={`relative w-full bg-black ${className}`}
      tabIndex={0}
      onKeyDown={onKeyDown}
      data-cq-media-control="true"
      data-cq-gesture-block="swipe-tab"
      data-no-drawer-swipe="true"
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster || undefined}
        playsInline
        preload="metadata"
        muted={!unmuted}
        className="cq-quad-video-el w-full object-contain focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-uri-keaney"
        onClick={togglePlay}
        onPlay={() => {
          claimPlayback(playerId);
          setPlaying(true);
        }}
        onPause={() => setPlaying(false)}
        onWaiting={() => setLoading(true)}
        onPlaying={() => setLoading(false)}
        onLoadedData={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          onError?.();
        }}
        onTimeUpdate={() => {
          const el = videoRef.current;
          if (!el || !el.duration) return;
          setProgress(el.currentTime / el.duration);
          setDuration(el.duration);
        }}
        aria-label={playing ? "Pause video" : "Play video"}
      />

      {loading ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        </div>
      ) : null}

      {showMuteControl ? (
        <button
          type="button"
          onClick={toggleMute}
          className="absolute bottom-3 right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white"
          aria-label={unmuted ? "Mute video" : "Unmute video"}
        >
          {unmuted ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
        </button>
      ) : null}

      <button
        type="button"
        onClick={togglePlay}
        className="absolute bottom-3 left-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white"
        aria-label={playing ? "Pause video" : "Play video"}
      >
        {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
      </button>

      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-1 bg-white/20">
        <div className="h-full bg-uri-keaney" style={{ width: `${Math.min(100, progress * 100)}%` }} />
      </div>
      {duration > 0 ? (
        <span className="pointer-events-none absolute right-3 top-3 rounded bg-black/55 px-1.5 py-0.5 text-[11px] font-semibold text-white">
          {formatVideoDuration(duration)}
        </span>
      ) : null}
    </div>
  );
}
