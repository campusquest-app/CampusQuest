"use client";

export type SchoolVerificationClientSnapshot = {
  verification: {
    status: "pending" | "verified";
    schoolName: string | null;
    schoolDomain: string | null;
    verifiedAt: string | null;
    requiredPilotDomain: string | null;
    requiredPilotSchoolName: string;
  };
  moderationAdminAccess: boolean;
};

const STORAGE_KEY = "cq_school_verification_v2";

type StoredPayload = {
  tokenPrefix: string;
  snapshot: SchoolVerificationClientSnapshot;
};

function prefixFor(token: string) {
  return token.length <= 24 ? token : token.slice(0, 32);
}

export function rememberSchoolVerificationSnapshot(token: string, snapshot: SchoolVerificationClientSnapshot) {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredPayload = { tokenPrefix: prefixFor(token), snapshot };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore quota / privacy mode errors.
  }
}

export function peekSchoolVerificationSnapshot(token: string | null): SchoolVerificationClientSnapshot | null {
  if (typeof window === "undefined" || !token) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPayload;
    if (parsed.tokenPrefix !== prefixFor(token)) return null;
    return parsed.snapshot;
  } catch {
    return null;
  }
}

export function clearSchoolVerificationSnapshot() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}
