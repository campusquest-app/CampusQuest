"use client";

import { useEffect, useState } from "react";
import { fetchAuthed } from "@/lib/client/dashboardApi";

type SchoolVerificationPayload = {
  verification?: { status?: string; schoolName?: string | null } | null;
  platformAdminAccess?: boolean;
  internalTesterAccess?: boolean;
};

/**
 * School name to show on the owner's profile, or null.
 * Only a real verified record counts — admin / internal-tester bypasses return a
 * synthetic "verified" pilot school that the user never actually verified.
 */
export function verifiedSchoolAffiliation(payload: SchoolVerificationPayload | null | undefined): string | null {
  if (!payload || payload.platformAdminAccess || payload.internalTesterAccess) return null;
  const v = payload.verification;
  if (v?.status !== "verified") return null;
  const name = v.schoolName?.trim();
  return name ? name : null;
}

const cache = new Map<string, Promise<string | null>>();

/**
 * Reads the signed-in owner's verified school from /api/me/school-verification,
 * once per user per session. Pass null to skip (other people's profiles, org identities).
 */
export function useOwnSchoolAffiliation(ownerUserId: string | null): string | null {
  const [affiliation, setAffiliation] = useState<string | null>(null);

  useEffect(() => {
    setAffiliation(null);
    if (!ownerUserId) return undefined;
    let active = true;
    let request = cache.get(ownerUserId);
    if (!request) {
      request = fetchAuthed<SchoolVerificationPayload>("/api/me/school-verification")
        .then(verifiedSchoolAffiliation)
        .catch(() => {
          cache.delete(ownerUserId);
          return null;
        });
      cache.set(ownerUserId, request);
    }
    void request.then((name) => {
      if (active) setAffiliation(name);
    });
    return () => {
      active = false;
    };
  }, [ownerUserId]);

  return affiliation;
}
