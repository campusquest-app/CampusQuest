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
let generation = 0;

export async function fetchRecommendationProfile(options?: {
  force?: boolean;
}): Promise<UserRecommendationProfile | null> {
  if (options?.force) {
    cache = null;
    generation += 1;
  }
  if (!options?.force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.profile;
  if (!options?.force && inFlight) return inFlight;
  const requestGeneration = generation;
  const flight: { current: Promise<UserRecommendationProfile | null> | null } = { current: null };
  flight.current = (async () => {
    try {
      const data = await fetchAuthed<{ profile: UserRecommendationProfile }>("/api/me/recommendation-profile");
      const profile = data.profile;
      if (profile && requestGeneration === generation) cache = { at: Date.now(), profile };
      return profile ?? null;
    } catch {
      return requestGeneration === generation ? (cache?.profile ?? null) : null;
    } finally {
      if (inFlight === flight.current) inFlight = null;
    }
  })();
  inFlight = flight.current;
  return flight.current;
}

export function seedRecommendationProfile(
  personalization?: Parameters<typeof profileFromPersonalization>[0],
): UserRecommendationProfile {
  // Client seeds never enable score-breakdown debug — that metadata is not for UI.
  return profileFromPersonalization({ ...personalization, includeDebug: false });
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
  generation += 1;
}
