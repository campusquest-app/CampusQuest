"use client";

import { fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import { personalIdentityRef } from "@/lib/identity/policy";
import type {
  ActiveCampusIdentity,
  CampusIdentity,
  VerificationApplicantSnapshot,
  VerificationIdentityType,
  VerificationRequestSummary,
} from "@/lib/identity/types";

const SESSION_KEY = "cq-active-identity-v1";

export type IdentitySnapshot = {
  identities: CampusIdentity[];
  active: ActiveCampusIdentity;
  pendingRequests: VerificationRequestSummary[];
  applicant: VerificationApplicantSnapshot | null;
  loaded: boolean;
  verificationOpen: boolean;
  verificationPreset: VerificationIdentityType | null;
};

const EMPTY: IdentitySnapshot = {
  identities: [],
  active: { type: "personal", id: "" },
  pendingRequests: [],
  applicant: null,
  loaded: false,
  verificationOpen: false,
  verificationPreset: null,
};

let snapshot: IdentitySnapshot = EMPTY;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function persistActive(active: ActiveCampusIdentity) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(active));
  } catch {
    /* ignore quota */
  }
}

export function readPersistedActiveIdentity(): ActiveCampusIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveCampusIdentity;
    if (parsed?.type && parsed?.id) return parsed;
  } catch {
    return null;
  }
  return null;
}

export function getIdentitySnapshot(): IdentitySnapshot {
  return snapshot;
}

export function subscribeIdentityStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setIdentitySnapshot(partial: Partial<IdentitySnapshot>) {
  snapshot = { ...snapshot, ...partial };
  if (partial.active) persistActive(partial.active);
  emit();
}

export function openVerificationOnboarding(preset: VerificationIdentityType | null = null) {
  snapshot = { ...snapshot, verificationOpen: true, verificationPreset: preset };
  emit();
}

export function closeVerificationOnboarding() {
  snapshot = { ...snapshot, verificationOpen: false, verificationPreset: null };
  emit();
}

export async function loadCampusIdentities(userId: string): Promise<IdentitySnapshot> {
  const data = await fetchAuthed<{
    identities: CampusIdentity[];
    active: ActiveCampusIdentity;
    pendingRequests: VerificationRequestSummary[];
    applicant: VerificationApplicantSnapshot;
  }>("/api/identities");
  const persisted = readPersistedActiveIdentity();
  const active =
    persisted && data.identities.some((row) => row.type === persisted.type && row.id === persisted.id)
      ? persisted
      : data.active.type
        ? data.active
        : personalIdentityRef(userId);
  snapshot = {
    ...snapshot,
    identities: data.identities,
    active,
    pendingRequests: data.pendingRequests ?? [],
    applicant: data.applicant ?? null,
    loaded: true,
  };
  persistActive(active);
  emit();
  return snapshot;
}

export async function switchCampusIdentity(target: ActiveCampusIdentity): Promise<void> {
  const data = await postAuthed<{ identities: CampusIdentity[]; active: ActiveCampusIdentity }, ActiveCampusIdentity>(
    "/api/identities/active",
    target,
  );
  snapshot = {
    ...snapshot,
    identities: data.identities,
    active: data.active,
    loaded: true,
  };
  persistActive(data.active);
  emit();
}

export function resetIdentityStore() {
  snapshot = EMPTY;
  emit();
}
