"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GroupedMapLocation } from "@/lib/mapLocationGroups";
import {
  DISCOVERY_BANNER_MS,
  DISCOVERY_COUNTDOWN_TICK_MS,
  DISCOVERY_NEARBY_RADIUS_M,
  DISCOVERY_SPOTLIGHT_MS,
  collectDiscoveryOpportunities,
  countNearbyOpportunities,
  formatOpportunitiesBannerCopy,
  formatWalkingAwayLabel,
  refreshSpotlightLabel,
  selectLiveEventSpotlight,
  selectNearestOpportunity,
  type DiscoveryLandmarkLike,
  type DiscoveryOpportunity,
} from "@/lib/realm/realmMapDiscovery";

export type DiscoveryHighlight = {
  markerId: string;
  label: string;
  mode: "nearest" | "spotlight";
};

export type RealmMapDiscoveryState = {
  /** True after first-open camera has resolved (user or campus fallback). */
  cameraReady: boolean;
  nearest: DiscoveryHighlight | null;
  spotlight: DiscoveryHighlight | null;
  bannerCopy: string | null;
  bannerVisible: boolean;
  dismissBanner: () => void;
  /** Call once when first-open camera resolves. */
  onCameraResolved: (center: { lat: number; lng: number }) => void;
  /** Hide temporary discovery labels while a sheet is open. */
  labelsHidden: boolean;
};

/**
 * Once-per-map-session discovery orchestration.
 * Does not re-run on filter changes, camera pans, or unrelated React updates.
 */
export function useRealmMapDiscovery(args: {
  enabled: boolean;
  markersReady: boolean;
  sheetOpen: boolean;
  landmarks: DiscoveryLandmarkLike[];
  geoPositions: Record<string, { lat: number; lng: number }>;
  supplementaryPins: GroupedMapLocation[];
  userPos: { lat: number; lng: number } | null;
  knownRouteDurationSeconds?: number | null;
}): RealmMapDiscoveryState {
  const [cameraReady, setCameraReady] = useState(false);
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [nearest, setNearest] = useState<DiscoveryHighlight | null>(null);
  const [spotlight, setSpotlight] = useState<DiscoveryHighlight | null>(null);
  const [bannerCopy, setBannerCopy] = useState<string | null>(null);
  const [bannerVisible, setBannerVisible] = useState(false);

  const sessionRanRef = useRef(false);
  const mountedRef = useRef(true);
  const spotlightEventRef = useRef<DiscoveryOpportunity | null>(null);
  const timersRef = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) {
      window.clearTimeout(timer);
      window.clearInterval(timer);
    }
    timersRef.current = [];
  }, []);

  const pushTimer = useCallback((timer: number) => {
    timersRef.current.push(timer);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimers();
    };
  }, [clearTimers]);

  // Reset session when leaving the map so the next open can re-run discovery.
  useEffect(() => {
    if (args.enabled) return undefined;
    sessionRanRef.current = false;
    spotlightEventRef.current = null;
    clearTimers();
    setCameraReady(false);
    setOrigin(null);
    setNearest(null);
    setSpotlight(null);
    setBannerCopy(null);
    setBannerVisible(false);
    return undefined;
  }, [args.enabled, clearTimers]);

  const onCameraResolved = useCallback((center: { lat: number; lng: number }) => {
    if (!mountedRef.current) return;
    setOrigin(center);
    setCameraReady(true);
  }, []);

  const dismissBanner = useCallback(() => {
    setBannerVisible(false);
  }, []);

  const opportunities = useMemo(
    () =>
      collectDiscoveryOpportunities({
        landmarks: args.landmarks,
        geoPositions: args.geoPositions,
        supplementaryPins: args.supplementaryPins,
      }),
    [args.landmarks, args.geoPositions, args.supplementaryPins],
  );

  // Run the highlight / banner / spotlight sequence once per map session after
  // camera + markers are ready. Intentionally ignores filter / pan updates.
  useEffect(() => {
    if (!args.enabled || !args.markersReady || !cameraReady || !origin) return undefined;
    if (sessionRanRef.current) return undefined;
    sessionRanRef.current = true;

    const originNow = args.userPos ?? origin;
    const nearestHit = selectNearestOpportunity(opportunities, originNow);
    const nearbyCount = countNearbyOpportunities(opportunities, originNow, DISCOVERY_NEARBY_RADIUS_M);
    const live = selectLiveEventSpotlight(opportunities, originNow, new Date());

    if (nearestHit && mountedRef.current) {
      setNearest({
        markerId: nearestHit.opportunity.markerId,
        label: formatWalkingAwayLabel(nearestHit.distanceM, args.knownRouteDurationSeconds),
        mode: "nearest",
      });
    }

    const copy = formatOpportunitiesBannerCopy(nearbyCount);
    setBannerCopy(copy);
    // Banner after a short beat so markers can paint first.
    pushTimer(
      window.setTimeout(() => {
        if (!mountedRef.current) return;
        setBannerVisible(true);
        pushTimer(
          window.setTimeout(() => {
            if (mountedRef.current) setBannerVisible(false);
          }, DISCOVERY_BANNER_MS),
        );
      }, 500),
    );

    // Spotlight after marker reveal (~ after banner starts).
    if (live) {
      spotlightEventRef.current = live.opportunity;
      pushTimer(
        window.setTimeout(() => {
          if (!mountedRef.current) return;
          setSpotlight({
            markerId: live.opportunity.markerId,
            label: live.label,
            mode: "spotlight",
          });

          const tick = window.setInterval(() => {
            if (!mountedRef.current || !spotlightEventRef.current?.event) {
              window.clearInterval(tick);
              return;
            }
            const nextLabel = refreshSpotlightLabel(spotlightEventRef.current.event, new Date());
            if (!nextLabel) {
              setSpotlight(null);
              spotlightEventRef.current = null;
              window.clearInterval(tick);
              return;
            }
            setSpotlight((prev) => (prev ? { ...prev, label: nextLabel } : prev));
          }, DISCOVERY_COUNTDOWN_TICK_MS);
          pushTimer(tick);

          pushTimer(
            window.setTimeout(() => {
              if (!mountedRef.current) return;
              setSpotlight(null);
              spotlightEventRef.current = null;
            }, DISCOVERY_SPOTLIGHT_MS),
          );
        }, 1200),
      );
    }

    // Clear nearest gold highlight after spotlight window so it doesn't linger forever.
    pushTimer(
      window.setTimeout(() => {
        if (mountedRef.current) setNearest(null);
      }, DISCOVERY_BANNER_MS + DISCOVERY_SPOTLIGHT_MS + 800),
    );

    return undefined;
  }, [
    args.enabled,
    args.markersReady,
    args.userPos,
    args.knownRouteDurationSeconds,
    cameraReady,
    origin,
    opportunities,
    pushTimer,
  ]);

  return {
    cameraReady,
    nearest,
    spotlight,
    bannerCopy,
    bannerVisible: bannerVisible && !args.sheetOpen,
    dismissBanner,
    onCameraResolved,
    labelsHidden: args.sheetOpen,
  };
}

export type { DiscoveryLandmarkLike };
