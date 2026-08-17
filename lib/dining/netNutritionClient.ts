/**
 * Server-side client for URI CBORD NetNutrition AJAX endpoints.
 * Uses the same POSTs as the official SPA; does not bypass auth or bot walls.
 */

const BASE = "https://fss.dining.uri.edu/NetNutrition/URIDining";
const USER_AGENT =
  "CampusQuestDiningBot/1.0 (+https://campusquest.app; URI menu cache; contact support)";

/** Per-request ceiling so a bad upstream redirect/hang cannot wedge menu loading. */
export const NET_NUTRITION_FETCH_TIMEOUT_MS = 20_000;

export type NetNutritionPanel = { id?: string; html?: string };
export type NetNutritionJson = {
  success?: boolean;
  panels?: NetNutritionPanel[];
};

export class NetNutritionError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "NetNutritionError";
    this.status = status;
  }
}

export type NetNutritionSession = {
  cookieHeader: string;
};

function mergeSetCookies(existing: string, setCookieHeaders: string[]): string {
  const jar = new Map<string, string>();
  for (const part of existing.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    jar.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
  }
  for (const header of setCookieHeaders) {
    const first = header.split(";")[0]?.trim();
    if (!first) continue;
    const eq = first.indexOf("=");
    if (eq <= 0) continue;
    jar.set(first.slice(0, eq), first.slice(eq + 1));
  }
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
}

function getSetCookieHeaders(res: Response): string[] {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const single = res.headers.get("set-cookie");
  return single ? [single] : [];
}

function isAbortError(error: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

/**
 * Fetch with a hard timeout. Composes with any caller-provided AbortSignal.
 */
export async function netNutritionFetch(
  fetchImpl: typeof fetch,
  url: string,
  init?: RequestInit,
  timeoutMs: number = NET_NUTRITION_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const parent = init?.signal;
  if (parent) {
    if (parent.aborted) controller.abort();
    else parent.addEventListener("abort", () => controller.abort(), { once: true });
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (isAbortError(error)) {
      // Caller-cancelled (e.g. React effect cleanup) must stay an AbortError.
      if (parent?.aborted) throw error;
      throw new NetNutritionError(
        `NetNutrition request timed out after ${timeoutMs}ms`,
        504,
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Open a NetNutrition ASP.NET session.
 *
 * URI's entry URL responds with HTTP 302 to the *same* path (`/NetNutrition/URIDining`).
 * Following redirects therefore loops forever (`redirect count exceeded`). Capture
 * Set-Cookie from the 302 with `redirect: "manual"` instead.
 */
export async function createNetNutritionSession(
  fetchImpl: typeof fetch = fetch,
): Promise<NetNutritionSession> {
  const res = await netNutritionFetch(fetchImpl, BASE, {
    method: "GET",
    redirect: "manual",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
  });

  const redirected = res.status >= 300 && res.status < 400;
  if (!res.ok && !redirected) {
    throw new NetNutritionError(`Failed to open NetNutrition session (${res.status})`, res.status);
  }

  const cookieHeader = mergeSetCookies("", getSetCookieHeaders(res));
  if (!cookieHeader.includes("ASP.NET_SessionId")) {
    // Some runtimes collapse set-cookie; still try with whatever we got + tenant cookie.
    const fallback = mergeSetCookies(cookieHeader, [
      "CBORD.netnutrition2=NNexternalID=URIDining",
    ]);
    return { cookieHeader: fallback };
  }
  return {
    cookieHeader: mergeSetCookies(cookieHeader, [
      "CBORD.netnutrition2=NNexternalID=URIDining",
    ]),
  };
}

async function postForm(
  session: NetNutritionSession,
  path: string,
  body: Record<string, string | number>,
  fetchImpl: typeof fetch,
): Promise<{ session: NetNutritionSession; text: string; contentType: string }> {
  const url = `${BASE}/${path.replace(/^\//, "")}`;
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) form.set(k, String(v));

  const res = await netNutritionFetch(fetchImpl, url, {
    method: "POST",
    redirect: "manual",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json, text/javascript, */*; q=0.01",
      Origin: "https://fss.dining.uri.edu",
      Referer: BASE,
      Cookie: session.cookieHeader,
    },
    body: form.toString(),
  });

  const nextSession = {
    cookieHeader: mergeSetCookies(session.cookieHeader, getSetCookieHeaders(res)),
  };

  if (res.status >= 300 && res.status < 400) {
    throw new NetNutritionError(
      `NetNutrition redirected (${res.status}) — session may be missing`,
      res.status,
    );
  }
  if (!res.ok) {
    throw new NetNutritionError(`NetNutrition ${path} failed (${res.status})`, res.status);
  }

  const text = await res.text();
  return {
    session: nextSession,
    text,
    contentType: res.headers.get("content-type") ?? "",
  };
}

export async function postNetNutritionJson(
  session: NetNutritionSession,
  path: string,
  body: Record<string, string | number>,
  fetchImpl: typeof fetch = fetch,
): Promise<{ session: NetNutritionSession; data: NetNutritionJson }> {
  const result = await postForm(session, path, body, fetchImpl);
  let data: NetNutritionJson;
  try {
    data = JSON.parse(result.text) as NetNutritionJson;
  } catch {
    throw new NetNutritionError(`NetNutrition ${path} returned non-JSON`, undefined);
  }
  if (data.success === false) {
    throw new NetNutritionError(`NetNutrition ${path} reported success=false`);
  }
  return { session: result.session, data };
}

export async function postNetNutritionHtml(
  session: NetNutritionSession,
  path: string,
  body: Record<string, string | number>,
  fetchImpl: typeof fetch = fetch,
): Promise<{ session: NetNutritionSession; html: string }> {
  const result = await postForm(session, path, body, fetchImpl);
  return { session: result.session, html: result.text };
}

export function panelHtml(data: NetNutritionJson, panelId: string): string {
  const panel = data.panels?.find((p) => p.id === panelId);
  return panel?.html ?? "";
}

export async function selectParentUnit(
  session: NetNutritionSession,
  unitOid: number,
  fetchImpl: typeof fetch = fetch,
) {
  return postNetNutritionJson(
    session,
    "Unit/SelectUnitFromUnitsList",
    { unitOid },
    fetchImpl,
  );
}

export async function selectChildUnit(
  session: NetNutritionSession,
  unitOid: number,
  fetchImpl: typeof fetch = fetch,
) {
  return postNetNutritionJson(
    session,
    "Unit/SelectUnitFromChildUnitsList",
    { unitOid },
    fetchImpl,
  );
}

export async function selectMenu(
  session: NetNutritionSession,
  menuOid: number,
  fetchImpl: typeof fetch = fetch,
) {
  return postNetNutritionJson(session, "Menu/SelectMenu", { menuOid }, fetchImpl);
}

export async function fetchHoursMarkup(
  session: NetNutritionSession,
  unitOid: number,
  fetchImpl: typeof fetch = fetch,
) {
  return postNetNutritionHtml(
    session,
    "Unit/GetHoursOfOperationMarkup",
    { unitOid },
    fetchImpl,
  );
}

export async function fetchItemNutritionLabel(
  session: NetNutritionSession,
  detailOid: string | number,
  menuOid?: string | number,
  fetchImpl: typeof fetch = fetch,
) {
  const body: Record<string, string | number> = { detailOid: Number(detailOid) };
  if (menuOid != null) body.menuOid = Number(menuOid);
  return postNetNutritionHtml(
    session,
    "NutritionDetail/ShowItemNutritionLabel",
    body,
    fetchImpl,
  );
}
