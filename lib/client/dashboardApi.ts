"use client";

import { clearAccessToken, getAccessToken } from "@/lib/client/apiSession";

type ApiResponse<T> = { data?: T; error?: { message?: string; code?: string } };
const IS_DEV = process.env.NODE_ENV !== "production";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
  }
}

function formatDevHttpMessage(path: string, status: number, statusText: string, fallback?: string) {
  if (!IS_DEV) return fallback ?? `Request failed (${status}).`;
  const base = `Backend request failed: ${path} returned ${status} ${statusText || "Unknown"}.`;
  return fallback ? `${base} ${fallback}` : base;
}

async function parseApiResponse<T>(response: Response): Promise<ApiResponse<T>> {
  return (await response.json().catch(() => ({}))) as ApiResponse<T>;
}

export async function fetchAuthed<T>(path: string): Promise<T> {
  const token = getAccessToken();
  if (!token) {
    throw new Error("Sign in to load backend dashboard data.");
  }

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
    throw new Error("Sign in to call backend APIs.");
  }

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
    throw new Error("Sign in to call backend APIs.");
  }

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
