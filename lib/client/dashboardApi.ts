"use client";

import { clearAccessToken, getAccessToken } from "@/lib/client/apiSession";
import { rememberSchoolVerificationSnapshot, type SchoolVerificationClientSnapshot } from "@/lib/client/schoolVerificationCache";

/** Thrown client-side before any HTTP request when Bearer token is unavailable. */
export const CQ_MISSING_SESSION_CODE = "MISSING_SESSION" as const;

type ApiResponse<T> = { data?: T; error?: { message?: string; code?: string } };
const IS_DEV = process.env.NODE_ENV !== "production";

/** Thrown when an authed CampusQuest API responds with non-JSON success envelope or unauthorized. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
  }
}

/** Dev-only diagnostics; never logs tokens or cookies. */
function logAuthedRequestDev(payload: {
  phase: "pre" | "post";
  method: string;
  path: string;
  sessionPresent: boolean;
  statusCode?: number;
  ok?: boolean;
}) {
  if (!IS_DEV) return;
  console.info("[cq] authed-api", payload);
}

function missingSessionThrow(method: string, path: string): never {
  logAuthedRequestDev({ phase: "pre", method, path, sessionPresent: false });
  throw new ApiRequestError(
    "Session required. Sign in from CampusQuest, then try again.",
    401,
    CQ_MISSING_SESSION_CODE,
  );
}

function formatDevHttpMessage(path: string, status: number, statusText: string, fallback?: string) {
  if (!IS_DEV) return fallback ?? `Request failed (${status}).`;
  const base = `Backend request failed: ${path} returned ${status} ${statusText || "Unknown"}.`;
  return fallback ? `${base} ${fallback}` : base;
}

export type MeSchoolVerificationResponse = SchoolVerificationClientSnapshot;

/** Max wait for `/api/me/school-verification` before abort (avoids indefinite “checking…”). */
export const SCHOOL_VERIFICATION_FETCH_TIMEOUT_MS = 15_000;

const SCHOOL_VERIFICATION_PATH = "/api/me/school-verification";

export class SchoolVerificationHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "SchoolVerificationHttpError";
  }
}

type ApiSchoolPayload = {
  verification?: SchoolVerificationClientSnapshot["verification"];
  moderationAdminAccess?: boolean;
  verified?: boolean;
  schoolName?: string | null;
  schoolDomain?: string | null;
  requiredDomain?: string | null;
  requiredSchoolName?: string;
};

function buildSnapshotFromApiPayload(data: ApiSchoolPayload): MeSchoolVerificationResponse | null {
  if (data.verification && typeof data.verification === "object") {
    const v = data.verification;
    if (v.status !== "pending" && v.status !== "verified") return null;
    return {
      verification: {
        status: v.status,
        schoolName: v.schoolName ?? null,
        schoolDomain: v.schoolDomain ?? null,
        verifiedAt: v.verifiedAt ?? null,
        requiredPilotDomain: v.requiredPilotDomain ?? null,
        requiredPilotSchoolName: v.requiredPilotSchoolName ?? "your school",
      },
      moderationAdminAccess: Boolean(data.moderationAdminAccess),
    };
  }

  if (typeof data.verified === "boolean") {
    const requiredSchoolName =
      typeof data.requiredSchoolName === "string" && data.requiredSchoolName.trim() ? data.requiredSchoolName : "your school";
    return {
      verification: {
        status: data.verified ? "verified" : "pending",
        schoolName: data.schoolName ?? null,
        schoolDomain: data.schoolDomain ?? null,
        verifiedAt: null,
        requiredPilotDomain: data.requiredDomain ?? null,
        requiredPilotSchoolName: requiredSchoolName,
      },
      moderationAdminAccess: Boolean(data.moderationAdminAccess),
    };
  }

  return null;
}

function logSchoolVerificationDev(payload: {
  statusCode: number;
  ok: boolean;
  parsed: boolean;
  moderationAdminAccess: boolean;
  verified: boolean;
  error?: string;
}) {
  if (!IS_DEV) return;
  console.info("[cq] school-verification GET", {
    endpoint: SCHOOL_VERIFICATION_PATH,
    statusCode: payload.statusCode,
    ok: payload.ok,
    responseParsed: payload.parsed,
    moderationAdminAccess: payload.moderationAdminAccess,
    verified: payload.verified,
    ...(payload.error ? { error: payload.error } : {}),
  });
}

export async function fetchMeSchoolVerification(
  accessToken: string,
  options?: { signal?: AbortSignal },
): Promise<MeSchoolVerificationResponse> {
  const controller = new AbortController();
  const parentSignal = options?.signal;
  if (parentSignal) {
    if (parentSignal.aborted) controller.abort();
    else parentSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  const timeoutId = window.setTimeout(() => controller.abort(), SCHOOL_VERIFICATION_FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(SCHOOL_VERIFICATION_PATH, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (e) {
    window.clearTimeout(timeoutId);
    const isAbort = e instanceof DOMException && e.name === "AbortError";
    throw new SchoolVerificationHttpError(
      isAbort ? "Campus eligibility check timed out. Please try again." : "Could not reach the backend. Try again.",
      0,
      isAbort ? "TIMEOUT" : "NETWORK_ERROR",
    );
  }

  window.clearTimeout(timeoutId);

  let payload: ApiResponse<ApiSchoolPayload>;
  try {
    payload = (await response.json()) as ApiResponse<ApiSchoolPayload>;
  } catch {
    logSchoolVerificationDev({
      statusCode: response.status,
      ok: false,
      parsed: false,
      moderationAdminAccess: false,
      verified: false,
      error: "json_parse_failed",
    });
    throw new SchoolVerificationHttpError(
      response.status >= 500
        ? "Could not verify campus eligibility. Please try again."
        : "Could not read campus eligibility response.",
      response.status || 500,
      "INVALID_RESPONSE",
    );
  }

  const data = payload.data;
  const moderationAdminAccess = Boolean(data?.moderationAdminAccess);
  const verified = Boolean(data?.verified);
  const snapshot = data ? buildSnapshotFromApiPayload(data) : null;

  logSchoolVerificationDev({
    statusCode: response.status,
    ok: response.ok && Boolean(snapshot),
    parsed: Boolean(data),
    moderationAdminAccess,
    verified,
    ...(!response.ok || !snapshot ? { error: snapshot ? undefined : "missing_or_invalid_payload" } : {}),
  });

  if (response.status === 401) {
    clearAccessToken();
    throw new SchoolVerificationHttpError("Session expired. Please sign in again.", 401, payload.error?.code ?? "UNAUTHORIZED");
  }

  if (!response.ok) {
    if (response.status >= 500) {
      throw new SchoolVerificationHttpError(
        "Could not verify campus eligibility. Please try again.",
        response.status,
        payload.error?.code,
      );
    }
    const fallback = payload.error?.message;
    throw new SchoolVerificationHttpError(
      formatDevHttpMessage(SCHOOL_VERIFICATION_PATH, response.status, response.statusText || "Unknown", fallback) ||
        `Request failed (${response.status}).`,
      response.status,
      payload.error?.code,
    );
  }

  if (!snapshot) {
    throw new SchoolVerificationHttpError(
      "Could not verify campus eligibility. Please try again.",
      500,
      "INVALID_PAYLOAD",
    );
  }

  rememberSchoolVerificationSnapshot(accessToken, snapshot);
  return snapshot;
}

async function parseApiResponse<T>(response: Response): Promise<ApiResponse<T>> {
  return (await response.json().catch(() => ({}))) as ApiResponse<T>;
}

export async function fetchAuthed<T>(path: string): Promise<T> {
  const token = getAccessToken();
  if (!token) {
    missingSessionThrow("GET", path);
  }

  logAuthedRequestDev({ phase: "pre", method: "GET", path, sessionPresent: true });

  let response: Response;
  try {
    response = await fetch(path, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
  } catch {
    throw new Error(IS_DEV ? `Backend request failed: ${path} could not be reached.` : "Could not reach the backend. Try again.");
  }

  logAuthedRequestDev({
    phase: "post",
    method: "GET",
    path,
    sessionPresent: true,
    statusCode: response.status,
    ok: response.ok,
  });

  const payload = await parseApiResponse<T>(response);
  if (!response.ok) {
    if (response.status === 401) {
      clearAccessToken();
      throw new ApiRequestError("Session expired. Please sign in again.", 401, "UNAUTHORIZED");
    }
    const fallback = payload.error?.message;
    throw new ApiRequestError(
      formatDevHttpMessage(path, response.status, response.statusText, fallback),
      response.status,
      payload.error?.code,
    );
  }
  if (payload.data === undefined) {
    throw new Error("Invalid API response.");
  }
  return payload.data;
}

export async function postAuthed<T, B extends Record<string, unknown>>(path: string, body: B): Promise<T> {
  const token = getAccessToken();
  if (!token) {
    missingSessionThrow("POST", path);
  }

  logAuthedRequestDev({ phase: "pre", method: "POST", path, sessionPresent: true });

  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new Error(IS_DEV ? `Backend request failed: ${path} could not be reached.` : "Could not reach the backend. Try again.");
  }

  logAuthedRequestDev({
    phase: "post",
    method: "POST",
    path,
    sessionPresent: true,
    statusCode: response.status,
    ok: response.ok,
  });

  const payload = await parseApiResponse<T>(response);
  if (!response.ok) {
    if (response.status === 401) {
      clearAccessToken();
      throw new ApiRequestError("Session expired. Please sign in again.", 401, "UNAUTHORIZED");
    }
    const fallback = payload.error?.message;
    throw new ApiRequestError(
      formatDevHttpMessage(path, response.status, response.statusText, fallback),
      response.status,
      payload.error?.code,
    );
  }
  if (payload.data === undefined) {
    throw new Error("Invalid API response.");
  }
  return payload.data;
}

export async function patchAuthed<T, B extends Record<string, unknown>>(path: string, body: B): Promise<T> {
  const token = getAccessToken();
  if (!token) {
    missingSessionThrow("PATCH", path);
  }

  logAuthedRequestDev({ phase: "pre", method: "PATCH", path, sessionPresent: true });

  let response: Response;
  try {
    response = await fetch(path, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new Error(IS_DEV ? `Backend request failed: ${path} could not be reached.` : "Could not reach the backend. Try again.");
  }

  logAuthedRequestDev({
    phase: "post",
    method: "PATCH",
    path,
    sessionPresent: true,
    statusCode: response.status,
    ok: response.ok,
  });

  const payload = await parseApiResponse<T>(response);
  if (!response.ok) {
    if (response.status === 401) {
      clearAccessToken();
      throw new ApiRequestError("Session expired. Please sign in again.", 401, "UNAUTHORIZED");
    }
    const fallback = payload.error?.message;
    throw new ApiRequestError(
      formatDevHttpMessage(path, response.status, response.statusText, fallback),
      response.status,
      payload.error?.code,
    );
  }
  if (payload.data === undefined) {
    throw new Error("Invalid API response.");
  }
  return payload.data;
}

export async function deleteAuthed<T>(path: string): Promise<T> {
  const token = getAccessToken();
  if (!token) {
    missingSessionThrow("DELETE", path);
  }

  logAuthedRequestDev({ phase: "pre", method: "DELETE", path, sessionPresent: true });

  let response: Response;
  try {
    response = await fetch(path, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
  } catch {
    throw new Error(IS_DEV ? `Backend request failed: ${path} could not be reached.` : "Could not reach the backend. Try again.");
  }

  logAuthedRequestDev({
    phase: "post",
    method: "DELETE",
    path,
    sessionPresent: true,
    statusCode: response.status,
    ok: response.ok,
  });

  const payload = await parseApiResponse<T>(response);
  if (!response.ok) {
    if (response.status === 401) {
      clearAccessToken();
      throw new ApiRequestError("Session expired. Please sign in again.", 401, "UNAUTHORIZED");
    }
    const fallback = payload.error?.message;
    throw new ApiRequestError(
      formatDevHttpMessage(path, response.status, response.statusText, fallback),
      response.status,
      payload.error?.code,
    );
  }
  if (payload.data === undefined) {
    throw new Error("Invalid API response.");
  }
  return payload.data;
}
