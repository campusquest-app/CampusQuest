"use client";

import { quadPostRowToFieldNote, type QuadPostApiRow } from "@/lib/quadFieldNote";
import type { FieldNote } from "@/lib/types";
import { fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";

export async function fetchQuadHomePosts(limit = 80): Promise<FieldNote[]> {
  const data = await fetchAuthed<{ posts: QuadPostApiRow[] }>(`/api/quad/posts?limit=${limit}`);
  return data.posts.map(quadPostRowToFieldNote);
}

export async function fetchQuadPostsByAuthor(authorId: string, limit = 40): Promise<FieldNote[]> {
  const qs = new URLSearchParams({ authorId, limit: String(limit) });
  const data = await fetchAuthed<{ posts: QuadPostApiRow[] }>(`/api/quad/posts?${qs.toString()}`);
  return data.posts.map(quadPostRowToFieldNote);
}

export async function fetchMyQuadPosts(limit = 40): Promise<FieldNote[]> {
  const data = await fetchAuthed<{ posts: QuadPostApiRow[] }>(`/api/me/quad/posts?limit=${limit}`);
  return data.posts.map(quadPostRowToFieldNote);
}

export async function createQuadPostRequest(payload: {
  body: string;
  proofUrl?: string;
  visibility?: "public" | "friends";
  ramMarks?: { id?: string; tag: string }[];
  relatedActivityId?: string | null;
  relatedQuestSlug?: string | null;
  authorStreakDays?: number;
  locationId?: string;
  locationName?: string;
}): Promise<FieldNote> {
  const body = payload as Record<string, unknown>;
  const data = await postAuthed<{ post: QuadPostApiRow }, Record<string, unknown>>("/api/quad/posts", body);
  const note = quadPostRowToFieldNote(data.post);
  if (payload.locationId && payload.locationName) {
    note.locationId = payload.locationId;
    note.locationName = payload.locationName;
  }
  return note;
}
