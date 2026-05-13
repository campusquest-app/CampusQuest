"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { replaceLocalCharacter } from "@/lib/store";
import { getAccessToken } from "@/lib/client/apiSession";
import { getDefaultCustomAvatar, serializeAvatar } from "@/lib/avatarOptions";
import { CHARACTER_CLASSES, getClassAvatarPreset, type CharacterClassId } from "@/lib/characterClasses";
import { AvatarBuilder } from "./AvatarBuilder";
import { AvatarDisplay } from "./AvatarDisplay";
import { ApiRequestError, fetchAuthed, patchAuthed } from "@/lib/client/dashboardApi";
import { resetUserSaveSyncAfterHydrate } from "@/lib/client/gameStateSync";
import { buildLocalCharacterFromServer, type MeProfileRow, type MeStatsRow } from "@/lib/client/profileCharacter";

const USERNAME_REGEX = /^[a-z0-9_]+$/;
const USERNAME_MAX = 25;
const NAME_MAX = 40;

function toUsername(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, USERNAME_MAX);
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
  const [avatar, setAvatar] = useState(() => serializeAvatar(getDefaultCustomAvatar()));
  const [classId, setClassId] = useState<CharacterClassId | null>(null);
  const [starterWeapon, setStarterWeapon] = useState<string | null>(null);
  const [scholarGuildId, setScholarGuildId] = useState<string>("undecided");
  const [showConfirm, setShowConfirm] = useState(false);
  const [step, setStep] = useState<"info" | "avatar">("info");
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!prefillProfile) return;
    const hasClassPreset =
      prefillProfile.character_class_id &&
      CHARACTER_CLASSES.some((c) => c.id === prefillProfile.character_class_id);
    const nextGuild = prefillProfile.scholar_guild_id?.trim() || "undecided";
    setName(prefillProfile.display_name?.trim() || "");
    setUsername(toUsername(prefillProfile.username ?? ""));
    if (prefillProfile.avatar_custom_json?.trim()) {
      setAvatar(prefillProfile.avatar_custom_json.trim());
    }
    setScholarGuildId(nextGuild);
    if (hasClassPreset && prefillProfile.character_class_id) {
      const cid = prefillProfile.character_class_id as CharacterClassId;
      const cls = CHARACTER_CLASSES.find((c) => c.id === cid);
      setClassId(cid);
      setStarterWeapon(cls?.starterWeapon ?? prefillProfile.starter_weapon ?? null);
    }
  }, [prefillProfile]);

  const nameTrimmed = name.trim();
  const usernameNormalized = toUsername(username || nameTrimmed);
  const nameValid = nameTrimmed.length >= 1 && nameTrimmed.length <= NAME_MAX;
  const usernameValid =
    usernameNormalized.length >= 3 &&
    usernameNormalized.length <= USERNAME_MAX &&
    USERNAME_REGEX.test(usernameNormalized);

  const canSubmit = nameValid && usernameValid && avatar.length > 0;
  const starterAvatars = CHARACTER_CLASSES.slice(0, 5).map((cls) => ({
    id: cls.id,
    label: cls.name,
    icon: cls.icon,
    avatar: getClassAvatarPreset(cls.id),
  }));

  const handleNameChange = useCallback((value: string) => {
    const next = value.slice(0, NAME_MAX);
    setName(next);
    setSubmitError(null);
    if (!username) setUsername(toUsername(next));
  }, [username]);

  const handleUsernameChange = useCallback((value: string) => {
    setUsername(toUsername(value));
    setSubmitError(null);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!nameValid || !usernameValid) return;
    setStep("avatar");
  }

  async function handleConfirm() {
    if (!canSubmit) return;
    setSubmitError(null);
    try {
      const mergedProfile = await patchAuthed<MeProfileRow, Record<string, unknown>>("/api/me/profile", {
        displayName: nameTrimmed,
        username: usernameNormalized,
        avatarCustomJson: avatar,
        characterClassId: classId ?? null,
        starterWeapon: starterWeapon ?? null,
        scholarGuildId: scholarGuildId || null,
        characterOnboardingComplete: true,
      });
      const stats = await fetchAuthed<MeStatsRow>("/api/me/stats");
      replaceLocalCharacter(buildLocalCharacterFromServer(mergedProfile, stats), { skipRemoteSync: true });
      resetUserSaveSyncAfterHydrate();
      setShowConfirm(false);
      onReady();
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409) {
        setSubmitError("That username is already taken. Pick another.");
        return;
      }
      setSubmitError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    }
  }

  if (typeof window !== "undefined" && !getAccessToken()) {
    return (
      <p className="text-center text-sm text-white/70 py-12 px-4">Sign in to create your character.</p>
    );
  }

  const confirmModal =
    showConfirm &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-character-title"
      >
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowConfirm(false)}
          aria-hidden
        />
        <div className="relative z-10 w-full max-w-sm rounded-2xl border border-white/15 bg-uri-navy shadow-xl p-6 text-center">
          <h2 id="confirm-character-title" className="font-display font-bold text-lg text-white mb-2">
            Create this character?
          </h2>
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-2xl bg-white/10 border border-uri-keaney/30 flex items-center justify-center overflow-hidden">
              <AvatarDisplay avatar={avatar} size={64} />
            </div>
          </div>
          <p className="text-white/90 font-medium">{nameTrimmed}</p>
          <p className="text-sm text-uri-keaney/90">@{usernameNormalized}</p>
          {submitError && (
            <p className="mt-2 text-sm text-amber-400" role="alert">
              {submitError}
            </p>
          )}
          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              className="flex-1 py-2.5 rounded-xl font-medium text-white/80 bg-white/10 border border-white/15 hover:bg-white/15"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm()}
              className="flex-1 py-2.5 rounded-xl font-semibold text-white bg-uri-keaney hover:bg-uri-keaney/90 focus:outline-none focus:ring-2 focus:ring-uri-keaney focus:ring-offset-2 focus:ring-offset-uri-navy"
            >
              Save & continue
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );

  return (
    <>
      {step === "info" ? (
        <section className="max-w-lg mx-auto mt-6 sm:mt-10 px-4" aria-label="Create your character">
          <div className="rounded-2xl border border-uri-keaney/30 bg-uri-navy/80 shadow-xl overflow-hidden">
            <div className="p-6 sm:p-8 pb-4 text-center border-b border-white/10">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-uri-keaney/30 to-uri-navy border border-uri-keaney/40 flex items-center justify-center text-3xl">
                🐏
              </div>
              <h1 className="font-display font-bold text-2xl text-white mb-1">Create your character</h1>
              <p className="text-sm text-white/60">First pick your name and username.</p>
            </div>

            <form onSubmit={handleSubmit} className="p-6 sm:p-8 pt-4 space-y-6">
              <div className="space-y-2">
                <label htmlFor="char-name" className="block text-xs font-semibold text-white/70 uppercase tracking-wider">
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
                  className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-uri-keaney/50 focus:border-uri-keaney/50"
                  aria-required
                  aria-invalid={name.length > 0 && !nameValid}
                />
                {name.length > 0 && !nameValid && <p className="text-xs text-amber-400">Use 1–40 characters.</p>}
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="char-username"
                  className="block text-xs font-semibold text-white/70 uppercase tracking-wider"
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
                  className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-uri-keaney/50 focus:border-uri-keaney/50 font-mono text-sm"
                  aria-required
                  aria-invalid={usernameNormalized.length > 0 && !usernameValid}
                />
                <p className="text-xs text-white/50">
                  Letters, numbers, underscores only. You’ll appear as @{usernameNormalized || "username"}
                </p>
                {usernameNormalized.length > 0 && !usernameValid && (
                  <p className="text-xs text-amber-400">
                    Username must be 3–25 characters (letters, numbers, underscores).
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <p className="block text-xs font-semibold text-white/70 uppercase tracking-wider">Starter archetype</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {CHARACTER_CLASSES.map((cls) => (
                    <button
                      key={cls.id}
                      type="button"
                      onClick={() => {
                        setClassId(cls.id);
                        setStarterWeapon(cls.starterWeapon);
                        setAvatar(getClassAvatarPreset(cls.id));
                      }}
                      className={`rounded-xl border px-2.5 py-2 text-left transition-colors ${
                        classId === cls.id
                          ? "border-uri-gold/60 bg-uri-gold/20 text-uri-gold"
                          : "border-white/15 bg-white/[0.05] text-white/85 hover:bg-white/[0.1]"
                      }`}
                    >
                      <p className="text-sm font-semibold">
                        {cls.icon} {cls.name}
                      </p>
                      <p className="mt-1 text-[11px] text-white/60">{cls.realm}</p>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-white/50">You can fully customize this later in the next step.</p>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="char-scholar-guild"
                  className="block text-xs font-semibold text-white/70 uppercase tracking-wider"
                >
                  Scholars Guild
                </label>
                <select
                  id="char-scholar-guild"
                  value={scholarGuildId}
                  onChange={(e) => setScholarGuildId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-uri-keaney/50 focus:border-uri-keaney/50"
                >
                  <option value="arts_sciences">College of Arts &amp; Sciences</option>
                  <option value="business">College of Business</option>
                  <option value="education">College of Education</option>
                  <option value="engineering">College of Engineering</option>
                  <option value="health_sciences">College of Health Sciences</option>
                  <option value="environment_life_sciences">College of Environment &amp; Life Sciences</option>
                  <option value="nursing">College of Nursing</option>
                  <option value="pharmacy">College of Pharmacy</option>
                  <option value="undecided">Undecided</option>
                </select>
                <p className="text-xs text-white/50">
                  Pick the college that best fits you. This powers the Scholars Guild leaderboard.
                </p>
              </div>

              <button
                type="submit"
                disabled={!nameValid || !usernameValid}
                className="w-full py-3.5 rounded-xl font-semibold text-white bg-uri-keaney hover:bg-uri-keaney/90 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-uri-keaney focus:ring-offset-2 focus:ring-offset-uri-navy transition-colors"
              >
                Continue to avatar
              </button>
            </form>
          </div>
        </section>
      ) : (
        <section className="max-w-4xl mx-auto mt-6 sm:mt-10 px-4" aria-label="Customize your avatar">
          <div className="rounded-3xl border border-uri-keaney/40 bg-gradient-to-br from-uri-navy via-uri-navy/90 to-uri-keaney/30 shadow-2xl overflow-hidden">
            <div className="flex flex-col gap-4 border-b border-white/10 px-6 py-5 sm:px-8 sm:py-6 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-uri-keaney/80 mb-1">Step 2 · Avatar</p>
                <h2 className="font-display font-bold text-xl sm:text-2xl text-white">CREATE YOUR CAMPUSQUEST AVATAR</h2>
                <p className="text-sm text-white/70 mt-1">
                  Choose a look that feels like you. Every change updates your character instantly.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-xs text-white/60">You as</p>
                  <p className="font-medium text-white">{nameTrimmed || "Your name"}</p>
                  <p className="text-xs text-uri-keaney/90">@{usernameNormalized || "username"}</p>
                </div>
                <div className="w-16 h-16 rounded-2xl bg-white/10 border border-uri-keaney/40 flex items-center justify-center overflow-hidden">
                  <AvatarDisplay avatar={avatar} size={56} />
                </div>
              </div>
            </div>

            <div className="px-4 py-4 sm:px-6 sm:py-6 md:px-8 md:py-7 bg-[radial-gradient(circle_at_0_0,rgba(255,255,255,0.08),transparent_55%),radial-gradient(circle_at_100%_100%,rgba(80,178,255,0.25),transparent_55%)]">
              <div className="mb-5 rounded-2xl border border-uri-keaney/30 bg-uri-keaney/10 p-3 sm:p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-uri-keaney/85">Starter avatars</p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
                  {starterAvatars.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setAvatar(preset.avatar);
                        setClassId(preset.id);
                      }}
                      className="rounded-xl border border-white/15 bg-white/[0.05] p-2 text-left hover:border-uri-keaney/50 hover:bg-white/[0.08]"
                    >
                      <div className="flex justify-center rounded-lg bg-black/20 py-1.5">
                        <AvatarDisplay avatar={preset.avatar} size={48} />
                      </div>
                      <p className="mt-1 text-[11px] font-semibold text-white truncate">
                        {preset.icon} {preset.label}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <AvatarBuilder
                value={avatar}
                onChange={setAvatar}
                showClassPresets
                selectedClassId={classId}
                onClassChange={setClassId}
                selectedWeapon={starterWeapon}
                onWeaponChange={setStarterWeapon}
              />

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => setStep("info")}
                  className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-sm font-medium text-white/80 bg-white/5 border border-white/15 hover:bg-white/10"
                >
                  ← Back to name & username
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!canSubmit) return;
                    setShowConfirm(true);
                  }}
                  disabled={!canSubmit}
                  className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-uri-keaney hover:bg-uri-keaney/90 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-uri-keaney focus:ring-offset-2 focus:ring-offset-uri-navy"
                >
                  Finish character
                </button>
              </div>
              {submitError && step === "avatar" && (
                <p className="mt-3 text-xs text-center text-amber-400" role="alert">
                  {submitError}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {confirmModal}
    </>
  );
}
