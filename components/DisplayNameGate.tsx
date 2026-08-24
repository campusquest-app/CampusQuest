"use client";

import { useEffect, useRef, useState } from "react";
import { patchAuthed } from "@/lib/client/dashboardApi";
import type { MeProfileRow } from "@/lib/client/profileCharacter";
import {
  isDisplayNameValid,
  normalizeDisplayNameInput,
} from "@/lib/onboarding/displayNameOnboardingPolicy";
import { normalizeCharacterUsername } from "@/lib/client/characterGateIdentity";

const DRAFT_KEY = "cq_display_name_gate_draft_v1";
const NAME_MAX = 40;

function readDraft(userId: string | null): string | null {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const raw = sessionStorage.getItem(`${DRAFT_KEY}:${userId}`);
    return typeof raw === "string" ? raw : null;
  } catch {
    return null;
  }
}

function writeDraft(userId: string | null, value: string) {
  if (typeof window === "undefined" || !userId) return;
  try {
    sessionStorage.setItem(`${DRAFT_KEY}:${userId}`, value);
  } catch {
    /* ignore */
  }
}

function clearDraft(userId: string | null) {
  if (typeof window === "undefined" || !userId) return;
  try {
    sessionStorage.removeItem(`${DRAFT_KEY}:${userId}`);
  } catch {
    /* ignore */
  }
}

/**
 * Post-signup display name step.
 * Username is shown read-only from the signup profile and is never patched here.
 */
export function DisplayNameGate({
  profile,
  onComplete,
}: {
  profile: MeProfileRow | null;
  onComplete: (updatedProfile: MeProfileRow) => void;
}) {
  const userId = profile?.id ?? null;
  const username = normalizeCharacterUsername(profile?.username ?? "");
  const [name, setName] = useState(() => {
    const draft = readDraft(userId);
    if (draft != null) return draft.slice(0, NAME_MAX);
    return (profile?.display_name ?? "").slice(0, NAME_MAX);
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lockRef = useRef(false);

  useEffect(() => {
    if (!profile) return;
    const draft = readDraft(profile.id);
    if (draft != null) {
      setName(draft.slice(0, NAME_MAX));
      return;
    }
    setName((profile.display_name ?? "").slice(0, NAME_MAX));
  }, [profile]);

  useEffect(() => {
    writeDraft(userId, name);
  }, [userId, name]);

  const nameValid = isDisplayNameValid(name);

  async function handleContinue() {
    if (!nameValid || lockRef.current || saving) return;
    lockRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const displayName = normalizeDisplayNameInput(name);
      // Intentionally omit username — signup owns the handle.
      const updated = await patchAuthed<
        MeProfileRow,
        { displayName: string; confirmDisplayNameSetup: true }
      >("/api/me/profile", {
        displayName,
        confirmDisplayNameSetup: true,
      });
      clearDraft(userId);
      onComplete(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your name. Try again.");
      lockRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="cq-onboard-shell cq-onboard-shell--light" data-testid="display-name-gate">
      <div className="cq-onboard-inner">
        <div className="cq-onboard-step">
          <h1 className="cq-onboard-question">What should we call you?</h1>
          <p className="cq-onboard-support">This is the name people will see on CampusQuest.</p>

          <label className="cq-onboard-field-label" htmlFor="cq-display-name-input">
            Display name
          </label>
          <div className="cq-onboard-input-wrap">
            <input
              id="cq-display-name-input"
              className="cq-onboard-input"
              value={name}
              onChange={(e) => {
                setName(e.target.value.slice(0, NAME_MAX));
                setError(null);
              }}
              placeholder="e.g. NileLotus"
              maxLength={NAME_MAX}
              autoComplete="nickname"
              autoFocus
              aria-required
            />
          </div>

          {username ? (
            <p className="cq-onboard-support mt-3" data-testid="display-name-gate-username">
              Your username is <span className="font-mono font-semibold text-slate-700">@{username}</span>
            </p>
          ) : null}

          {error ? (
            <p className="cq-onboard-error mt-3" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            className="cq-onboard-btn-primary cq-onboard-btn-primary--glow mt-8 disabled:opacity-40"
            disabled={!nameValid || saving}
            onClick={() => void handleContinue()}
          >
            {saving ? "Saving…" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
