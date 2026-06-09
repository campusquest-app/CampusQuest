"use client";

import { ApiRequestError, postAuthed } from "@/lib/client/dashboardApi";

const DATA_IMAGE_PREFIX = "data:image/";

export function isQuadPostProofDataUrl(value: string | undefined | null): boolean {
  return Boolean(value?.trim().startsWith(DATA_IMAGE_PREFIX));
}

/** Upload device/camera proof image to Supabase Storage before post create. */
export async function uploadQuadPostProofDataUrl(proofDataUrl: string): Promise<string> {
  const trimmed = proofDataUrl.trim();
  if (!isQuadPostProofDataUrl(trimmed)) {
    throw new Error("proofDataUrl must be a data:image/ URL.");
  }

  console.info("[cq][quad-post] uploading proof image", {
    dataUrlLength: trimmed.length,
    mime: trimmed.slice(5, trimmed.indexOf(";")),
  });

  try {
    const data = await postAuthed<{ proofUrl: string }, { proofDataUrl: string }>("/api/quad/posts/proof", {
      proofDataUrl: trimmed,
    });
    if (!data.proofUrl?.trim()) {
      throw new Error("Proof upload returned an empty URL.");
    }
    console.info("[cq][quad-post] proof image uploaded", {
      proofUrl: data.proofUrl,
    });
    return data.proofUrl.trim();
  } catch (error) {
    console.error("[cq][quad-post] proof upload failed", {
      message: error instanceof Error ? error.message : String(error),
      code: error instanceof ApiRequestError ? error.code : undefined,
      status: error instanceof ApiRequestError ? error.status : undefined,
    });
    throw error;
  }
}
