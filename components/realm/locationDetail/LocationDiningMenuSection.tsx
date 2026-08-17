"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchAuthed } from "@/lib/client/dashboardApi";
import type { DiningLocationId, DiningMealPeriodId, DiningMenuResponse } from "@/lib/dining/types";
import {
  formatDayChipLabel,
  mealContextLabel,
  selectDefaultMealPeriod,
  upcomingIsoDates,
  uriTodayIso,
} from "@/lib/dining/diningTime";
import { resolveDiningLocationId } from "@/lib/dining/uriDiningLocations";

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

function dietaryFilterOptions(menu: DiningMenuResponse | null): string[] {
  if (!menu) return [];
  const tags = new Set<string>();
  for (const meal of menu.mealPeriods) {
    for (const station of meal.stations) {
      for (const item of station.items) {
        for (const tag of item.dietaryTags ?? []) tags.add(tag);
      }
    }
  }
  return Array.from(tags).sort();
}

export function LocationDiningMenuSection({
  campusQuestLocationId,
}: {
  campusQuestLocationId: string;
}) {
  const defaultHall = resolveDiningLocationId(campusQuestLocationId) ?? "butterfield";
  const [hallId, setHallId] = useState<DiningLocationId>(defaultHall);
  const [today] = useState(() => uriTodayIso());
  const dayOptions = useMemo(() => upcomingIsoDates(today, 5), [today]);
  const [date, setDate] = useState(today);
  const [menu, setMenu] = useState<DiningMenuResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mealId, setMealId] = useState<DiningMealPeriodId | null>(null);
  const [dietFilter, setDietFilter] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [nutrition, setNutrition] = useState<NutritionPayload | null>(null);
  const [nutritionLoading, setNutritionLoading] = useState(false);

  const cacheRef = useRef<Map<string, DiningMenuResponse>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const requestSeq = useRef(0);
  const loadedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setHallId(resolveDiningLocationId(campusQuestLocationId) ?? "butterfield");
  }, [campusQuestLocationId]);

  const load = useCallback(
    async (opts?: { background?: boolean }) => {
      const key = `${hallId}:${date}`;
      const cached = cacheRef.current.get(key);
      const background = Boolean(opts?.background) || (cached != null && loadedKeyRef.current === key);

      if (cached && !opts?.background) {
        setMenu(cached);
        setLoaded(true);
        setInitialLoading(false);
        setError(null);
        loadedKeyRef.current = key;
      } else if (!background) {
        setInitialLoading(true);
        setLoaded(false);
        setError(null);
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const seq = ++requestSeq.current;

      try {
        const params = new URLSearchParams({ location: hallId, date });
        const data = await fetchAuthed<DiningMenuResponse>(`/api/dining/menu?${params}`, {
          signal: controller.signal,
        });
        if (seq !== requestSeq.current) return;
        cacheRef.current.set(key, data);
        setMenu(data);
        setLoaded(true);
        setInitialLoading(false);
        setError(null);
        loadedKeyRef.current = key;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (seq !== requestSeq.current) return;
        if (cached) {
          setMenu(cached);
          setLoaded(true);
          setInitialLoading(false);
          setError(null);
          return;
        }
        setError("Menu unavailable right now");
        setLoaded(true);
        setInitialLoading(false);
      }
    },
    [date, hallId],
  );

  useEffect(() => {
    void load({ background: false });
    return () => abortRef.current?.abort();
  }, [load]);

  const availableMeals = useMemo(
    () => (menu?.mealPeriods ?? []).map((m) => m.id),
    [menu],
  );

  useEffect(() => {
    if (!loaded) return;
    setMealId((current) => {
      if (current && availableMeals.includes(current)) return current;
      return selectDefaultMealPeriod(availableMeals);
    });
  }, [availableMeals, loaded]);

  const activeMeal = menu?.mealPeriods.find((m) => m.id === mealId) ?? null;
  const dietOptions = dietaryFilterOptions(menu);

  const filteredStations = useMemo(() => {
    if (!activeMeal) return [];
    return activeMeal.stations
      .map((station) => ({
        ...station,
        items: station.items.filter((item) => {
          if (!dietFilter) return true;
          return (item.dietaryTags ?? []).includes(dietFilter);
        }),
      }))
      .filter((station) => station.items.length > 0);
  }, [activeMeal, dietFilter]);

  const openItem = useCallback(async (item: MenuItem) => {
    setSelectedItem(item);
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

  const showSkeleton = initialLoading && !loaded && !menu;
  const isEmptyDay = loaded && (!menu || menu.mealPeriods.length === 0);
  const context = mealContextLabel(mealId, date === today);

  return (
    <section className="cq-loc-section cq-dining-menu" aria-label="Today's Menu">
      <div className="cq-loc-section-head">
        <h3 className="cq-loc-section-title">Today&apos;s Menu</h3>
        {menu?.stale ? (
          <span className="cq-dining-updated">Updated earlier</span>
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

      {context ? <p className="cq-dining-context">{context}</p> : null}

      {showSkeleton ? (
        <div className="cq-dining-skeleton" aria-busy="true">
          <div className="cq-dining-skeleton-line" />
          <div className="cq-dining-skeleton-line" />
          <div className="cq-dining-skeleton-block" />
        </div>
      ) : null}

      {!showSkeleton && error && !menu ? (
        <div className="cq-dining-empty">
          <p>{error}</p>
          <button type="button" className="cq-loc-section-link" onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : null}

      {!showSkeleton && isEmptyDay ? (
        <p className="cq-dining-empty">Menu not posted yet</p>
      ) : null}

      {!showSkeleton && menu && availableMeals.length > 0 ? (
        <>
          <div className="cq-dining-meal-tabs" role="tablist" aria-label="Meal period">
            {menu.mealPeriods.map((meal) => (
              <button
                key={meal.id}
                type="button"
                role="tab"
                aria-selected={mealId === meal.id}
                className={`cq-dining-meal-tab${mealId === meal.id ? " is-active" : ""}`}
                onClick={() => setMealId(meal.id)}
              >
                {meal.name}
              </button>
            ))}
          </div>

          {dietOptions.length > 0 ? (
            <div className="cq-dining-diet-rail" aria-label="Dietary filter">
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
          ) : null}

          {filteredStations.length === 0 ? (
            <p className="cq-dining-empty">Menu not posted yet</p>
          ) : (
            <div className="cq-dining-stations">
              {filteredStations.map((station) => (
                <div key={station.id} className="cq-dining-station">
                  <h4 className="cq-dining-station-title">{station.name}</h4>
                  <ul className="cq-dining-item-list">
                    {station.items.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className="cq-dining-item"
                          onClick={() => void openItem(item)}
                        >
                          <span className="cq-dining-item-name">{item.name}</span>
                          {(item.dietaryTags?.length || item.allergens?.length) ? (
                            <span className="cq-dining-item-tags">
                              {[...(item.dietaryTags ?? []), ...(item.allergens ?? [])]
                                .slice(0, 3)
                                .join(" · ")}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
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
            {selectedItem.allergens?.length ? (
              <p className="cq-dining-detail-block">
                <strong>Contains</strong>
                <br />
                {selectedItem.allergens.join(", ")}
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
