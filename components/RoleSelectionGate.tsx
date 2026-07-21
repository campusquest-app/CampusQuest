"use client";

import { useState } from "react";
import { Briefcase, Check, GraduationCap, type LucideIcon } from "lucide-react";
import { CampusQuestLogo } from "@/components/CampusQuestLogo";
import { getAccessToken } from "@/lib/client/apiSession";
import { ApiRequestError, postAuthed } from "@/lib/client/dashboardApi";
import type { MeProfileRow } from "@/lib/client/profileCharacter";
import type { SelectableRole } from "@/lib/roles";

const ROLE_CARDS: {
  role: SelectableRole;
  title: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    role: "student",
    title: "Student",
    description:
      "Discover campus opportunities, join events and organizations, connect with students, and explore CampusQuest.",
    icon: GraduationCap,
  },
  {
    role: "faculty_staff",
    title: "Faculty / Staff",
    description:
      "Support students, share campus opportunities, create events, and engage with the CampusQuest community.",
    icon: Briefcase,
  },
];

type AccountTypeResponse = {
  profile: MeProfileRow;
  role: string;
  selectedRole: SelectableRole;
  roleLabel: string;
};

/**
 * Required account-type screen.
 * - New users (onboarding incomplete): "I am a..." — step before profile setup.
 * - Existing users with no valid role: one-time "Tell us about yourself".
 */
export function RoleSelectionGate({
  variant,
  onComplete,
}: {
  variant: "new_user" | "existing_user";
  onComplete: (profile: MeProfileRow) => void;
}) {
  const [selected, setSelected] = useState<SelectableRole | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isNewUser = variant === "new_user";

  async function handleContinue() {
    if (!selected || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await postAuthed<AccountTypeResponse, { role: SelectableRole }>(
        "/api/me/account-type",
        { role: selected },
      );
      if (!result?.profile) {
        throw new Error("Your account type could not be confirmed. Please try again.");
      }
      onComplete(result.profile);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 503) {
        setError("Account types are not available yet. Please try again in a moment.");
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      }
      setSaving(false);
    }
  }

  if (typeof window !== "undefined" && !getAccessToken()) {
    return <p className="text-center text-sm text-white/70 py-12 px-4">Sign in to continue.</p>;
  }

  return (
    <section
      className="max-w-lg mx-auto mt-6 sm:mt-10 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      aria-label="Choose your account type"
    >
      <div className="rounded-2xl border border-uri-keaney/30 bg-uri-navy/80 shadow-xl overflow-hidden">
        <div className="p-6 sm:p-8 pb-4 text-center border-b border-white/10">
          <CampusQuestLogo variant="drawer" className="mx-auto mb-4" priority />
          <h1 className="font-display font-bold text-2xl text-white mb-1">
            {isNewUser ? "I am a..." : "Tell us about yourself"}
          </h1>
          <p className="text-sm text-white/60">
            {isNewUser
              ? "Pick the option that fits you best. You can change this later in Settings."
              : "Choose the option that best describes your role on campus."}
          </p>
        </div>

        <div className="p-6 sm:p-8 pt-5 space-y-4" role="radiogroup" aria-label="Account type">
          {ROLE_CARDS.map((card) => {
            const Icon = card.icon;
            const isSelected = selected === card.role;
            return (
              <button
                key={card.role}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={saving}
                onClick={() => {
                  setSelected(card.role);
                  setError(null);
                }}
                className={`relative w-full rounded-2xl border p-4 sm:p-5 text-left transition-all touch-manipulation disabled:cursor-not-allowed ${
                  isSelected
                    ? "border-uri-keaney bg-uri-keaney/15 shadow-[0_0_18px_rgba(80,178,255,0.35)]"
                    : "border-white/15 bg-white/[0.05] hover:border-uri-keaney/50 hover:bg-white/[0.08]"
                }`}
              >
                {isSelected && (
                  <span
                    className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full bg-uri-keaney text-white shadow"
                    aria-hidden
                  >
                    <Check className="h-4 w-4" strokeWidth={3} />
                  </span>
                )}
                <span className="flex items-start gap-3.5">
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${
                      isSelected
                        ? "border-uri-keaney/60 bg-uri-keaney/25 text-uri-keaney"
                        : "border-white/15 bg-white/[0.06] text-white/75"
                    }`}
                  >
                    <Icon className="h-6 w-6" strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1 pr-6">
                    <span className="block text-base font-semibold text-white">{card.title}</span>
                    <span className="mt-1 block text-[13px] leading-snug text-white/65">
                      {card.description}
                    </span>
                  </span>
                </span>
              </button>
            );
          })}

          {error && (
            <p className="text-sm text-amber-400 text-center" role="alert">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={() => void handleContinue()}
            disabled={!selected || saving}
            className="w-full py-3.5 rounded-xl font-semibold text-white bg-uri-keaney hover:bg-uri-keaney/90 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-uri-keaney focus:ring-offset-2 focus:ring-offset-uri-navy transition-colors"
          >
            {saving ? "Saving..." : "Continue"}
          </button>
        </div>
      </div>
    </section>
  );
}
