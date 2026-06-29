"use client";

import type {
  CampusMemory,
  CampusMemoryArchiveSection,
  CampusMemoryGroup,
  CampusMemoryLocationStats,
  CampusMemoryMediaType,
  CampusMemoryVisibility,
} from "@/lib/types";
import type { CampusLocationId } from "@/lib/locations/registry";
import { deleteAuthed, fetchAuthed, patchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import { notifyCampusMemoriesChanged } from "@/lib/client/campusMemoriesSync";
import { compressImageFile } from "@/lib/client/imageCompression";
import { uploadImageBlob, type UploadProgress } from "@/lib/client/uploadImageWithProgress";

export async function fetchCampusMemoryGroups(): Promise<CampusMemoryGroup[]> {
  const data = await fetchAuthed<{ groups: CampusMemoryGroup[] }>("/api/campus-memories/groups");
  return data.groups ?? [];
}

export async function fetchCampusMemoryGroupsAndStats(): Promise<{
  groups: CampusMemoryGroup[];
  stats: CampusMemoryLocationStats[];
}> {
  const data = await fetchAuthed<{
    groups: CampusMemoryGroup[];
    stats?: CampusMemoryLocationStats[];
  }>("/api/campus-memories/groups?stats=true");
  return { groups: data.groups ?? [], stats: data.stats ?? [] };
}

export async function fetchCampusMemoriesByLocation(
  locationId: string,
  options?: { includeExpired?: boolean },
): Promise<CampusMemory[]> {
  const qs = new URLSearchParams({ locationId });
  if (options?.includeExpired) qs.set("includeExpired", "true");
  const data = await fetchAuthed<{ memories: CampusMemory[] }>(`/api/campus-memories?${qs}`);
  return data.memories ?? [];
}

export async function fetchSavedCampusMemories(userId?: string): Promise<CampusMemory[]> {
  const qs = userId ? `?saved=true&userId=${encodeURIComponent(userId)}` : "?saved=true";
  const data = await fetchAuthed<{ memories: CampusMemory[] }>(`/api/campus-memories${qs}`);
  return data.memories ?? [];
}

export async function fetchCampusMemoryArchive(userId?: string): Promise<CampusMemoryArchiveSection[]> {
  const qs = userId
    ? `?archive=true&userId=${encodeURIComponent(userId)}`
    : "?archive=true";
  const data = await fetchAuthed<{ sections: CampusMemoryArchiveSection[] }>(`/api/campus-memories${qs}`);
  return data.sections ?? [];
}

/**
 * Compress an image File client-side and upload the resulting Blob to storage.
 * Returns the public URL to attach to a Memory. Reports upload progress so the
 * UI can show a bar and disable the Post button.
 */
export async function uploadCampusMemoryImage(
  file: File,
  onProgress?: UploadProgress,
): Promise<string> {
  const compressed = await compressImageFile(file);
  const data = await uploadImageBlob<{ mediaUrl: string }>({
    path: "/api/campus-memories/media",
    blob: compressed.blob,
    fileName: compressed.fileName,
    onProgress,
  });
  if (!data?.mediaUrl) {
    throw new Error("Upload did not return a URL.");
  }
  return data.mediaUrl;
}

export async function createCampusMemory(input: {
  locationId: CampusLocationId;
  locationName?: string;
  eventId?: string | null;
  mediaUrl?: string | null;
  mediaType: CampusMemoryMediaType;
  body?: string | null;
  visibility?: CampusMemoryVisibility;
}): Promise<CampusMemory> {
  const data = await postAuthed<{ memory: CampusMemory }, typeof input>("/api/campus-memories", input);
  notifyCampusMemoriesChanged();
  return data.memory;
}

export async function saveCampusMemoryToProfile(memoryId: string): Promise<CampusMemory> {
  const data = await patchAuthed<{ memory: CampusMemory }, { savedToProfile: boolean }>(
    `/api/campus-memories/${memoryId}`,
    { savedToProfile: true },
  );
  notifyCampusMemoriesChanged();
  return data.memory;
}

export async function deleteCampusMemory(memoryId: string): Promise<void> {
  await deleteAuthed(`/api/campus-memories/${memoryId}`);
  notifyCampusMemoriesChanged();
}
