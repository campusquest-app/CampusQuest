"use client";

import type { CampusMemory, CampusMemoryGroup, CampusMemoryMediaType, CampusMemoryVisibility } from "@/lib/types";
import type { CampusLocationKey } from "@/lib/campusLocations";
import { deleteAuthed, fetchAuthed, patchAuthed, postAuthed } from "@/lib/client/dashboardApi";

export async function fetchCampusMemoryGroups(): Promise<CampusMemoryGroup[]> {
  const data = await fetchAuthed<{ groups: CampusMemoryGroup[] }>("/api/campus-memories/groups");
  return data.groups ?? [];
}

export async function fetchCampusMemoriesByLocation(locationKey: string): Promise<CampusMemory[]> {
  const data = await fetchAuthed<{ memories: CampusMemory[] }>(
    `/api/campus-memories?locationKey=${encodeURIComponent(locationKey)}`,
  );
  return data.memories ?? [];
}

export async function fetchSavedCampusMemories(userId?: string): Promise<CampusMemory[]> {
  const qs = userId ? `?saved=true&userId=${encodeURIComponent(userId)}` : "?saved=true";
  const data = await fetchAuthed<{ memories: CampusMemory[] }>(`/api/campus-memories${qs}`);
  return data.memories ?? [];
}

export async function uploadCampusMemoryMedia(mediaDataUrl: string): Promise<string> {
  const data = await postAuthed<{ mediaUrl: string }, { mediaDataUrl: string }>("/api/campus-memories/media", {
    mediaDataUrl,
  });
  return data.mediaUrl;
}

export async function createCampusMemory(input: {
  locationKey: CampusLocationKey;
  locationName?: string;
  eventId?: string | null;
  mediaUrl?: string | null;
  mediaType: CampusMemoryMediaType;
  body?: string | null;
  visibility?: CampusMemoryVisibility;
}): Promise<CampusMemory> {
  const data = await postAuthed<{ memory: CampusMemory }, typeof input>("/api/campus-memories", input);
  return data.memory;
}

export async function saveCampusMemoryToProfile(memoryId: string): Promise<CampusMemory> {
  const data = await patchAuthed<{ memory: CampusMemory }, { savedToProfile: boolean }>(
    `/api/campus-memories/${memoryId}`,
    { savedToProfile: true },
  );
  return data.memory;
}

export async function deleteCampusMemory(memoryId: string): Promise<void> {
  await deleteAuthed(`/api/campus-memories/${memoryId}`);
}
