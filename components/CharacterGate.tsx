"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Briefcase, Check, GraduationCap } from "lucide-react";
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
import { ApiRequestError, fetchAuthed, patchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import { resetUserSaveSyncAfterHydrate } from "@/lib/client/gameStateSync";
import { buildLocalCharacterFromServer, type MeProfileRow, type MeStatsRow } from "@/lib/client/profileCharacter";
import { CampusQuestLogo } from "@/components/CampusQuestLogo";
import { hasValidRoleSelection, type SelectableRole } from "@/lib/roles";

const USERNAME_REGEX = /^[a-z0-9_]+$/;
const USERNAME_MAX = 25;
const NAME_MAX = 40;

type OnboardingStep = "identity" | "avatar" | "ready";

type AccountTypeResponse = {
  profile: MeProfileRow;
  role: string;
  selectedRole: SelectableRole;
  roleLabel: string;
};

function toUsername(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, USERNAME_MAX);
}

const ROLE_OPTIONS: {
  role: SelectableRole;
  title: string;
  description: string;
  Icon: typeof GraduationCap;
}[] = [
  {
    role: "student",
    title: "Student",
    description: "Discover events, join orgs, and explore CampusQuest.",
    Icon: GraduationCap,
  },
  {
    role: "faculty_staff",
    title: "Faculty / Staff",
    description: "Share opportunities and support students on campus.",
    Icon: Briefcase,
  },
];

function StepDots({ step }: { step: OnboardingStep }) {
  const order: OnboardingStep[] = ["identity", "avatar", "ready"];
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
  preserveExistingProgress = false,
  onReady,
}: {
  prefillProfile?: MeProfileRow | null;
  /** QA replay: walk the flow without wiping guild/XP/admin state. */
  preserveExistingProgress?: boolean;
  onReady: () => void;
}) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [accountRole, setAccountRole] = useState<SelectableRole | null>(null);
  const [needsRolePick, setNeedsRolePick] = useState(true);
  const [config, setConfig] = useState<AvatarConfig>(() => createDefaultAvatarConfig());
  const [selectedStarterId, setSelectedStarterId] = useState<string | null>(
    () => createDefaultAvatarConfig().presetId,
  );
  const [step, setStep] = useState<OnboardingStep>("identity");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [identitySaving, setIdentitySaving] = useState(false);
  const saveLockRef = useRef(false);

  useEffect(() => {
    if (!prefillProfile) return;
    setName(prefillProfile.display_name?.trim() || "");
    setUsername(toUsername(prefillProfile.username ?? ""));
    const hasRole = hasValidRoleSelection(prefillProfile);
    setNeedsRolePick(!hasRole);
    if (hasRole) {
      const chosen =
        prefillProfile.is_test_user === true || prefillProfile.role === "qa"
          ? prefillProfile.qa_selected_role
          : prefillProfile.role;
      if (chosen === "student" || chosen === "faculty_staff") {
        setAccountRole(chosen);
      }
    }
    const stored = parseStoredAvatarConfig(
      prefillProfile.avatar_custom_json,
      prefillProfile.character_class_id,
    );
    if (stored) {
      setConfig(stored);
      if (stored.presetId) setSelectedStarterId(stored.presetId);
    }
  }, [prefillProfile]);

  const nameTrimmed = name.trim();
  const usernameNormalized = toUsername(username || nameTrimmed);
  const nameValid = nameTrimmed.length >= 1 && nameTrimmed.length <= NAME_MAX;
  const usernameValid =
    usernameNormalized.length >= 3 &&
    usernameNormalized.length <= USERNAME_MAX &&
    USERNAME_REGEX.test(usernameNormalized);
  const roleValid = !needsRolePick || accountRole != null;
  const canContinueIdentity = nameValid && usernameValid && roleValid;

  const avatarJson = useMemo(() => serializeAvatarConfig(config), [config]);
  const canFinish = canCompleteAvatarOnboarding({
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

  async function handleIdentityContinue() {
    if (!canContinueIdentity || identitySaving) return;
    setIdentitySaving(true);
    setSubmitError(null);
    try {
      if (needsRolePick && accountRole && !preserveExistingProgress) {
        const result = await postAuthed<AccountTypeResponse, { role: SelectableRole }>(
          "/api/me/account-type",
          { role: accountRole },
        );
        if (!result?.profile) {
          throw new Error("Your account type could not be confirmed. Please try again.");
        }
        setNeedsRolePick(false);
      }
      setStep("avatar");
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 503) {
        setSubmitError("Account types are not available yet. Please try again in a moment.");
      } else {
        setSubmitError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      }
    } finally {
      setIdentitySaving(false);
    }
  }

  async function handleEnterCampusQuest() {
    if (!canFinish || saveLockRef.current) return;
    saveLockRef.current = true;
    setSaving(true);
    setSubmitError(null);
    const payloadConfig = config;
    const payloadName = nameTrimmed;
    const payloadUsername = usernameNormalized;
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
        setSubmitError("That username is already taken. Pick another.");
        setStep("identity");
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
          {step === "identity" ? (
            <div className="space-y-5" data-testid="step-identity">
              <div className="text-center">
                <h1 className="font-display text-2xl font-bold text-white">Welcome to CampusQuest</h1>
                <p className="mt-1 text-sm text-white/60">A few quick details and you’re in.</p>
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
                    onChange={(e) => {
                      setUsername(toUsername(e.target.value));
                      setSubmitError(null);
                    }}
                    placeholder="e.g. alex_rhody"
                    maxLength={USERNAME_MAX}
                    autoComplete="username"
                    className="cq-avatar-input font-mono text-sm"
                    aria-required
                  />
                  <p className="text-xs text-white/45">
                    You’ll appear as @{usernameNormalized || "username"}
                  </p>
                </div>
              </div>

              {needsRolePick ? (
                <div className="space-y-2" role="radiogroup" aria-label="Student or Faculty / Staff">
                  <p className="text-xs font-semibold uppercase tracking-wider text-white/70">
                    I am a… <span className="text-amber-400">*</span>
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {ROLE_OPTIONS.map(({ role, title, description, Icon }) => {
                      const selected = accountRole === role;
                      return (
                        <button
                          key={role}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => {
                            setAccountRole(role);
                            setSubmitError(null);
                          }}
                          className={`relative min-h-[44px] rounded-2xl border p-4 text-left transition-colors ${
                            selected
                              ? "border-uri-keaney bg-uri-keaney/15"
                              : "border-white/15 bg-white/[0.04] hover:border-uri-keaney/40"
                          }`}
                        >
                          {selected ? (
                            <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-uri-keaney text-uri-navy">
                              <Check className="h-3.5 w-3.5" strokeWidth={3} />
                            </span>
                          ) : null}
                          <span className="flex items-start gap-3">
                            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-uri-keaney" />
                            <span>
                              <span className="block font-semibold text-white">{title}</span>
                              <span className="mt-0.5 block text-xs text-white/55">{description}</span>
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {submitError ? (
                <p className="text-sm text-amber-400" role="alert">
                  {submitError}
                </p>
              ) : null}
            </div>
          ) : null}

          {step === "avatar" ? (
            <div className="space-y-5" data-testid="step-avatar">
              <div className="text-center">
                <h1 className="font-display text-2xl font-bold text-white">Choose Your Avatar</h1>
                <p className="mt-1 text-sm text-white/60">
                  Pick a starter avatar. You can customize everything later.
                </p>
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
                <p className="mt-3 text-base font-semibold text-white">{nameTrimmed}</p>
                <p className="font-mono text-sm text-uri-keaney/90">@{usernameNormalized}</p>
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
          {step !== "identity" ? (
            <button
              type="button"
              disabled={saving || identitySaving}
              onClick={() => {
                setSubmitError(null);
                if (step === "ready") setStep("avatar");
                else setStep("identity");
              }}
              className="cq-avatar-btn cq-avatar-btn--ghost min-h-[48px] flex-1"
            >
              Back
            </button>
          ) : (
            <span className="flex-1" />
          )}

          {step === "identity" ? (
            <button
              type="button"
              disabled={!canContinueIdentity || identitySaving}
              onClick={() => void handleIdentityContinue()}
              className="cq-avatar-btn cq-avatar-btn--primary min-h-[48px] flex-[1.4]"
            >
              {identitySaving ? "Saving…" : "Continue"}
            </button>
          ) : null}

          {step === "avatar" ? (
            <button
              type="button"
              disabled={saving}
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
