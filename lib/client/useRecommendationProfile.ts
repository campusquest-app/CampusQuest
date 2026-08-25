"use client";

import { useEffect, useMemo, useState } from "react";
import {
  combineRecommendationProfile,
  fetchRecommendationProfile,
  seedRecommendationProfile,
} from "@/lib/client/recommendationProfileClient";
import type { UserRecommendationProfile } from "@/lib/recommendations";
import { profileFromPersonalization } from "@/lib/recommendations";

export function useRecommendationProfile(
  personalization?: {
    schoolName?: string | null;
    institutionId?: string | null;
    interests?: string[] | null;
    communities?: string[] | null;
    studentStatus?: string | null;
    classYear?: number | null;
  } | null,
): UserRecommendationProfile {
  const seed = useMemo(() => seedRecommendationProfile(personalization), [personalization]);
  const [loaded, setLoaded] = useState<UserRecommendationProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchRecommendationProfile().then((profile) => {
      if (!cancelled) setLoaded(profile);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => combineRecommendationProfile(seed, loaded), [seed, loaded]);
}

export function recommendationProfileFromSeed(
  personalization?: Parameters<typeof profileFromPersonalization>[0],
): UserRecommendationProfile {
  return profileFromPersonalization(personalization);
}
