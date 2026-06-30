"use client";

import { canAccessCampusFeatures } from "@/lib/campusAccess";
import type { SchoolVerificationClientSnapshot } from "@/lib/client/schoolVerificationCache";

export function snapshotPlatformAdminAccess(snapshot: SchoolVerificationClientSnapshot): boolean {
  return snapshot.platformAdminAccess ?? Boolean(snapshot.moderationAdminAccess);
}

export function canAccessCampusFromSnapshot(snapshot: SchoolVerificationClientSnapshot): boolean {
  return canAccessCampusFeatures({
    isPlatformAdmin: snapshotPlatformAdminAccess(snapshot),
    emailVerified: true,
    pilotDomain: snapshot.verification.requiredPilotDomain,
    verification: snapshot.verification,
  });
}
