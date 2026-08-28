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
  pickRandomStarterPreset,
  serializeAvatarConfig,
  starterPresetIdForConfig,
} from "@/lib/avatarConfig";
import { AVATAR_LOOK_PRESETS } from "@/lib/avatarPresets";
import { CHARACTER_CLASSES } from "@/lib/characterClasses";
import { AvatarDisplay } from "./AvatarDisplay";
import { ApiRequestError, fetchAuthed, patchAuthed } from "@/lib/client/dashboardApi";
import { trackOnboardingEvent } from "@/lib/client/onboardingAnalytics";
import { resetUserSaveSyncAfterHydrate } from "@/lib/client/gameStateSync";
import { buildLocalCharacterFromServer, type MeProfileRow, type MeStatsRow } from "@/lib/client/profileCharacter";
import { resolveCharacterGateIdentity } from "@/lib/client/characterGateIdentity";
import { CampusQuestLogo } from "@/components/CampusQuestLogo";

type OnboardingStep = "avatar" | "ready";

const STARTER_PREVIEW_COUNT = 4;

function StepDots({ step }: { step: OnboardingStep }) {
  const order: OnboardingStep[] = ["avatar", "ready"];
  return (
    <div className="flex items-center justify-center gap-2" aria-label="Avatar setup progress">
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

function StarterAvatarGrid({
  selectedStarterId,
  classType,
  expanded,
  onSelect,
  onToggleMore,
}: {
  selectedStarterId: string | null;
  classType: AvatarConfig["classType"];
  expanded: boolean;
  onSelect: (seed: string) => void;
  onToggleMore: () => void;
}) {
  const selectedHidden =
    Boolean(selectedStarterId) &&
    !AVATAR_LOOK_PRESETS.slice(0, STARTER_PREVIEW_COUNT).some((preset) => preset.seed === selectedStarterId);
  const showingAll = expanded || selectedHidden;
  const visible = showingAll ? AVATAR_LOOK_PRESETS : AVATAR_LOOK_PRESETS.slice(0, STARTER_PREVIEW_COUNT);
  const hasMore = AVATAR_LOOK_PRESETS.length > STARTER_PREVIEW_COUNT;

  return (
    <div>
      <div className="cq-simple-starter-grid cq-simple-starter-grid--compact" role="radiogroup" aria-label="Starter avatars">
        {visible.map((preset) => {
          const selected = selectedStarterId === preset.seed;
          const preview = serializeAvatarConfig(avatarConfigFromPreset(preset, classType));
          return (
            <button
              key={preset.seed}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={preset.label}
              onClick={() => onSelect(preset.seed)}
              className={`cq-simple-starter-card cq-simple-starter-card--compact ${
                selected ? "cq-simple-starter-card--selected" : ""
              }`}
            >
              {selected ? (
                <span className="cq-starter-avatar-check" aria-hidden>
                  ✓
                </span>
              ) : null}
              <div className="cq-simple-starter-thumb cq-simple-starter-thumb--compact">
                <AvatarDisplay avatar={preview} size={72} showProp={false} fitParent />
              </div>
              <span className="cq-simple-starter-label">{preset.label}</span>
            </button>
          );
        })}
      </div>
      {hasMore ? (
        <div className="mt-3 flex justify-center">
          <button type="button" className="cq-avatar-more-btn" onClick={onToggleMore}>
            {showingAll ? "Show fewer avatars" : "More avatars"}
          </button>
        </div>
      ) : null}
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
  const [showMoreAvatars, setShowMoreAvatars] = useState(false);
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
      setSelectedStarterId(starterPresetIdForConfig(stored));
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
          setSelectedStarterId(starterPresetIdForConfig(stored));
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
    const preset = pickRandomStarterPreset(selectedStarterId);
    selectStarter(preset.seed);
  }, [selectedStarterId, selectStarter]);

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
      trackOnboardingEvent({ eventName: "onboarding_avatar_completed" });
      trackOnboardingEvent({ eventName: "onboarding_completed" });
      onReady();
    } catch (err) {
      if (preserveExistingProgress) {
        onReady();
        return;
      }
      if (err instanceof ApiRequestError && err.status === 409) {
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
    <section
      className="cq-avatar-onboarding cq-avatar-onboarding--simple cq-avatar-onboarding--from-demographics"
      aria-label="Create your avatar"
      data-testid="character-gate"
    >
      <div className="cq-avatar-onboarding__shell">
        <header className="cq-avatar-onboarding__header">
          <CampusQuestLogo variant="drawer" className="mx-auto mb-3" priority />
          <StepDots step={step} />
        </header>

        <div className="cq-avatar-onboarding__controls cq-avatar-onboarding__controls--solo">
          {step === "avatar" ? (
            <div className="space-y-4" data-testid="step-avatar">
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
                <div className="cq-simple-avatar-preview" data-testid="avatar-live-preview" key={avatarJson}>
                  <AvatarDisplay avatar={avatarJson} size={140} showProp={false} />
                </div>
              </div>

              <StarterAvatarGrid
                selectedStarterId={selectedStarterId}
                classType={config.classType}
                expanded={showMoreAvatars}
                onSelect={selectStarter}
                onToggleMore={() => setShowMoreAvatars((open) => !open)}
              />

              {submitError ? (
                <p className="text-sm text-amber-400" role="alert">
                  {submitError}
                </p>
              ) : null}
            </div>
          ) : null}

          {step === "ready" ? (
            <div className="space-y-5 text-center" data-testid="step-ready">
              <h1 className="font-display text-3xl font-bold text-white">You&apos;re in.</h1>
              <div className="flex justify-center">
                <div className="cq-simple-avatar-preview cq-simple-avatar-preview--hero" key={avatarJson}>
                  <AvatarDisplay avatar={avatarJson} size={160} showProp={false} />
                </div>
              </div>
              <div>
                <p className="text-base font-semibold text-white">{identity.displayName}</p>
                <p className="font-mono text-sm text-uri-keaney/90">@{identity.username}</p>
                <p className="mx-auto mt-3 max-w-sm text-sm text-white/65">Your campus is waiting.</p>
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
          {step === "avatar" ? (
            <>
              <button type="button" onClick={handleRandomize} className="cq-avatar-btn cq-avatar-btn--gold min-h-[48px] flex-1">
                Randomize
              </button>
              <button
                type="button"
                disabled={saving || loadingProfile || !identity.usernameValid}
                onClick={() => setStep("ready")}
                className="cq-avatar-btn cq-avatar-btn--primary min-h-[48px] flex-[1.6]"
              >
                Continue
              </button>
            </>
          ) : null}

          {step === "ready" ? (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setSubmitError(null);
                  setStep("avatar");
                }}
                className="cq-avatar-btn cq-avatar-btn--ghost cq-avatar-btn--edit min-h-[44px]"
              >
                Edit avatar
              </button>
              <button
                type="button"
                disabled={!canFinish || saving}
                onClick={() => void handleEnterCampusQuest()}
                className="cq-avatar-btn cq-avatar-btn--primary min-h-[48px] flex-[2]"
                data-testid="enter-campusquest"
              >
                {saving ? "Saving…" : "Enter CampusQuest"}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
