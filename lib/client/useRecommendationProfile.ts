"use client";

import { useEffect, useMemo, useState } from "react";
import {
  combineRecommendationProfile,
  fetchRecommendationProfile,
  seedRecommendationProfile,
} from "@/lib/client/recommendationProfileClient";
import type { UserRecommendationProfile } from "@/lib/recommendations";
import { profileFromPersonalization } from "@/lib/recommendations";
import type { StudentDiscoveryInput } from "@/lib/recommendations/discoveryProfile";

export function useRecommendationProfile(
  personalization?: StudentDiscoveryInput | null,
): UserRecommendationProfile {
  const seed = useMemo(() => seedRecommendationProfile(personalization), [personalization]);
  const interestKey = [...(personalization?.interests ?? []), ...(personalization?.communities ?? [])].join("\u0001");
  const [loaded, setLoaded] = useState<UserRecommendationProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    void fetchRecommendationProfile({ force: true }).then((profile) => {
      if (!cancelled) setLoaded(profile);
    });
    return () => {
      cancelled = true;
    };
  }, [interestKey]);

  return useMemo(() => {
    const combined = combineRecommendationProfile(seed, loaded);
    if (personalization == null) return combined;
    return {
      ...combined,
      explicitInterests: seed.explicitInterests,
      explicitCommunities: seed.explicitCommunities,
    };
  }, [loaded, personalization, seed]);
}

export function recommendationProfileFromSeed(
  personalization?: Parameters<typeof profileFromPersonalization>[0],
): UserRecommendationProfile {
  return profileFromPersonalization(personalization);
}
