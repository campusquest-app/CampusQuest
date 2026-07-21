"use client";

import { canAccessCampusFeatures } from "@/lib/campusAccess";
import type { SchoolVerificationClientSnapshot } from "@/lib/client/schoolVerificationCache";

const IS_DEV = process.env.NODE_ENV !== "production";

export function snapshotPlatformAdminAccess(snapshot: SchoolVerificationClientSnapshot): boolean {
  return snapshot.platformAdminAccess ?? Boolean(snapshot.moderationAdminAccess);
}

function logCampusAccessDev(payload: Record<string, unknown>) {
  if (!IS_DEV) return;
  console.info("[cq] campus-access", payload);
}

/**
 * Client gate after `/api/me/school-verification` — trusted-account bypasses
 * (admin, internal tester) run before campus domain rules.
 */
export function canAccessCampusFromSnapshot(snapshot: SchoolVerificationClientSnapshot): boolean {
  const isAdmin = snapshotPlatformAdminAccess(snapshot);
  const isInternalTester = snapshot.internalTesterAccess === true;

  if (isAdmin || isInternalTester) {
    logCampusAccessDev({
      isAdmin,
      isInternalTester,
      isConfirmed: true,
      emailDomain: snapshot.verification.schoolDomain,
      decision: "allow",
    });
    return true;
  }

  const verification = snapshot.verification;
  const isConfirmed = verification.status === "verified";
  const allowed = canAccessCampusFeatures({
    isPlatformAdmin: false,
    emailVerified: isConfirmed,
    pilotDomain: verification.requiredPilotDomain,
    verification,
  });

  logCampusAccessDev({
    isAdmin: false,
    isConfirmed,
    emailDomain: verification.schoolDomain,
    pilotDomain: verification.requiredPilotDomain,
    verificationStatus: verification.status,
    decision: allowed ? "allow" : "campus_verification_required",
  });

  return allowed;
}
