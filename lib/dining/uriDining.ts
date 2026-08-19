import type {
  DiningLocationId,
  DiningMealPeriod,
  DiningMealPeriodId,
  DiningMenu,
  DiningMenuResponse,
  DiningStation,
} from "./types";
import {
  DINING_DISCLAIMER,
  getDiningLocation,
  resolveDiningLocationId,
  URI_MEAL_PERIODS,
} from "./uriDiningLocations";
import {
  createNetNutritionSession,
  fetchHoursMarkup,
  fetchItemNutritionLabel,
  NetNutritionError,
  panelHtml,
  selectChildUnit,
  selectMenu,
  selectParentUnit,
  type NetNutritionSession,
} from "./netNutritionClient";
import {
  menuDateLabelMatchesIso,
  parseChildUnits,
  parseHoursMarkup,
  parseItemPanel,
  parseMenuListPanel,
  parseNutritionLabelHtml,
} from "./netNutritionParse";
import {
  getCachedDiningMenu,
  getOrStartDiningMenuFetch,
  hasDiningMenuInflight,
  peekDiningMenuCache,
  setCachedDiningMenu,
  todayMenuTtlMs,
  upcomingMenuTtlMs,
  diningCacheKey,
} from "./diningCache";
import { toNetNutritionDateParam, uriTodayIso } from "./diningTime";

const STATION_CONCURRENCY = 3;
const IS_DEV = process.env.NODE_ENV !== "production";

function logDiningServer(payload: Record<string, unknown>) {
  if (!IS_DEV) return;
  console.info("[cq:dining-menu:server]", payload);
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => worker()),
  );
  return results;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "station";
}

function emptyMealPeriods(): DiningMealPeriod[] {
  return (Object.keys(URI_MEAL_PERIODS) as DiningMealPeriodId[]).map((id) => ({
    id,
    name: URI_MEAL_PERIODS[id].name,
    externalMealOid: URI_MEAL_PERIODS[id].externalMealOid,
    stations: [],
  }));
}

async function fetchStationMealsForDate(args: {
  session: NetNutritionSession;
  station: { unitOid: number; name: string };
  isoDate: string;
  fetchImpl: typeof fetch;
}): Promise<Partial<Record<DiningMealPeriodId, DiningStation[]>>> {
  let session = args.session;
  const selected = await selectChildUnit(session, args.station.unitOid, args.fetchImpl);
  session = selected.session;
  const menuHtml = panelHtml(selected.data, "menuPanel");
  const links = parseMenuListPanel(menuHtml).filter(
    (link) => link.mealId && menuDateLabelMatchesIso(link.dateLabel, args.isoDate),
  );

  const byMeal: Partial<Record<DiningMealPeriodId, DiningStation[]>> = {};

  for (const link of links) {
    if (!link.mealId) continue;
    const menuRes = await selectMenu(session, link.menuOid, args.fetchImpl);
    session = menuRes.session;
    const itemHtml = panelHtml(menuRes.data, "itemPanel");
    const parsed = parseItemPanel(itemHtml);
    const stations: DiningStation[] =
      parsed.courses.length > 1
        ? parsed.courses.map((course) => ({
            id: `nn-unit-${args.station.unitOid}-${slug(course.name)}`,
            name: `${args.station.name} · ${course.name}`,
            externalUnitOid: args.station.unitOid,
            items: course.items,
          }))
        : [
            {
              id: `nn-unit-${args.station.unitOid}`,
              name: args.station.name,
              externalUnitOid: args.station.unitOid,
              items: parsed.courses.flatMap((c) => c.items),
            },
          ];
    byMeal[link.mealId] = stations.filter((s) => s.items.length > 0);
  }

  return byMeal;
}

/**
 * Fetch and normalize a full dining-hall menu for one date.
 * Fresh cache → immediate. Stale cache → return immediately + background refresh.
 * Concurrent callers share one upstream NetNutrition fetch.
 */
export async function fetchUriDiningMenu(args: {
  locationId: DiningLocationId;
  isoDate: string;
  fetchImpl?: typeof fetch;
  bypassCache?: boolean;
}): Promise<DiningMenu> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const today = uriTodayIso();
  const ttl = args.isoDate === today ? todayMenuTtlMs() : upcomingMenuTtlMs();
  const key = diningCacheKey(args.locationId, args.isoDate);
  const totalStarted = Date.now();

  if (!args.bypassCache) {
    const peek = peekDiningMenuCache(args.locationId, args.isoDate);
    if (peek?.fresh) {
      logDiningServer({
        phase: "cache_hit",
        key,
        ageMs: peek.ageMs,
        totalMs: Date.now() - totalStarted,
      });
      return { ...peek.menu, stale: false, source: "cache" };
    }

    if (peek && !peek.fresh) {
      logDiningServer({
        phase: "stale_cache_hit",
        key,
        ageMs: peek.ageMs,
        totalMs: Date.now() - totalStarted,
      });
      // Stale-while-revalidate: never block the user on NetNutrition when we have data.
      if (!hasDiningMenuInflight(key)) {
        void getOrStartDiningMenuFetch(key, () =>
          fetchUriDiningMenuUpstream({
            locationId: args.locationId,
            isoDate: args.isoDate,
            fetchImpl,
            ttl,
            key,
          }),
        ).catch((error) => {
          logDiningServer({
            phase: "background_refresh_failed",
            key,
            message: error instanceof Error ? error.message : "error",
          });
        });
      }
      return { ...peek.menu, stale: true, source: "cache" };
    }
  }

  logDiningServer({ phase: "cache_miss", key });
  return getOrStartDiningMenuFetch(key, () =>
    fetchUriDiningMenuUpstream({
      locationId: args.locationId,
      isoDate: args.isoDate,
      fetchImpl,
      ttl,
      key,
    }),
  );
}

async function fetchUriDiningMenuUpstream(args: {
  locationId: DiningLocationId;
  isoDate: string;
  fetchImpl: typeof fetch;
  ttl: number;
  key: string;
}): Promise<DiningMenu> {
  const { locationId, isoDate, fetchImpl, ttl, key } = args;
  const location = getDiningLocation(locationId);
  const upstreamStarted = Date.now();

  try {
    let session = await createNetNutritionSession(fetchImpl);
    const parent = await selectParentUnit(session, location.externalUnitOid, fetchImpl);
    session = parent.session;
    const children = parseChildUnits(panelHtml(parent.data, "childUnitsPanel"));
    if (children.length === 0) {
      throw new NetNutritionError("No dining stations returned for location");
    }

    const mealBuckets: Record<DiningMealPeriodId, DiningStation[]> = {
      breakfast: [],
      lunch: [],
      dinner: [],
    };

    // Separate sessions per station avoid ASP.NET session races under concurrency.
    const stationMenus = await mapPool(children, STATION_CONCURRENCY, async (station) => {
      const stationSession = await createNetNutritionSession(fetchImpl);
      const parentSel = await selectParentUnit(
        stationSession,
        location.externalUnitOid,
        fetchImpl,
      );
      return fetchStationMealsForDate({
        session: parentSel.session,
        station,
        isoDate,
        fetchImpl,
      });
    });

    for (const byMeal of stationMenus) {
      for (const mealId of Object.keys(URI_MEAL_PERIODS) as DiningMealPeriodId[]) {
        const stations = byMeal[mealId];
        if (stations?.length) mealBuckets[mealId].push(...stations);
      }
    }

    let hours: DiningMenu["hours"] | undefined;
    try {
      const hoursRes = await fetchHoursMarkup(session, location.externalUnitOid, fetchImpl);
      const parsed = parseHoursMarkup(hoursRes.html);
      if (parsed.summary || parsed.days.length > 0) {
        hours = {
          summary: parsed.summary || undefined,
          days: parsed.days,
        };
      }
    } catch {
      // optional
    }

    const mealPeriods = emptyMealPeriods()
      .map((meal) => ({ ...meal, stations: mealBuckets[meal.id] }))
      .filter((meal) => meal.stations.some((s) => s.items.length > 0));

    const menu: DiningMenu = {
      location,
      date: isoDate,
      mealPeriods,
      hours,
      fetchedAt: new Date().toISOString(),
      source: "netnutrition",
    };

    setCachedDiningMenu(menu, ttl);
    logDiningServer({
      phase: "upstream_ok",
      key,
      upstreamMs: Date.now() - upstreamStarted,
      mealPeriods: mealPeriods.length,
    });
    return menu;
  } catch (error) {
    const stale = getCachedDiningMenu(locationId, isoDate);
    logDiningServer({
      phase: "upstream_failed",
      key,
      upstreamMs: Date.now() - upstreamStarted,
      fallback: Boolean(stale),
      message: error instanceof Error ? error.message : "error",
    });
    if (stale) return { ...stale, stale: true, source: "cache" };
    throw error;
  }
}

export function toDiningMenuResponse(menu: DiningMenu): DiningMenuResponse {
  return {
    location: { id: menu.location.id, name: menu.location.name },
    date: menu.date,
    mealPeriods: menu.mealPeriods.map((meal) => ({
      id: meal.id,
      name: meal.name,
      stations: meal.stations.map((station) => ({
        id: station.id,
        name: station.name,
        items: station.items.map((item) => ({
          id: item.id,
          name: item.name,
          dietaryTags: item.dietaryTags,
          allergens: item.allergens,
          hasNutritionDetail: Boolean(item.externalDetailOid),
          externalDetailOid: item.externalDetailOid,
        })),
      })),
    })),
    hours: menu.hours,
    fetchedAt: menu.fetchedAt,
    lastUpdated: menu.fetchedAt,
    stale: menu.stale,
    disclaimer: DINING_DISCLAIMER,
  };
}

export async function getDiningMenuForRequest(args: {
  locationParam: string | null;
  dateParam: string | null;
  fetchImpl?: typeof fetch;
}): Promise<DiningMenuResponse> {
  const started = Date.now();
  const locationId = resolveDiningLocationId(args.locationParam);
  if (!locationId) {
    throw new NetNutritionError("Unknown dining location", 400);
  }
  const isoDate = args.dateParam?.trim() || uriTodayIso();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    throw new NetNutritionError("Invalid date; use YYYY-MM-DD", 400);
  }
  toNetNutritionDateParam(isoDate);

  const menu = await fetchUriDiningMenu({
    locationId,
    isoDate,
    fetchImpl: args.fetchImpl,
  });
  logDiningServer({
    phase: "api_response",
    key: diningCacheKey(locationId, isoDate),
    totalMs: Date.now() - started,
    stale: Boolean(menu.stale),
    source: menu.source,
  });
  return toDiningMenuResponse(menu);
}

export async function getDiningItemNutrition(args: {
  detailOid: string;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = args.fetchImpl ?? fetch;
  const session = await createNetNutritionSession(fetchImpl);
  const result = await fetchItemNutritionLabel(session, args.detailOid, undefined, fetchImpl);
  return parseNutritionLabelHtml(result.html);
}

export { resolveDiningLocationId, NetNutritionError };
