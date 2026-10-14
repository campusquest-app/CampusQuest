"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { canSeekVideo, formatVideoDuration, seekRatioFromClientX, seekTimeByDelta, seekTimeForRatio } from "@/lib/quadVideo";
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
  const trackRef = useRef<HTMLDivElement | null>(null);
  const scrubbingRef = useRef(false);
  const holdProgressRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const intendedTimeRef = useRef<number | null>(null);
  const correctingRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [confirmedSilent, setConfirmedSilent] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(durationSeconds ?? 0);
  const [scrubTime, setScrubTime] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [canSeek, setCanSeek] = useState(false);
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

  useEffect(() => {
    return () => {
      if (document.documentElement.getAttribute("data-cq-media-gesture-lock") === "scrub") {
        document.documentElement.removeAttribute("data-cq-media-gesture-lock");
      }
    };
  }, []);

  function syncMedia(el: HTMLVideoElement) {
    const nextDuration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
    const nextCanSeek = canSeekVideo({
      duration: el.duration,
      seekableLength: el.seekable ? el.seekable.length : null,
      readyState: el.readyState,
    });
    setDuration((current) => (current === nextDuration ? current : nextDuration));
    setCanSeek((current) => (current === nextCanSeek ? current : nextCanSeek));
  }

  function publishProgress(time: number, mediaDuration: number) {
    if (!Number.isFinite(mediaDuration) || mediaDuration <= 0) return;
    setProgress(Math.min(1, Math.max(0, time / mediaDuration)));
    setScrubTime(time);
  }

  function commitSeek(time: number) {
    const el = videoRef.current;
    if (!el) return;
    const mediaDuration = Number.isFinite(el.duration) ? el.duration : duration;
    const next = seekTimeForRatio(mediaDuration > 0 ? time / mediaDuration : 0, mediaDuration);
    if (next == null) return;
    intendedTimeRef.current = next;
    holdProgressRef.current = true;
    const alreadyThere = Number.isFinite(el.currentTime) && Math.abs(el.currentTime - next) < 0.05;
    try {
      el.currentTime = next;
    } catch {
      holdProgressRef.current = false;
      intendedTimeRef.current = null;
    }
    if (alreadyThere) {
      holdProgressRef.current = false;
      intendedTimeRef.current = null;
    }
    publishProgress(next, mediaDuration);
  }

  function seekToClientX(clientX: number) {
    const el = videoRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    if (!canSeekVideo({
      duration: el.duration,
      seekableLength: el.seekable ? el.seekable.length : null,
      readyState: el.readyState,
    })) return;
    const rect = track.getBoundingClientRect();
    const ratio = seekRatioFromClientX(clientX, rect.left, rect.width);
    const time = seekTimeForRatio(ratio, el.duration);
    if (time == null) return;
    commitSeek(time);
  }

  function seekBy(delta: number) {
    const el = videoRef.current;
    if (!el) return;
    const next = seekTimeByDelta(el.currentTime, delta, el.duration);
    if (next == null) return;
    wasPlayingRef.current = !el.paused;
    commitSeek(next);
    if (wasPlayingRef.current && el.paused) void el.play().catch(() => undefined);
  }

  function setScrubGestureLock(active: boolean) {
    if (typeof document === "undefined") return;
    if (active) document.documentElement.setAttribute("data-cq-media-gesture-lock", "scrub");
    else if (document.documentElement.getAttribute("data-cq-media-gesture-lock") === "scrub") {
      document.documentElement.removeAttribute("data-cq-media-gesture-lock");
    }
  }

  function beginScrub(pointerId: number, target: HTMLElement, clientX: number) {
    const el = videoRef.current;
    if (!el || !canSeek) return;
    wasPlayingRef.current = !el.paused;
    scrubbingRef.current = true;
    setScrubbing(true);
    setScrubGestureLock(true);
    try {
      target.setPointerCapture(pointerId);
    } catch {
      /* pointer may already be released */
    }
    seekToClientX(clientX);
  }

  function endScrub(clientX: number | null) {
    if (!scrubbingRef.current) return;
    if (clientX != null) seekToClientX(clientX);
    scrubbingRef.current = false;
    setScrubbing(false);
    setScrubGestureLock(false);
    const el = videoRef.current;
    if (el && wasPlayingRef.current && el.paused) {
      void el.play().catch(() => undefined);
    }
  }

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
    } else if (canSeek && (e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === "Home" || e.key === "End")) {
      e.preventDefault();
      e.stopPropagation();
      if (!scrubbing) setScrubbing(true);
      const step = e.shiftKey ? 10 : 5;
      if (e.key === "ArrowRight") seekBy(step);
      else if (e.key === "ArrowLeft") seekBy(-step);
      else if (e.key === "Home") seekBy(-Number.MAX_SAFE_INTEGER);
      else seekBy(Number.MAX_SAFE_INTEGER);
    }
  }

  function onSeekKeyUp(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === "Home" || e.key === "End") {
      setScrubbing(false);
    }
  }

  const muteVisible = showMuteControl && !confirmedSilent;
  const shownTime = scrubbing ? scrubTime : progress * duration;

  return (
    <div
      ref={rootRef}
      className={`relative w-full bg-black ${className}`}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onKeyUp={onSeekKeyUp}
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
        onPause={() => {
          if (scrubbingRef.current) return;
          setPlaying(false);
        }}
        onWaiting={() => {
          if (scrubbingRef.current) return;
          setLoading(true);
        }}
        onPlaying={() => setLoading(false)}
        onLoadedData={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          onError?.();
        }}
        onLoadedMetadata={(event) => syncMedia(event.currentTarget)}
        onDurationChange={(event) => syncMedia(event.currentTarget)}
        onProgress={(event) => syncMedia(event.currentTarget)}
        onCanPlay={(event) => syncMedia(event.currentTarget)}
        onSeeked={() => {
          const el = videoRef.current;
          const intended = intendedTimeRef.current;
          if (!el || intended == null) {
            holdProgressRef.current = false;
            return;
          }
          if (!correctingRef.current && Math.abs(el.currentTime - intended) > 0.35) {
            correctingRef.current = true;
            try {
              el.currentTime = intended;
            } catch {
              correctingRef.current = false;
              intendedTimeRef.current = null;
              holdProgressRef.current = false;
            }
            return;
          }
          correctingRef.current = false;
          intendedTimeRef.current = null;
          holdProgressRef.current = false;
          if (el.readyState >= 2) setLoading(false);
          if (Number.isFinite(el.duration) && el.duration > 0) publishProgress(el.currentTime, el.duration);
        }}
        onTimeUpdate={() => {
          const el = videoRef.current;
          if (!el || !el.duration || scrubbingRef.current) return;
          if (!Number.isFinite(el.duration)) return;
          if (holdProgressRef.current) {
            const intended = intendedTimeRef.current;
            if (intended != null && Math.abs(el.currentTime - intended) > 0.35) return;
            holdProgressRef.current = false;
            intendedTimeRef.current = null;
          }
          publishProgress(el.currentTime, el.duration);
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

      <div
        ref={trackRef}
        className={`cq-quad-video-scrub${scrubbing ? " cq-quad-video-scrub--active" : ""}${canSeek ? "" : " cq-quad-video-scrub--disabled"}`}
        role="slider"
        tabIndex={canSeek ? 0 : -1}
        aria-label="Video timeline"
        aria-orientation="horizontal"
        aria-disabled={!canSeek}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, Math.round(duration))}
        aria-valuenow={Math.max(0, Math.round(shownTime))}
        aria-valuetext={
          duration > 0
            ? `${formatVideoDuration(shownTime)} of ${formatVideoDuration(duration)}`
            : "Video timeline unavailable"
        }
        data-cq-video-control="scrub"
        data-cq-gesture-block="all"
        data-cq-horizontal-scroll="true"
        data-no-drawer-swipe="true"
        onPointerDown={(event) => {
          if (!canSeek) return;
          if (event.pointerType === "mouse" && event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          beginScrub(event.pointerId, event.currentTarget, event.clientX);
        }}
        onPointerMove={(event) => {
          if (!scrubbingRef.current) return;
          event.preventDefault();
          event.stopPropagation();
          seekToClientX(event.clientX);
        }}
        onPointerUp={(event) => {
          event.preventDefault();
          event.stopPropagation();
          endScrub(event.clientX);
        }}
        onPointerCancel={() => endScrub(null)}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {scrubbing && duration > 0 ? (
          <span className="cq-quad-video-scrub__time">
            {formatVideoDuration(scrubTime)} / {formatVideoDuration(duration)}
          </span>
        ) : null}
        <div className="cq-quad-video-scrub__bar">
          <div className="cq-quad-video-scrub__fill" style={{ width: `${Math.min(100, progress * 100)}%` }} />
          <span
            className="cq-quad-video-scrub__handle"
            style={{ left: `clamp(6px, ${Math.min(100, progress * 100)}%, calc(100% - 6px))` }}
            aria-hidden
          />
        </div>
      </div>
      {duration > 0 && !scrubbing ? (
        <span className="pointer-events-none absolute right-3 top-3 rounded bg-black/55 px-1.5 py-0.5 text-[11px] font-semibold text-white">
          {formatVideoDuration(duration)}
        </span>
      ) : null}
    </div>
  );
}
