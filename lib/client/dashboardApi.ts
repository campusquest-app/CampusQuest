"use client";

import { getAccessToken } from "@/lib/client/apiSession";

type ApiResponse<T> = { data?: T; error?: { message?: string } };

export async function fetchAuthed<T>(path: string): Promise<T> {
  const token = getAccessToken();
  if (!token) {
    throw new Error("Sign in to load backend dashboard data.");
  }

  const response = await fetch(path, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as ApiResponse<T>;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Request failed (${response.status}).`);
  }
  if (payload.data === undefined) {
    throw new Error("Invalid API response.");
  }
  return payload.data;
}
