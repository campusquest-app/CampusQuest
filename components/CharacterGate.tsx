"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { replaceLocalCharacter } from "@/lib/store";
import { getAccessToken } from "@/lib/client/apiSession";
import {
  type AvatarConfig,
  avatarConfigFromPreset,
  buildAvatarOnboardingSavePayload,
  canCompleteAvatarOnboarding,
  createDefaultAvatarConfig,
  parseStoredAvatarConfig,
  randomizeAvatarConfig,
  serializeAvatarConfig,
} from "@/lib/avatarConfig";
import { AVATAR_LOOK_PRESETS } from "@/lib/avatarPresets";
import { CHARACTER_CLASSES } from "@/lib/characterClasses";
import { AvatarDisplay } from "./AvatarDisplay";
import { ApiRequestError, fetchAuthed, patchAuthed } from "@/lib/client/dashboardApi";
import { resetUserSaveSyncAfterHydrate } from "@/lib/client/gameStateSync";
import { buildLocalCharacterFromServer, type MeProfileRow, type MeStatsRow } from "@/lib/client/profileCharacter";
import { resolveCharacterGateIdentity } from "@/lib/client/characterGateIdentity";
import { CampusQuestLogo } from "@/components/CampusQuestLogo";

type OnboardingStep = "avatar" | "ready";

function StepDots({ step }: { step: OnboardingStep }) {
  const order: OnboardingStep[] = ["avatar", "ready"];
  return (
    <div className="flex items-center justify-center gap-2" aria-label="Onboarding progress">
      {order.map((id, i) => {
        const active = order.indexOf(step) >= i;
        return (
          <span
            key={id}
            className={`h-1.5 w-8 rounded-full transition-colors ${
              active ? "bg-uri-keaney" : "bg-white/15"
            }`}
          />
        );
      })}
    </div>
  );
}

/**
 * Character / avatar onboarding.
 * Username is collected only at signup; display name is collected in DisplayNameGate
 * before demographics. Role selection is handled by RoleSelectionGate.
 */
export function CharacterGate({
  prefillProfile,
  preserveExistingProgress = false,
  onReady,
}: {
  prefillProfile?: MeProfileRow | null;
  /** QA replay: walk the flow without wiping guild/XP/admin state. */
  preserveExistingProgress?: boolean;
  onReady: () => void;
}) {
  const [profile, setProfile] = useState<MeProfileRow | null>(prefillProfile ?? null);
  const [config, setConfig] = useState<AvatarConfig>(() => createDefaultAvatarConfig());
  const [selectedStarterId, setSelectedStarterId] = useState<string | null>(
    () => createDefaultAvatarConfig().presetId,
  );
  const [step, setStep] = useState<OnboardingStep>("avatar");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(!prefillProfile);
  const saveLockRef = useRef(false);

  useEffect(() => {
    if (!prefillProfile) return;
    setProfile(prefillProfile);
    setLoadingProfile(false);
    const stored = parseStoredAvatarConfig(
      prefillProfile.avatar_custom_json,
      prefillProfile.character_class_id,
    );
    if (stored) {
      setConfig(stored);
      if (stored.presetId) setSelectedStarterId(stored.presetId);
    }
  }, [prefillProfile]);

  useEffect(() => {
    if (prefillProfile) return;
    let cancelled = false;
    void (async () => {
      try {
        const row = await fetchAuthed<MeProfileRow>("/api/me/profile");
        if (cancelled) return;
        setProfile(row);
        const stored = parseStoredAvatarConfig(row.avatar_custom_json, row.character_class_id);
        if (stored) {
          setConfig(stored);
          if (stored.presetId) setSelectedStarterId(stored.presetId);
        }
      } catch {
        if (!cancelled) {
          setSubmitError("Could not load your profile. Refresh and try again.");
        }
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prefillProfile]);

  const identity = resolveCharacterGateIdentity(profile ?? {});
  const avatarJson = useMemo(() => serializeAvatarConfig(config), [config]);
  const canFinish =
    !loadingProfile &&
    identity.usernameValid &&
    identity.displayNameValid &&
    canCompleteAvatarOnboarding({
      displayName: identity.displayName,
      username: identity.username,
      config,
    });

  const selectStarter = useCallback(
    (presetSeed: string) => {
      const preset = AVATAR_LOOK_PRESETS.find((p) => p.seed === presetSeed);
      if (!preset) return;
      setSelectedStarterId(preset.seed);
      setConfig(avatarConfigFromPreset(preset, config.classType));
      setSubmitError(null);
    },
    [config.classType],
  );

  const handleRandomize = useCallback(() => {
    setConfig((prev) => randomizeAvatarConfig(prev));
    setSelectedStarterId(null);
  }, []);

  async function handleEnterCampusQuest() {
    if (!canFinish || saveLockRef.current) return;
    saveLockRef.current = true;
    setSaving(true);
    setSubmitError(null);
    const payloadConfig = config;
    const payloadName = identity.displayName;
    const payloadUsername = identity.username;
    try {
      const payload = preserveExistingProgress
        ? {
            displayName: payloadName,
            username: payloadUsername,
            avatarCustomJson: serializeAvatarConfig(payloadConfig),
            characterClassId: payloadConfig.classType,
            starterWeapon:
              CHARACTER_CLASSES.find((c) => c.id === payloadConfig.classType)?.starterWeapon ?? null,
            characterOnboardingComplete: true,
            preserveIdentityCooldownTimestamps: true,
          }
        : buildAvatarOnboardingSavePayload({
            displayName: payloadName,
            username: payloadUsername,
            config: payloadConfig,
            starterWeapon:
              CHARACTER_CLASSES.find((c) => c.id === payloadConfig.classType)?.starterWeapon ?? null,
          });

      await patchAuthed<MeProfileRow, Record<string, unknown>>("/api/me/profile", payload);
      const mergedProfile = await fetchAuthed<MeProfileRow>("/api/me/profile");
      const stats = await fetchAuthed<MeStatsRow>("/api/me/stats");
      replaceLocalCharacter(buildLocalCharacterFromServer(mergedProfile, stats), {
        skipRemoteSync: true,
      });
      resetUserSaveSyncAfterHydrate();
      onReady();
    } catch (err) {
      if (preserveExistingProgress) {
        onReady();
        return;
      }
      if (err instanceof ApiRequestError && err.status === 409) {
        // Should be rare: username is signup-owned. Surface error without reopening a username form.
        setSubmitError("Your signup username could not be confirmed. Sign out and try again, or contact support.");
      } else {
        setSubmitError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      }
      saveLockRef.current = false;
      setSaving(false);
    }
  }

  if (typeof window !== "undefined" && !getAccessToken()) {
    return (
      <p className="px-4 py-12 text-center text-sm text-white/70">Sign in to create your character.</p>
    );
  }

  return (
    <section className="cq-avatar-onboarding cq-avatar-onboarding--simple" aria-label="Create your avatar" data-testid="character-gate">
      <div className="cq-avatar-onboarding__shell">
        <header className="cq-avatar-onboarding__header">
          <CampusQuestLogo variant="drawer" className="mx-auto mb-3" priority />
          <StepDots step={step} />
        </header>

        <div className="cq-avatar-onboarding__controls cq-avatar-onboarding__controls--solo">
          {step === "avatar" ? (
            <div className="space-y-5" data-testid="step-avatar">
              <div className="text-center">
                <h1 className="font-display text-2xl font-bold text-white">Choose Your Avatar</h1>
                <p className="mt-1 text-sm text-white/60">
                  Pick a starter avatar. You can customize everything later.
                </p>
                {identity.usernameValid ? (
                  <p className="mt-2 font-mono text-sm text-uri-keaney/90">@{identity.username}</p>
                ) : null}
              </div>

              <div className="flex justify-center">
                <div
                  className="cq-simple-avatar-preview"
                  data-testid="avatar-live-preview"
                  key={avatarJson}
                >
                  <AvatarDisplay avatar={avatarJson} size={140} showProp={false} />
                </div>
              </div>

              <div
                className="cq-simple-starter-grid"
                role="radiogroup"
                aria-label="Starter avatars"
              >
                {AVATAR_LOOK_PRESETS.map((preset) => {
                  const selected = selectedStarterId === preset.seed;
                  const preview = serializeAvatarConfig(
                    avatarConfigFromPreset(preset, config.classType),
                  );
                  return (
                    <button
                      key={preset.seed}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={preset.label}
                      onClick={() => selectStarter(preset.seed)}
                      className={`cq-simple-starter-card ${
                        selected ? "cq-simple-starter-card--selected" : ""
                      }`}
                    >
                      {selected ? (
                        <span className="cq-starter-avatar-check" aria-hidden>
                          ✓
                        </span>
                      ) : null}
                      <div className="cq-simple-starter-thumb">
                        <AvatarDisplay avatar={preview} size={96} showProp={false} fitParent />
                      </div>
                      <span className="cq-simple-starter-label">{preset.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={handleRandomize}
                  className="cq-avatar-btn cq-avatar-btn--gold min-h-[48px] px-6"
                >
                  Randomize
                </button>
              </div>

              {submitError ? (
                <p className="text-sm text-amber-400" role="alert">
                  {submitError}
                </p>
              ) : null}
            </div>
          ) : null}

          {step === "ready" ? (
            <div className="space-y-6 text-center" data-testid="step-ready">
              <div className="flex justify-center">
                <div className="cq-simple-avatar-preview cq-simple-avatar-preview--hero" key={avatarJson}>
                  <AvatarDisplay avatar={avatarJson} size={160} showProp={false} />
                </div>
              </div>
              <div>
                <h1 className="font-display text-2xl font-bold text-white">You&apos;re Ready!</h1>
                <p className="mx-auto mt-2 max-w-sm text-sm text-white/65">
                  You can customize your avatar anytime from your profile.
                </p>
                <p className="mt-3 text-base font-semibold text-white">{identity.displayName}</p>
                <p className="font-mono text-sm text-uri-keaney/90">@{identity.username}</p>
              </div>
              {submitError ? (
                <p className="text-sm text-amber-400" role="alert">
                  {submitError}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="cq-avatar-onboarding__actions">
          {step === "ready" ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setSubmitError(null);
                setStep("avatar");
              }}
              className="cq-avatar-btn cq-avatar-btn--ghost min-h-[48px] flex-1"
            >
              Back
            </button>
          ) : (
            <span className="flex-1" />
          )}

          {step === "avatar" ? (
            <button
              type="button"
              disabled={saving || loadingProfile || !identity.usernameValid}
              onClick={() => setStep("ready")}
              className="cq-avatar-btn cq-avatar-btn--primary min-h-[48px] flex-[1.4]"
            >
              Continue
            </button>
          ) : null}

          {step === "ready" ? (
            <button
              type="button"
              disabled={!canFinish || saving}
              onClick={() => void handleEnterCampusQuest()}
              className="cq-avatar-btn cq-avatar-btn--primary min-h-[48px] flex-[1.4]"
              data-testid="enter-campusquest"
            >
              {saving ? "Saving…" : "Enter CampusQuest"}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
