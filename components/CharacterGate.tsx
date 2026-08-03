"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { replaceLocalCharacter } from "@/lib/store";
import { getAccessToken } from "@/lib/client/apiSession";
import {
  type AvatarConfig,
  type AvatarManualOverrides,
  applyClassToAvatarConfig,
  avatarConfigFromPreset,
  buildAvatarOnboardingSavePayload,
  canCompleteAvatarOnboarding,
  clearOverrides,
  createDefaultAvatarConfig,
  markAllAppearanceOverrides,
  parseStoredAvatarConfig,
  randomizeAvatarConfig,
  resetAvatarConfigToStarter,
  serializeAvatarConfig,
} from "@/lib/avatarConfig";
import { AVATAR_LOOK_PRESETS } from "@/lib/avatarPresets";
import {
  CHARACTER_CLASSES,
  getClassAvatarPreset,
  getClassTitle,
  type CharacterClassId,
} from "@/lib/characterClasses";
import { AvatarDisplay } from "./AvatarDisplay";
import { AvatarLivePreview } from "@/components/avatar/AvatarLivePreview";
import { AdvancedAvatarEditor } from "@/components/avatar/AdvancedAvatarEditor";
import { ApiRequestError, fetchAuthed, patchAuthed } from "@/lib/client/dashboardApi";
import { resetUserSaveSyncAfterHydrate } from "@/lib/client/gameStateSync";
import { buildLocalCharacterFromServer, type MeProfileRow, type MeStatsRow } from "@/lib/client/profileCharacter";
import { CampusQuestLogo } from "@/components/CampusQuestLogo";

const USERNAME_REGEX = /^[a-z0-9_]+$/;
const USERNAME_MAX = 25;
const NAME_MAX = 40;

type OnboardingStep = "starter" | "vibe" | "review";

function toUsername(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, USERNAME_MAX);
}

function StepDots({ step }: { step: OnboardingStep }) {
  const order: OnboardingStep[] = ["starter", "vibe", "review"];
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

export function CharacterGate({
  prefillProfile,
  onReady,
}: {
  prefillProfile?: MeProfileRow | null;
  onReady: () => void;
}) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [config, setConfig] = useState<AvatarConfig>(() => createDefaultAvatarConfig());
  const [overrides, setOverrides] = useState<AvatarManualOverrides>(() => clearOverrides());
  const [selectedStarterId, setSelectedStarterId] = useState<string | null>(
    () => createDefaultAvatarConfig().presetId,
  );
  const [step, setStep] = useState<OnboardingStep>("starter");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const saveLockRef = useRef(false);

  useEffect(() => {
    if (!prefillProfile) return;
    setName(prefillProfile.display_name?.trim() || "");
    setUsername(toUsername(prefillProfile.username ?? ""));
    const stored = parseStoredAvatarConfig(
      prefillProfile.avatar_custom_json,
      prefillProfile.character_class_id,
    );
    if (stored) {
      setConfig(stored);
      setOverrides(clearOverrides());
    } else if (
      prefillProfile.character_class_id &&
      CHARACTER_CLASSES.some((c) => c.id === prefillProfile.character_class_id)
    ) {
      setConfig(
        applyClassToAvatarConfig(
          createDefaultAvatarConfig(),
          prefillProfile.character_class_id as CharacterClassId,
          {},
        ),
      );
    }
  }, [prefillProfile]);

  const accountType =
    prefillProfile?.is_test_user === true || prefillProfile?.role === "qa"
      ? prefillProfile?.qa_selected_role
      : prefillProfile?.role;
  const roleWelcomeCopy =
    accountType === "faculty_staff"
      ? "You'll use this identity to share opportunities, create events, and support students across campus."
      : "You'll use this identity to discover events, join organizations, take on quests, and earn XP.";

  const nameTrimmed = name.trim();
  const usernameNormalized = toUsername(username || nameTrimmed);
  const nameValid = nameTrimmed.length >= 1 && nameTrimmed.length <= NAME_MAX;
  const usernameValid =
    usernameNormalized.length >= 3 &&
    usernameNormalized.length <= USERNAME_MAX &&
    USERNAME_REGEX.test(usernameNormalized);

  const avatarJson = useMemo(() => serializeAvatarConfig(config), [config]);
  const canSubmit = canCompleteAvatarOnboarding({
    displayName: nameTrimmed,
    username: usernameNormalized,
    config,
  });

  const handleNameChange = useCallback(
    (value: string) => {
      const next = value.slice(0, NAME_MAX);
      setName(next);
      setSubmitError(null);
      if (!username) setUsername(toUsername(next));
    },
    [username],
  );

  const handleUsernameChange = useCallback((value: string) => {
    setUsername(toUsername(value));
    setSubmitError(null);
  }, []);

  const selectStarter = useCallback(
    (presetSeed: string) => {
      const preset = AVATAR_LOOK_PRESETS.find((p) => p.seed === presetSeed);
      if (!preset) return;
      setSelectedStarterId(preset.seed);
      setConfig(avatarConfigFromPreset(preset, config.classType));
      setOverrides(clearOverrides());
      setSubmitError(null);
    },
    [config.classType],
  );

  const selectVibe = useCallback(
    (classId: CharacterClassId) => {
      setConfig((prev) => applyClassToAvatarConfig(prev, classId, overrides));
      setSubmitError(null);
    },
    [overrides],
  );

  const handleRandomize = useCallback(() => {
    setConfig((prev) => randomizeAvatarConfig(prev));
    setOverrides(markAllAppearanceOverrides());
  }, []);

  const handleReset = useCallback(() => {
    const starterId = selectedStarterId;
    if (starterId) {
      const preset = AVATAR_LOOK_PRESETS.find((p) => p.seed === starterId);
      if (preset) {
        setConfig((prev) => avatarConfigFromPreset(preset, prev.classType));
        setOverrides(clearOverrides());
        return;
      }
    }
    setConfig((prev) => resetAvatarConfigToStarter({ ...prev, presetId: starterId }));
    setOverrides(clearOverrides());
  }, [selectedStarterId]);

  const handleAdvancedChange = useCallback(
    (next: { config: AvatarConfig; overrides: AvatarManualOverrides }) => {
      setConfig(next.config);
      setOverrides(next.overrides);
      if (next.config.presetId) setSelectedStarterId(next.config.presetId);
    },
    [],
  );

  async function handleEnterCampusQuest() {
    if (!canSubmit || saveLockRef.current) return;
    saveLockRef.current = true;
    setSaving(true);
    setSubmitError(null);
    // Capture current selections so a failed save never wipes UI state.
    const payloadConfig = config;
    const payloadName = nameTrimmed;
    const payloadUsername = usernameNormalized;
    try {
      await patchAuthed<MeProfileRow, Record<string, unknown>>(
        "/api/me/profile",
        buildAvatarOnboardingSavePayload({
          displayName: payloadName,
          username: payloadUsername,
          config: payloadConfig,
          starterWeapon:
            CHARACTER_CLASSES.find((c) => c.id === payloadConfig.classType)?.starterWeapon ?? null,
        }),
      );
      const mergedProfile = await fetchAuthed<MeProfileRow>("/api/me/profile");
      const stats = await fetchAuthed<MeStatsRow>("/api/me/stats");
      replaceLocalCharacter(buildLocalCharacterFromServer(mergedProfile, stats), {
        skipRemoteSync: true,
      });
      resetUserSaveSyncAfterHydrate();
      onReady();
    } catch (err) {
      // Preserve config/name/username on failure (state untouched above).
      if (err instanceof ApiRequestError && err.status === 409) {
        setSubmitError("That username is already taken. Pick another.");
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

  const stickyPreview = (
    <AvatarLivePreview
      config={config}
      displayName={nameTrimmed || undefined}
      username={usernameNormalized || undefined}
      size={step === "review" ? "hero" : "default"}
      className="cq-avatar-sticky-preview"
    />
  );

  return (
    <section className="cq-avatar-onboarding" aria-label="Create your avatar" data-testid="character-gate">
      <div className="cq-avatar-onboarding__shell">
        <header className="cq-avatar-onboarding__header">
          <CampusQuestLogo variant="drawer" className="mx-auto mb-3" priority />
          <StepDots step={step} />
          <h1 className="mt-4 font-display text-2xl font-bold text-white sm:text-[1.75rem]">
            Create Your Avatar
          </h1>
          <p className="mt-1 text-sm text-white/60">
            Choose a starter look. You can customize everything later.
          </p>
          <p className="mt-1 text-xs text-white/40">{roleWelcomeCopy}</p>
        </header>

        <div className="cq-avatar-onboarding__layout">
          <aside className="cq-avatar-onboarding__preview-col" aria-label="Live avatar preview">
            {stickyPreview}
          </aside>

          <div className="cq-avatar-onboarding__controls">
            {step === "starter" ? (
              <div className="space-y-4" data-testid="step-starter">
                <div>
                  <h2 className="text-lg font-semibold text-white">Choose a starter avatar</h2>
                  <p className="text-sm text-white/55">Tap a look — your preview updates instantly.</p>
                </div>

                <div
                  className="cq-starter-avatar-grid"
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
                        className={`cq-starter-avatar-card ${
                          selected ? "cq-starter-avatar-card--selected" : ""
                        }`}
                      >
                        {selected ? (
                          <span className="cq-starter-avatar-check" aria-hidden>
                            ✓
                          </span>
                        ) : null}
                        <div className="cq-starter-avatar-thumb">
                          <AvatarDisplay avatar={preview} size={72} showProp={false} fitParent />
                        </div>
                        <span className="cq-starter-avatar-label">{preset.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleRandomize}
                    className="cq-avatar-btn cq-avatar-btn--gold min-h-[44px]"
                  >
                    Randomize
                  </button>
                  {!advancedOpen ? (
                    <button
                      type="button"
                      onClick={() => setAdvancedOpen(true)}
                      className="cq-avatar-btn cq-avatar-btn--ghost min-h-[44px]"
                      data-testid="customize-more-open"
                    >
                      Customize More
                    </button>
                  ) : null}
                </div>
                <AdvancedAvatarEditor
                  config={config}
                  overrides={overrides}
                  open={advancedOpen}
                  onOpenChange={setAdvancedOpen}
                  starterPresetId={selectedStarterId}
                  onChange={handleAdvancedChange}
                />
              </div>
            ) : null}

            {step === "vibe" ? (
              <div className="space-y-4" data-testid="step-vibe">
                <div>
                  <h2 className="text-lg font-semibold text-white">Choose Your Campus Style</h2>
                  <p className="text-sm text-white/55">
                    Pick a vibe. Your avatar preview updates right away.
                  </p>
                </div>

                <div className="cq-vibe-grid" role="radiogroup" aria-label="Campus style">
                  {CHARACTER_CLASSES.map((cls) => {
                    const selected = config.classType === cls.id;
                    return (
                      <button
                        key={cls.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={`${cls.outfitLabel}: ${cls.vibeDescription}`}
                        onClick={() => selectVibe(cls.id)}
                        className={`cq-vibe-card ${selected ? "cq-vibe-card--selected" : ""}`}
                      >
                        {selected ? (
                          <span className="cq-starter-avatar-check" aria-hidden>
                            ✓
                          </span>
                        ) : null}
                        <div className="flex items-start gap-3">
                          <span className="text-2xl" aria-hidden>
                            {cls.icon}
                          </span>
                          <div className="min-w-0 flex-1 text-left">
                            <p className="font-semibold text-white">{cls.outfitLabel}</p>
                            <p className="text-xs text-white/55">{cls.vibeDescription}</p>
                          </div>
                          <div className="shrink-0 rounded-xl border border-white/10 bg-black/25 p-1">
                            <AvatarDisplay
                              avatar={
                                selected
                                  ? avatarJson
                                  : getClassAvatarPreset(cls.id)
                              }
                              size={44}
                              showProp={false}
                            />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleRandomize}
                    className="cq-avatar-btn cq-avatar-btn--gold min-h-[44px]"
                  >
                    Randomize
                  </button>
                  {!advancedOpen ? (
                    <button
                      type="button"
                      onClick={() => setAdvancedOpen(true)}
                      className="cq-avatar-btn cq-avatar-btn--ghost min-h-[44px]"
                      data-testid="customize-more-open"
                    >
                      Customize More
                    </button>
                  ) : null}
                </div>
                <AdvancedAvatarEditor
                  config={config}
                  overrides={overrides}
                  open={advancedOpen}
                  onOpenChange={setAdvancedOpen}
                  starterPresetId={selectedStarterId}
                  onChange={handleAdvancedChange}
                />
              </div>
            ) : null}

            {step === "review" ? (
              <div className="space-y-5" data-testid="step-review">
                <div>
                  <h2 className="text-lg font-semibold text-white">Looking good</h2>
                  <p className="text-sm text-white/55">Confirm your identity and enter CampusQuest.</p>
                </div>

                <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-white/50">
                      Campus style
                    </p>
                    <button
                      type="button"
                      onClick={() => setStep("vibe")}
                      className="text-xs font-semibold text-uri-keaney hover:underline min-h-[44px] px-2"
                    >
                      Edit
                    </button>
                  </div>
                  <p className="text-base font-semibold text-white">
                    {CHARACTER_CLASSES.find((c) => c.id === config.classType)?.icon}{" "}
                    {getClassTitle(config.classType)}
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="space-y-2">
                    <label
                      htmlFor="char-name"
                      className="block text-xs font-semibold uppercase tracking-wider text-white/70"
                    >
                      Display name <span className="text-amber-400">*</span>
                    </label>
                    <input
                      id="char-name"
                      type="text"
                      value={name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="e.g. Alex"
                      maxLength={NAME_MAX}
                      autoComplete="name"
                      className="cq-avatar-input"
                      aria-required
                      aria-invalid={name.length > 0 && !nameValid}
                    />
                  </div>
                  <div className="space-y-2">
                    <label
                      htmlFor="char-username"
                      className="block text-xs font-semibold uppercase tracking-wider text-white/70"
                    >
                      Username <span className="text-amber-400">*</span>
                    </label>
                    <input
                      id="char-username"
                      type="text"
                      value={username}
                      onChange={(e) => handleUsernameChange(e.target.value)}
                      placeholder="e.g. alex_rhody"
                      maxLength={USERNAME_MAX}
                      autoComplete="username"
                      className="cq-avatar-input font-mono text-sm"
                      aria-required
                      aria-invalid={usernameNormalized.length > 0 && !usernameValid}
                    />
                    <p className="text-xs text-white/45">
                      You’ll appear as @{usernameNormalized || "username"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleRandomize}
                    className="cq-avatar-btn cq-avatar-btn--gold min-h-[44px]"
                  >
                    Randomize
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="cq-avatar-btn cq-avatar-btn--ghost min-h-[44px]"
                  >
                    Reset
                  </button>
                  {!advancedOpen ? (
                    <button
                      type="button"
                      onClick={() => setAdvancedOpen(true)}
                      className="cq-avatar-btn cq-avatar-btn--ghost min-h-[44px]"
                      data-testid="customize-more-open"
                    >
                      Customize More
                    </button>
                  ) : null}
                </div>
                <AdvancedAvatarEditor
                  config={config}
                  overrides={overrides}
                  open={advancedOpen}
                  onOpenChange={setAdvancedOpen}
                  starterPresetId={selectedStarterId}
                  onChange={handleAdvancedChange}
                />

                {submitError ? (
                  <p className="text-sm text-amber-400" role="alert">
                    {submitError}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="cq-avatar-onboarding__actions">
          <button
            type="button"
            disabled={step === "starter" || saving}
            onClick={() => {
              if (step === "review") setStep("vibe");
              else if (step === "vibe") {
                setAdvancedOpen(false);
                setStep("starter");
              }
            }}
            className="cq-avatar-btn cq-avatar-btn--ghost min-h-[48px] flex-1"
          >
            Back
          </button>
          {step === "review" ? (
            <button
              type="button"
              disabled={!canSubmit || saving}
              onClick={() => void handleEnterCampusQuest()}
              className="cq-avatar-btn cq-avatar-btn--primary min-h-[48px] flex-[1.4]"
              data-testid="enter-campusquest"
            >
              {saving ? "Saving…" : "Enter CampusQuest"}
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setAdvancedOpen(false);
                if (step === "starter") setStep("vibe");
                else setStep("review");
              }}
              className="cq-avatar-btn cq-avatar-btn--primary min-h-[48px] flex-[1.4]"
            >
              Continue
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
