"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, UtensilsCrossed } from "lucide-react";
import type { RealmLocation } from "@/lib/realm/locations";
import { getRealmLocationHeroImage } from "@/lib/realm/locationHeroImages";
import { placeCardImageObjectPosition } from "@/lib/realm/placeImages";
import {
  DINING_SLOW_LOADING_HINT_MS,
  isAbortError,
  isDiningMenuEmpty,
  shouldCommitDiningResponse,
  shouldShowDiningSkeleton,
  shouldShowDiningSlowLoadingHint,
} from "@/lib/dining/diningMenuClientState";
import {
  fetchDiningMenuSession,
  getDiningMenuSessionCache,
  setDiningMenuSessionCache,
} from "@/lib/dining/diningMenuSessionCache";
import {
  buildDiningMenuPreview,
  diningHallShortDescription,
} from "@/lib/dining/diningMenuPreview";
import { uriTodayIso } from "@/lib/dining/diningTime";
import type { DiningLocationId, DiningMenuResponse } from "@/lib/dining/types";
import { resolveDiningLocationId } from "@/lib/dining/uriDiningLocations";
import { useNow } from "@/lib/client/useNow";
import {
  pickInitialSelectedMeal,
  resolveDiningServiceStatus,
  type DiningDayHours,
} from "@/lib/dining/diningServiceStatus";
import { LocationDiningMenuSection } from "./LocationDiningMenuSection";

const PREVIEW_ITEM_LIMIT = 4;

/**
 * Shared compact map card for Mainfare and Butterfield.
 * Only hall identity / media / menu data differ — structure stays identical.
 */
export function DiningHallLocationCard({
  location,
  campusQuestLocationId,
  displayName,
  showFullMenu,
  onViewFullMenu,
  onAddMemory,
}: {
  location: RealmLocation | null;
  campusQuestLocationId: string;
  displayName: string;
  showFullMenu: boolean;
  onViewFullMenu: () => void;
  onAddMemory?: () => void;
}) {
  const hallId = resolveDiningLocationId(campusQuestLocationId);
  const [today] = useState(() => uriTodayIso());
  const description = diningHallShortDescription(campusQuestLocationId);
  const heroImage = location ? getRealmLocationHeroImage(location.id) : null;
  const heroObjectPosition = location
    ? placeCardImageObjectPosition(location.id)
    : "center 35%";
  const imageKey = `${campusQuestLocationId}:${heroImage ?? ""}`;
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const showImage = Boolean(heroImage) && failedKey !== imageKey;

  const [menu, setMenu] = useState<DiningMenuResponse | null>(() =>
    hallId ? getDiningMenuSessionCache(hallId, today) : null,
  );
  const [loaded, setLoaded] = useState(() =>
    Boolean(hallId && getDiningMenuSessionCache(hallId, today)),
  );
  const [initialLoading, setInitialLoading] = useState(
    () => Boolean(hallId) && !getDiningMenuSessionCache(hallId!, today),
  );
  const [slowLoading, setSlowLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const requestSeq = useRef(0);
  const mountedRef = useRef(true);
  const now = useNow(30_000);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!hallId) {
      setMenu(null);
      setLoaded(true);
      setInitialLoading(false);
      setSlowLoading(false);
      setError(null);
      return;
    }

    const cached = getDiningMenuSessionCache(hallId, today);
    if (cached) {
      setMenu(cached);
      setLoaded(true);
      setInitialLoading(false);
      setError(null);
    } else {
      setMenu(null);
      setLoaded(false);
      setInitialLoading(true);
      setError(null);
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const seq = ++requestSeq.current;
    const activeHall: DiningLocationId = hallId;

    void (async () => {
      try {
        const data = await fetchDiningMenuSession({
          locationId: activeHall,
          isoDate: today,
          signal: controller.signal,
        });
        if (!shouldCommitDiningResponse({ requestSeq: seq, activeSeq: requestSeq.current })) {
          return;
        }
        if (!mountedRef.current) return;
        // Never accept a response for a different hall.
        if (data.location.id !== activeHall) {
          setError("Menu unavailable right now");
          setLoaded(true);
          setInitialLoading(false);
          setSlowLoading(false);
          setMenu(null);
          return;
        }
        setDiningMenuSessionCache(activeHall, today, data);
        setMenu(data);
        setLoaded(true);
        setInitialLoading(false);
        setSlowLoading(false);
        setError(null);
      } catch (err) {
        if (!shouldCommitDiningResponse({ requestSeq: seq, activeSeq: requestSeq.current })) {
          return;
        }
        if (!mountedRef.current) return;
        if (isAbortError(err)) {
          const fallback = getDiningMenuSessionCache(activeHall, today);
          if (fallback && fallback.location.id === activeHall) {
            setMenu(fallback);
            setLoaded(true);
            setInitialLoading(false);
            setSlowLoading(false);
            setError(null);
          }
          return;
        }
        const fallback = getDiningMenuSessionCache(activeHall, today);
        if (fallback && fallback.location.id === activeHall) {
          setMenu(fallback);
          setLoaded(true);
          setInitialLoading(false);
          setSlowLoading(false);
          setError(null);
          return;
        }
        setError("Menu unavailable right now");
        setLoaded(true);
        setInitialLoading(false);
        setSlowLoading(false);
        setMenu(null);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [hallId, today]);

  useEffect(() => {
    if (!initialLoading || loaded || menu) {
      setSlowLoading(false);
      return;
    }
    const timer = window.setTimeout(() => setSlowLoading(true), DINING_SLOW_LOADING_HINT_MS);
    return () => window.clearTimeout(timer);
  }, [initialLoading, loaded, menu]);

  const availableMeals = useMemo(
    () => (menu?.mealPeriods ?? []).map((meal) => meal.id),
    [menu],
  );

  const hoursDays = menu?.hours?.days as DiningDayHours[] | undefined;
  const preferredMealId = useMemo(
    () =>
      pickInitialSelectedMeal({
        availableMealIds: availableMeals,
        currentMealId: null,
        now,
      }),
    [availableMeals, now],
  );

  const serviceStatus = useMemo(
    () =>
      hallId && (menu || loaded)
        ? resolveDiningServiceStatus({
            now,
            selectedIsoDate: today,
            todayIsoDate: today,
            hoursDays,
            availableMealIds: availableMeals,
            browsingMealId: preferredMealId,
          })
        : null,
    [hallId, menu, loaded, now, today, hoursDays, availableMeals, preferredMealId],
  );

  const preview = useMemo(
    () =>
      buildDiningMenuPreview(menu, {
        preferredMealId,
        limit: PREVIEW_ITEM_LIMIT,
        now,
      }),
    [menu, preferredMealId, now],
  );

  const showSkeleton = shouldShowDiningSkeleton({ initialLoading, loaded, menu });
  const showSlowHint = shouldShowDiningSlowLoadingHint({ showSkeleton, slowLoading });
  const isEmptyDay = isDiningMenuEmpty({ loaded, menu });
  const unresolvedHall = !hallId;

  return (
    <div
      className="cq-dining-card"
      data-cq-dining-card={campusQuestLocationId}
      data-cq-dining-hall={hallId ?? "unresolved"}
      data-cq-dining-full={showFullMenu ? "1" : "0"}
    >
      <header className="cq-dining-card-hero">
        <div className="cq-dining-card-thumb" aria-hidden>
          {showImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroImage ?? undefined}
              alt=""
              className="cq-dining-card-thumb-image"
              style={{ objectPosition: heroObjectPosition }}
              onError={() => setFailedKey(imageKey)}
            />
          ) : (
            <div className="cq-dining-card-thumb-fallback">
              <UtensilsCrossed className="h-5 w-5" strokeWidth={2.2} aria-hidden />
            </div>
          )}
        </div>
        <div className="cq-dining-card-copy">
          <h2 id="realm-sheet-title" className="cq-dining-card-title">
            {displayName}
          </h2>
          <p className="cq-dining-card-desc">{description}</p>
        </div>
      </header>

      {showFullMenu && hallId ? (
        <LocationDiningMenuSection
          key={`${campusQuestLocationId}:${hallId}`}
          campusQuestLocationId={campusQuestLocationId}
        />
      ) : (
        <section className="cq-dining-card-menu" aria-label="Today's Menu">
          <div className="cq-dining-card-menu-head">
            <h3 className="cq-dining-card-menu-title">Today&apos;s Menu</h3>
            {preview ? (
              <span className="cq-dining-card-meal">{preview.mealName}</span>
            ) : serviceStatus ? (
              <span className="cq-dining-card-meal">{serviceStatus.title}</span>
            ) : null}
          </div>

          {unresolvedHall ? (
            <p className="cq-dining-card-empty">Menu unavailable for this location</p>
          ) : null}

          {!unresolvedHall && showSkeleton && !showSlowHint ? (
            <div className="cq-dining-card-skeleton" aria-busy="true">
              <div className="cq-dining-skeleton-line" />
              <div className="cq-dining-skeleton-line" />
              <div className="cq-dining-skeleton-line" />
            </div>
          ) : null}

          {!unresolvedHall && showSlowHint ? (
            <p className="cq-dining-card-empty" aria-live="polite" aria-busy="true">
              Loading today&apos;s menu…
            </p>
          ) : null}

          {!unresolvedHall && !showSkeleton && error && !menu ? (
            <p className="cq-dining-card-empty">{error}</p>
          ) : null}

          {!unresolvedHall && !showSkeleton && isEmptyDay && !error ? (
            <p className="cq-dining-card-empty">Menu unavailable for today</p>
          ) : null}

          {!unresolvedHall && !showSkeleton && preview ? (
            <ul className="cq-dining-card-items">
              {preview.items.map((item) => (
                <li key={item.id} className="cq-dining-card-item">
                  <span className="cq-dining-card-item-name">{item.name}</span>
                  <span className="cq-dining-card-item-station">{item.stationName}</span>
                </li>
              ))}
              {preview.truncated ? (
                <li className="cq-dining-card-more">
                  +{preview.totalItemCount - preview.items.length} more
                </li>
              ) : null}
            </ul>
          ) : null}

          {!unresolvedHall && !showSkeleton && menu && !preview && !error && !isEmptyDay ? (
            <p className="cq-dining-card-empty">Menu unavailable for today</p>
          ) : null}
        </section>
      )}

      <div className="cq-dining-card-actions" role="region" aria-label="Dining actions">
        {!showFullMenu ? (
          <button
            type="button"
            className="cq-dining-card-action cq-dining-card-action--menu touch-manipulation"
            onClick={onViewFullMenu}
            disabled={unresolvedHall}
          >
            <UtensilsCrossed className="cq-dining-card-action-icon h-4 w-4" strokeWidth={2.2} aria-hidden />
            <span>View Full Menu</span>
          </button>
        ) : null}
        {onAddMemory ? (
          <button
            type="button"
            className="cq-dining-card-action cq-dining-card-action--memory touch-manipulation"
            onClick={onAddMemory}
          >
            <Camera className="cq-dining-card-action-icon h-4 w-4" strokeWidth={2.2} aria-hidden />
            <span>Add Memory</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
