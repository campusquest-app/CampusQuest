"use client";

import { useEffect, type RefObject } from "react";
import { useRealmMapExploreMode } from "./useRealmMapExploreMode";

/** Must render inside `<Map>` so `useMap()` resolves. */
export function RealmMapExploreModeController({
  enabled,
  forceExpanded,
  surfaceRef,
  exploreApiRef,
}: {
  enabled: boolean;
  forceExpanded: boolean;
  surfaceRef: RefObject<HTMLElement | null>;
  exploreApiRef: { current: { expandChrome: () => void; noteMapInteraction: () => void } | null };
}) {
  const api = useRealmMapExploreMode({ enabled, forceExpanded, surfaceRef });

  useEffect(() => {
    exploreApiRef.current = api;
    return () => {
      exploreApiRef.current = null;
    };
  }, [api, exploreApiRef]);

  return null;
}
