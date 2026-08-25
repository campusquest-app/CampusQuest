"use client";

import { fetchAuthed } from "@/lib/client/dashboardApi";
import {
  mergeRecommendationProfiles,
  profileFromPersonalization,
  type UserRecommendationProfile,
} from "@/lib/recommendations";

type CacheEntry = {
  at: number;
  profile: UserRecommendationProfile;
};

const CACHE_TTL_MS = 120_000;
let cache: CacheEntry | null = null;
let inFlight: Promise<UserRecommendationProfile | null> | null = null;

export async function fetchRecommendationProfile(): Promise<UserRecommendationProfile | null> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.profile;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const data = await fetchAuthed<{ profile: UserRecommendationProfile }>("/api/me/recommendation-profile");
      const profile = data.profile;
      if (profile) cache = { at: Date.now(), profile };
      return profile ?? null;
    } catch {
      return cache?.profile ?? null;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export function seedRecommendationProfile(
  personalization?: Parameters<typeof profileFromPersonalization>[0],
  includeDebug = false,
): UserRecommendationProfile {
  return profileFromPersonalization({ ...personalization, includeDebug });
}

export function combineRecommendationProfile(
  seed: UserRecommendationProfile,
  loaded: UserRecommendationProfile | null,
): UserRecommendationProfile {
  if (!loaded) return seed;
  return mergeRecommendationProfiles(seed, loaded);
}

export function clearRecommendationProfileCache() {
  cache = null;
}
