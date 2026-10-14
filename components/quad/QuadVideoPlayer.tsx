"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { formatVideoDuration } from "@/lib/quadVideo";
import {
  getQuadFeedUnmuted,
  setQuadFeedUnmuted,
  subscribeQuadFeedMute,
} from "@/lib/client/quadFeedMuteStore";
import { setVideoElementMuted, shouldShowVideoMuteControl, unmuteVideoElement } from "@/lib/client/quadVideoPlayback";
import { sniffVideoHasAudioFromUrl } from "@/lib/videoContainerAudio";

let activePlayerId: string | null = null;
const playerRegistry = new Map<string, HTMLVideoElement>();
const activeListeners = new Set<() => void>();

function claimPlayback(id: string) {
  activePlayerId = id;
  for (const [otherId, other] of Array.from(playerRegistry)) {
    if (otherId === id) continue;
    try {
      other.pause();
    } catch {
      /* ignore */
    }
    setVideoElementMuted(other, true);
  }
  for (const listener of Array.from(activeListeners)) listener();
}

export function QuadVideoPlayer({
  playerId,
  src,
  poster,
  durationSeconds,
  autoplayWhenVisible = true,
  showMuteControl = true,
  hasAudio,
  className = "",
  onError,
}: {
  playerId: string;
  src: string;
  poster?: string | null;
  durationSeconds?: number | null;
  autoplayWhenVisible?: boolean;
  /** When false, hide speaker control (caller already knows this video is silent). */
  showMuteControl?: boolean;
  /**
   * Stored hint. `false` is not trusted on its own — older uploads were marked
   * silent because the browser could not see the audio track at metadata time.
   */
  hasAudio?: boolean | null;
  className?: string;
  onError?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [confirmedSilent, setConfirmedSilent] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(durationSeconds ?? 0);
  const [loading, setLoading] = useState(true);

  useEffect(() => subscribeQuadFeedMute(() => {
    const el = videoRef.current;
    if (!el) return;
    if (!getQuadFeedUnmuted() || activePlayerId !== playerId) {
      setVideoElementMuted(el, true);
      setSoundOn(false);
    }
  }), [playerId]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    playerRegistry.set(playerId, el);
    el.setAttribute("playsinline", "true");
    el.setAttribute("webkit-playsinline", "true");
    return () => {
      try {
        el.pause();
      } catch {
        /* ignore */
      }
      setVideoElementMuted(el, true);
      playerRegistry.delete(playerId);
      if (activePlayerId === playerId) activePlayerId = null;
    };
  }, [playerId]);

  useEffect(() => {
    const sync = () => {
      if (activePlayerId !== playerId) setSoundOn(false);
    };
    activeListeners.add(sync);
    return () => {
      activeListeners.delete(sync);
    };
  }, [playerId]);

  useEffect(() => {
    if (!showMuteControl || hasAudio === true) {
      setConfirmedSilent(false);
      return;
    }
    setConfirmedSilent(false);
    let cancelled = false;
    void sniffVideoHasAudioFromUrl(src).then((result) => {
      if (!cancelled) setConfirmedSilent(!shouldShowVideoMuteControl(result));
    });
    return () => {
      cancelled = true;
    };
  }, [hasAudio, showMuteControl, src]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (!autoplayWhenVisible) {
      el.pause();
      setVideoElementMuted(el, true);
      setSoundOn(false);
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
          if (!getQuadFeedUnmuted()) {
            setVideoElementMuted(el, true);
            setSoundOn(false);
            void el.play().catch(() => undefined);
            return;
          }
          void unmuteVideoElement(el).then((ok) => {
            if (ok) {
              setSoundOn(true);
              return;
            }
            setVideoElementMuted(el, true);
            setSoundOn(false);
            void el.play().catch(() => undefined);
          });
        } else {
          el.pause();
          setVideoElementMuted(el, true);
          setSoundOn(false);
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [autoplayWhenVisible, playerId, src]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") videoRef.current?.pause();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  function togglePlay(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      claimPlayback(playerId);
      if (getQuadFeedUnmuted()) {
        void unmuteVideoElement(el).then((ok) => setSoundOn(ok));
      } else {
        setVideoElementMuted(el, true);
        void el.play().catch(() => undefined);
      }
    } else {
      el.pause();
    }
  }

  function toggleMute(e: React.MouseEvent | React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const el = videoRef.current;
    if (!el) return;
    if (soundOn) {
      setVideoElementMuted(el, true);
      setSoundOn(false);
      setQuadFeedUnmuted(false);
      return;
    }
    const time = el.currentTime;
    claimPlayback(playerId);
    void unmuteVideoElement(el).then((ok) => {
      if (!ok) {
        setVideoElementMuted(el, true);
        setSoundOn(false);
        return;
      }
      if (Number.isFinite(time) && Math.abs(el.currentTime - time) > 0.35) {
        try {
          el.currentTime = time;
        } catch {
          /* keep playing from the browser's position */
        }
      }
      setSoundOn(true);
      setQuadFeedUnmuted(true);
    });
  }

  function stopControlPointer(e: React.PointerEvent) {
    e.stopPropagation();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === " " || e.key === "k" || e.key === "K") {
      e.preventDefault();
      togglePlay(e as unknown as React.MouseEvent);
    } else if ((e.key === "m" || e.key === "M") && showMuteControl && !confirmedSilent) {
      e.preventDefault();
      toggleMute(e as unknown as React.MouseEvent);
    } else if (e.key === "f" || e.key === "F") {
      e.preventDefault();
    }
  }

  const muteVisible = showMuteControl && !confirmedSilent;

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
        muted={!soundOn}
        controls={false}
        disablePictureInPicture
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

      <div className="cq-quad-video-controls">
        <button
          type="button"
          data-cq-video-control="play"
          onPointerDown={stopControlPointer}
          onClick={togglePlay}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white"
          aria-label={playing ? "Pause video" : "Play video"}
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>

        {muteVisible ? (
          <button
            type="button"
            data-cq-video-control="mute"
            onPointerDown={stopControlPointer}
            onClick={toggleMute}
            className="cq-quad-video-sound"
            aria-pressed={soundOn}
            aria-label={soundOn ? "Mute video" : "Unmute video"}
          >
            {soundOn ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />}
          </button>
        ) : null}
      </div>

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
