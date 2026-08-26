"use client";

import { fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import { uploadImageBlob } from "@/lib/client/uploadImageWithProgress";
import type { OrganizationClaimMatch, VerificationIdentityType, VerificationRequestSummary } from "@/lib/identity/types";

export type SubmitVerificationInput = {
  identityType: VerificationIdentityType;
  name: string;
  category: string;
  description: string;
  websiteUrl?: string | null;
  socialUrl?: string | null;
  organizationEmail?: string | null;
  urinvolvedUrl?: string | null;
  applicantRole?: string | null;
  logoUrl?: string | null;
  imageUrl?: string | null;
  reasonForAccess?: string | null;
  requestedIdentityId?: string | null;
  applicantConfirmation: true;
};

export async function submitVerificationRequest(input: SubmitVerificationInput): Promise<{
  request: VerificationRequestSummary;
  emailQueued: boolean;
}> {
  return postAuthed("/api/verification/requests", input);
}

export async function searchOrganizationMatches(query: string): Promise<OrganizationClaimMatch[]> {
  const qs = new URLSearchParams({ q: query });
  const data = await fetchAuthed<{ organizations: OrganizationClaimMatch[] }>(
    `/api/verification/organizations/search?${qs.toString()}`,
  );
  return data.organizations ?? [];
}

export async function uploadVerificationImage(file: File): Promise<string> {
  const data = await uploadImageBlob<{ url: string }>({
    path: "/api/verification/requests/media",
    blob: file,
    fileName: file.name || "identity.jpg",
    fieldName: "file",
  });
  if (!data.url?.trim()) throw new Error("Photo upload returned an empty URL.");
  return data.url.trim();
}
