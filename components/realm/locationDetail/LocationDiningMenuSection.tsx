"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchAuthed } from "@/lib/client/dashboardApi";
import { useNow } from "@/lib/client/useNow";
import type { DiningLocationId, DiningMealPeriodId, DiningMenuResponse } from "@/lib/dining/types";
import {
  formatDayChipLabel,
  upcomingIsoDates,
  uriTodayIso,
} from "@/lib/dining/diningTime";
import { resolveDiningLocationId } from "@/lib/dining/uriDiningLocations";
import {
  DINING_SLOW_LOADING_HINT_MS,
  countDiningMenuItems,
  diningMenuRequestKey,
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
  buildFilteredStations,
  dietFilterOptionsForMeal,
  nextExpandedStationId,
} from "@/lib/dining/diningMenuPresentation";
import {
  pickInitialSelectedMeal,
  resolveDiningServiceStatus,
  type DiningDayHours,
} from "@/lib/dining/diningServiceStatus";

type MenuItem = DiningMenuResponse["mealPeriods"][number]["stations"][number]["items"][number];

type NutritionPayload = {
  detailOid: string;
  nutrition: {
    calories?: number;
    proteinG?: number;
    carbsG?: number;
    fatG?: number;
    servingSize?: string;
    ingredients?: string;
  };
  disclaimer: string;
};

const IS_DEV = process.env.NODE_ENV !== "production";

function logDiningDev(payload: Record<string, unknown>) {
  if (!IS_DEV) return;
  console.info("[cq:dining-menu]", payload);
}

export function LocationDiningMenuSection({
  campusQuestLocationId,
}: {
  campusQuestLocationId: string;
}) {
  const resolvedHall =
    resolveDiningLocationId(campusQuestLocationId) ?? ("butterfield" as DiningLocationId);
  const [hallId, setHallId] = useState<DiningLocationId>(resolvedHall);
  const [today] = useState(() => uriTodayIso());
  const dayOptions = useMemo(() => upcomingIsoDates(today, 5), [today]);
  const [date, setDate] = useState(today);
  const [menu, setMenu] = useState<DiningMenuResponse | null>(() =>
    getDiningMenuSessionCache(resolvedHall, today),
  );
  const [loaded, setLoaded] = useState(() => Boolean(getDiningMenuSessionCache(resolvedHall, today)));
  const [initialLoading, setInitialLoading] = useState(
    () => !getDiningMenuSessionCache(resolvedHall, today),
  );
  const [slowLoading, setSlowLoading] = useState(false);
  const [softRefreshing, setSoftRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Menu the student is browsing (independent of live service status). */
  const [selectedMeal, setSelectedMeal] = useState<DiningMealPeriodId | null>(null);
  const [dietFilter, setDietFilter] = useState<string | null>(null);
  const [expandedStationId, setExpandedStationId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [nutrition, setNutrition] = useState<NutritionPayload | null>(null);
  const [nutritionLoading, setNutritionLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const requestSeq = useRef(0);
  const loadedKeyRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const userPickedMealRef = useRef(false);
  const fetchCountRef = useRef(0);
  const hasMenuRef = useRef(Boolean(menu));

  useEffect(() => {
    hasMenuRef.current = Boolean(menu);
  }, [menu]);

  const now = useNow(30_000);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const next = resolveDiningLocationId(campusQuestLocationId) ?? "butterfield";
    setHallId((current) => (current === next ? current : next));
  }, [campusQuestLocationId]);

  useEffect(() => {
    userPickedMealRef.current = false;
    setExpandedStationId(null);
    setDietFilter(null);
  }, [date, hallId]);

  const load = useCallback(
    async (opts?: { background?: boolean }) => {
      const key = diningMenuRequestKey(hallId, date);
      const sessionCached = getDiningMenuSessionCache(hallId, date);
      const background =
        Boolean(opts?.background) || (sessionCached != null && loadedKeyRef.current === key);

      if (sessionCached && !opts?.background) {
        setMenu(sessionCached);
        setLoaded(true);
        setInitialLoading(false);
        setSlowLoading(false);
        setError(null);
        loadedKeyRef.current = key;
        setSoftRefreshing(true);
        logDiningDev({
          phase: "client_cache_hit",
          diningSourceId: hallId,
          date,
          key,
        });
      } else if (!background && !sessionCached) {
        // Only blank the UI when we have nothing to show for this target.
        setInitialLoading(true);
        setLoaded(false);
        setError(null);
        setSoftRefreshing(false);
      } else if (!sessionCached && hasMenuRef.current) {
        // Keep previously rendered menu while fetching another date/hall.
        setSoftRefreshing(true);
        setError(null);
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const seq = ++requestSeq.current;
      fetchCountRef.current += 1;

      const path = `/api/dining/menu?${new URLSearchParams({ location: hallId, date })}`;
      logDiningDev({
        phase: "start",
        campusQuestLocationId,
        diningSourceId: hallId,
        date,
        path,
        seq,
        background: background || Boolean(sessionCached),
        hadCache: Boolean(sessionCached),
      });

      try {
        const data = await fetchDiningMenuSession({
          locationId: hallId,
          isoDate: date,
          signal: controller.signal,
          forceNetwork: true,
        });
        if (!shouldCommitDiningResponse({ requestSeq: seq, activeSeq: requestSeq.current })) {
          logDiningDev({ phase: "stale-ignore", seq, activeSeq: requestSeq.current, reason: "seq" });
          return;
        }
        if (!mountedRef.current) return;

        setDiningMenuSessionCache(hallId, date, data);
        setMenu(data);
        hasMenuRef.current = true;
        setLoaded(true);
        setInitialLoading(false);
        setSlowLoading(false);
        setSoftRefreshing(false);
        setError(null);
        loadedKeyRef.current = key;
        logDiningDev({
          phase: "success",
          diningSourceId: hallId,
          date,
          path,
          seq,
          mealPeriods: data.mealPeriods.length,
          itemCount: countDiningMenuItems(data),
          stale: Boolean(data.stale),
        });
      } catch (err) {
        if (!shouldCommitDiningResponse({ requestSeq: seq, activeSeq: requestSeq.current })) {
          logDiningDev({
            phase: "stale-ignore",
            seq,
            activeSeq: requestSeq.current,
            reason: isAbortError(err) ? "abort-stale" : "error-stale",
          });
          return;
        }
        if (!mountedRef.current) return;

        const fallback = sessionCached ?? getDiningMenuSessionCache(hallId, date);
        if (isAbortError(err)) {
          if (fallback) {
            setMenu(fallback);
            hasMenuRef.current = true;
            setLoaded(true);
            setInitialLoading(false);
            setSlowLoading(false);
            setSoftRefreshing(false);
            setError(null);
          }
          logDiningDev({ phase: "aborted", diningSourceId: hallId, date, path, seq });
          return;
        }

        if (fallback) {
          setMenu(fallback);
          hasMenuRef.current = true;
          setLoaded(true);
          setInitialLoading(false);
          setSlowLoading(false);
          setSoftRefreshing(false);
          setError(null);
          logDiningDev({
            phase: "error-cache-fallback",
            diningSourceId: hallId,
            date,
            path,
            seq,
            message: err instanceof Error ? err.message : "error",
          });
          return;
        }
        setError("Menu unavailable right now");
        setLoaded(true);
        setInitialLoading(false);
        setSlowLoading(false);
        setSoftRefreshing(false);
        logDiningDev({
          phase: "error",
          diningSourceId: hallId,
          date,
          path,
          seq,
          message: err instanceof Error ? err.message : "error",
        });
      }
    },
    [campusQuestLocationId, date, hallId],
  );

  useEffect(() => {
    void load({ background: false });
    return () => {
      abortRef.current?.abort();
    };
  }, [load]);

  useEffect(() => {
    if (!initialLoading || loaded || menu) {
      setSlowLoading(false);
      return;
    }
    const timer = window.setTimeout(() => setSlowLoading(true), DINING_SLOW_LOADING_HINT_MS);
    return () => window.clearTimeout(timer);
  }, [initialLoading, loaded, menu]);
  const availableMeals = useMemo(
    () => (menu?.mealPeriods ?? []).map((m) => m.id),
    [menu],
  );
  const availableMealsKey = availableMeals.join(",");

  const hoursDays = menu?.hours?.days as DiningDayHours[] | undefined;

  const serviceStatus = useMemo(
    () =>
      resolveDiningServiceStatus({
        now,
        selectedIsoDate: date,
        todayIsoDate: today,
        hoursDays,
        availableMealIds: availableMeals,
        browsingMealId: selectedMeal,
      }),
    [now, date, today, hoursDays, availableMeals, selectedMeal],
  );

  useEffect(() => {
    if (!loaded || availableMeals.length === 0) return;

    if (userPickedMealRef.current) {
      setSelectedMeal((current) =>
        current && availableMeals.includes(current) ? current : availableMeals[0]!,
      );
      return;
    }

    setSelectedMeal(
      pickInitialSelectedMeal({
        availableMealIds: availableMeals,
        currentMealId: serviceStatus.currentMealId,
        now,
      }),
    );
    // Intentionally depend on meal availability + date/hall, not every clock tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- live status still drives first pick via currentMealId when user hasn't chosen
  }, [loaded, availableMealsKey, date, hallId, serviceStatus.currentMealId]);

  useEffect(() => {
    setExpandedStationId(null);
  }, [selectedMeal, dietFilter]);

  const activeMeal = menu?.mealPeriods.find((m) => m.id === selectedMeal) ?? null;
  const dietOptions = useMemo(() => dietFilterOptionsForMeal(activeMeal), [activeMeal]);
  const filteredStations = useMemo(
    () => buildFilteredStations({ meal: activeMeal, dietFilter }),
    [activeMeal, dietFilter],
  );

  const openItem = useCallback(async (item: {
    id: string;
    name: string;
    hasNutritionDetail: boolean;
    externalDetailOid?: string;
    labels: string[];
  }) => {
    const full: MenuItem = {
      id: item.id,
      name: item.name,
      hasNutritionDetail: item.hasNutritionDetail,
      externalDetailOid: item.externalDetailOid,
      dietaryTags: item.labels,
    };
    setSelectedItem(full);
    setNutrition(null);
    if (!item.externalDetailOid) return;
    setNutritionLoading(true);
    try {
      const params = new URLSearchParams({ detailOid: item.externalDetailOid });
      const data = await fetchAuthed<NutritionPayload>(`/api/dining/nutrition?${params}`);
      setNutrition(data);
    } catch {
      setNutrition(null);
    } finally {
      setNutritionLoading(false);
    }
  }, []);

  const showSkeleton = shouldShowDiningSkeleton({ initialLoading, loaded, menu });
  const showSlowHint = shouldShowDiningSlowLoadingHint({ showSkeleton, slowLoading });
  const isEmptyDay = isDiningMenuEmpty({ loaded, menu });

  return (
    <section
      className="cq-loc-section cq-dining-menu"
      aria-label="Today's Menu"
      data-cq-dining-fetches={fetchCountRef.current}
      data-cq-dining-soft-refresh={softRefreshing ? "1" : "0"}
    >
      <div className="cq-loc-section-head">
        <h3 className="cq-loc-section-title">Today&apos;s Menu</h3>
        {menu?.stale || softRefreshing ? (
          <span className="cq-dining-updated">
            {softRefreshing ? "Updating…" : "Updated earlier"}
          </span>
        ) : null}
      </div>

      <div className="cq-dining-day-rail" data-cq-horizontal-scroll="true">
        {dayOptions.map((iso) => (
          <button
            key={iso}
            type="button"
            className={`cq-dining-chip${date === iso ? " is-active" : ""}`}
            onClick={() => setDate(iso)}
          >
            {formatDayChipLabel(iso, today)}
          </button>
        ))}
      </div>

      {!showSkeleton && (menu || loaded) ? (
        <div className="cq-dining-status" aria-live="polite">
          <p className="cq-dining-status-title">{serviceStatus.title}</p>
          <p className="cq-dining-status-hours">{serviceStatus.subtitle}</p>
        </div>
      ) : null}

      {showSkeleton && !showSlowHint ? (
        <div className="cq-dining-skeleton" aria-busy="true">
          <div className="cq-dining-skeleton-line" />
          <div className="cq-dining-skeleton-line" />
          <div className="cq-dining-skeleton-block" />
        </div>
      ) : null}

      {showSlowHint ? (
        <p className="cq-dining-loading-hint" aria-live="polite" aria-busy="true">
          Loading today&apos;s menu…
        </p>
      ) : null}

      {!showSkeleton && error && !menu ? (
        <div className="cq-dining-empty">
          <p>{error}</p>
          <button type="button" className="cq-loc-section-link" onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : null}

      {!showSkeleton && isEmptyDay && !error ? (
        <p className="cq-dining-empty">Menu unavailable for this day</p>
      ) : null}

      {!showSkeleton && menu && availableMeals.length > 0 ? (
        <>
          <div className="cq-dining-meal-tabs" role="tablist" aria-label="Meal period">
            {menu.mealPeriods.map((meal) => (
              <button
                key={meal.id}
                type="button"
                role="tab"
                aria-selected={selectedMeal === meal.id}
                className={`cq-dining-meal-tab${selectedMeal === meal.id ? " is-active" : ""}`}
                onClick={() => {
                  userPickedMealRef.current = true;
                  setSelectedMeal(meal.id);
                }}
              >
                {meal.name}
              </button>
            ))}
          </div>

          <div className="cq-dining-diet-rail" aria-label="Dietary filter" data-cq-horizontal-scroll="true">
            <button
              type="button"
              className={`cq-dining-chip cq-dining-chip--quiet${dietFilter == null ? " is-active" : ""}`}
              onClick={() => setDietFilter(null)}
            >
              All
            </button>
            {dietOptions.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`cq-dining-chip cq-dining-chip--quiet${dietFilter === tag ? " is-active" : ""}`}
                onClick={() => setDietFilter(tag)}
              >
                {tag}
              </button>
            ))}
          </div>

          {filteredStations.length === 0 ? (
            <p className="cq-dining-empty">
              {dietFilter ? `No ${dietFilter.toLowerCase()} items for this meal` : "Menu unavailable for this day"}
            </p>
          ) : (
            <div className="cq-dining-stations">
              {filteredStations.map((station) => {
                const open = expandedStationId === station.id;
                return (
                  <div
                    key={station.id}
                    className={`cq-dining-station${open ? " is-open" : ""}`}
                  >
                    <button
                      type="button"
                      className="cq-dining-station-toggle"
                      aria-expanded={open}
                      onClick={() =>
                        setExpandedStationId((current) =>
                          nextExpandedStationId(current, station.id),
                        )
                      }
                    >
                      <span className="cq-dining-station-name">{station.name}</span>
                      <span className="cq-dining-station-meta">
                        {station.itemCount} {station.itemCount === 1 ? "item" : "items"}
                        <span className="cq-dining-station-chevron" aria-hidden>
                          ›
                        </span>
                      </span>
                    </button>
                    <div className={`cq-dining-station-panel${open ? " is-open" : ""}`}>
                      <div className="cq-dining-station-panel-inner">
                        <ul className="cq-dining-item-list">
                          {station.items.map((item) => (
                            <li key={item.id}>
                              <button
                                type="button"
                                className="cq-dining-item"
                                onClick={() => void openItem(item)}
                              >
                                <span className="cq-dining-item-name">{item.name}</span>
                                {item.labels.length > 0 ? (
                                  <span className="cq-dining-item-tags">
                                    {item.labels.join(" · ")}
                                  </span>
                                ) : null}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="cq-dining-disclaimer">{menu.disclaimer}</p>
        </>
      ) : null}

      {selectedItem ? (
        <div className="cq-dining-detail" role="dialog" aria-label={selectedItem.name}>
          <div className="cq-dining-detail-card">
            <div className="cq-dining-detail-head">
              <h4>{selectedItem.name}</h4>
              <button
                type="button"
                className="cq-loc-section-link"
                onClick={() => {
                  setSelectedItem(null);
                  setNutrition(null);
                }}
              >
                Close
              </button>
            </div>
            {selectedItem.dietaryTags?.length ? (
              <p className="cq-dining-detail-block">
                <strong>Tags</strong>
                <br />
                {selectedItem.dietaryTags.join(" · ")}
              </p>
            ) : null}
            {nutritionLoading ? <p className="cq-dining-empty">Loading nutrition…</p> : null}
            {nutrition?.nutrition ? (
              <div className="cq-dining-detail-block">
                {nutrition.nutrition.calories != null ? (
                  <p>Calories: {nutrition.nutrition.calories}</p>
                ) : null}
                {nutrition.nutrition.proteinG != null ? (
                  <p>Protein: {nutrition.nutrition.proteinG}g</p>
                ) : null}
                {nutrition.nutrition.carbsG != null ? (
                  <p>Carbs: {nutrition.nutrition.carbsG}g</p>
                ) : null}
                {nutrition.nutrition.fatG != null ? (
                  <p>Fat: {nutrition.nutrition.fatG}g</p>
                ) : null}
                {nutrition.nutrition.servingSize ? (
                  <p>Serving: {nutrition.nutrition.servingSize}</p>
                ) : null}
                {nutrition.nutrition.ingredients ? (
                  <p className="cq-dining-ingredients">{nutrition.nutrition.ingredients}</p>
                ) : null}
              </div>
            ) : null}
            <p className="cq-dining-disclaimer">
              {nutrition?.disclaimer ??
                "Nutrition details come from URI Dining / NetNutrition and may change."}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
