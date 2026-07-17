"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type UserGeolocationFix = {
  lat: number;
  lng: number;
  accuracy: number | null;
  heading: number | null;
  timestamp: number;
};

export type UseUserGeolocationOptions = {
  /** When true, watchPosition keeps the blue dot updated and optionally follows the map. */
  followMode?: boolean;
  onFollowPan?: (pos: { lat: number; lng: number }) => void;
  onDenied?: (message: string) => void;
};

/**
 * Single geolocation watcher for the Realm map. One watchPosition per map
 * session — markers and routing read from the same fix.
 */
export function useUserGeolocation(options?: UseUserGeolocationOptions) {
  const [fix, setFix] = useState<UserGeolocationFix | null>(null);
  const [followMode, setFollowMode] = useState(options?.followMode ?? false);
  const [locating, setLocating] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  const applyPosition = useCallback(
    (position: GeolocationPosition) => {
      const next: UserGeolocationFix = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy ?? null,
        heading: position.coords.heading ?? null,
        timestamp: position.timestamp,
      };
      setFix(next);
      if (followMode) {
        options?.onFollowPan?.({ lat: next.lat, lng: next.lng });
      }
    },
    [followMode, options],
  );

  const stopWatch = useCallback(() => {
    if (watchIdRef.current != null && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const locateOnce = useCallback((
    onPosition?: (pos: { lat: number; lng: number }) => void,
    opts?: { silent?: boolean },
  ) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      if (!opts?.silent) options?.onDenied?.("Location is not supported on this device.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyPosition(pos);
        onPosition?.({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setLocating(false);
        if (!opts?.silent) {
          options?.onDenied?.("Location permission was denied — you can still explore the map.");
        }
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }, [applyPosition, options]);

  const startFollow = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      options?.onDenied?.("Location is not supported on this device.");
      return;
    }
    setFollowMode(true);
    setLocating(true);
    stopWatch();
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        applyPosition(pos);
        setLocating(false);
      },
      () => {
        setLocating(false);
        setFollowMode(false);
        options?.onDenied?.("Location permission was denied — you can still explore the map.");
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 },
    );
  }, [applyPosition, options, stopWatch]);

  const stopFollow = useCallback(() => {
    setFollowMode(false);
    stopWatch();
  }, [stopWatch]);

  const toggleFollow = useCallback(() => {
    if (followMode) stopFollow();
    else startFollow();
  }, [followMode, startFollow, stopFollow]);

  useEffect(() => () => stopWatch(), [stopWatch]);

  return {
    fix,
    userPos: fix ? { lat: fix.lat, lng: fix.lng } : null,
    locating,
    followMode,
    locateOnce,
    startFollow,
    stopFollow,
    toggleFollow,
    setFix: (pos: { lat: number; lng: number } | null) => {
      if (!pos) {
        setFix(null);
        return;
      }
      setFix((prev) => ({
        lat: pos.lat,
        lng: pos.lng,
        accuracy: prev?.accuracy ?? null,
        heading: prev?.heading ?? null,
        timestamp: Date.now(),
      }));
    },
  };
}
