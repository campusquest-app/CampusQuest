"use client";

import { useEffect, useState, useCallback } from "react";
import { logTutorialGating } from "@/lib/client/onboardingTutorialGating";

/** Gap between reminders after dismiss — “few days”. */
export const COMMUNITY_REMINDER_COOLDOWN_MS = 5 * 24 * 60 * 60 * 1000;

const STORAGE_KEY_PREFIX = "cq_returning_community_reminder_v1_";
const SESSION_SHOWN_PREFIX = "cq_returning_community_reminder_sess_v1_";

export function communityReminderStorageKey(characterId: string): string {
  return `${STORAGE_KEY_PREFIX}${characterId}`;
}

function sessionReminderShownKey(characterId: string): string {
  return `${SESSION_SHOWN_PREFIX}${characterId}`;
}

type Props = { characterId: string };

/** Small, non-blocking community norms reminder for returning accounts (cooldown + one show per browser session incl. refreshes). */
export function WelcomeBackCommunityReminder({ characterId }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (sessionStorage.getItem(sessionReminderShownKey(characterId))) {
      setVisible(false);
      return;
    }

    try {
      const raw = localStorage.getItem(communityReminderStorageKey(characterId));
      if (raw) {
        const { dismissedAt } = JSON.parse(raw) as { dismissedAt?: string };
        if (dismissedAt) {
          const elapsed = Date.now() - new Date(dismissedAt).getTime();
          if (!Number.isNaN(elapsed) && elapsed >= 0 && elapsed < COMMUNITY_REMINDER_COOLDOWN_MS) {
            setVisible(false);
            return;
          }
        }
      }
    } catch {
      // If parse fails, allow one display
    }

    try {
      sessionStorage.setItem(sessionReminderShownKey(characterId), "1");
    } catch {
      // ignore
    }
    setVisible(true);

    logTutorialGating("welcomeBackReminderShown", {
      cooldownMs: COMMUNITY_REMINDER_COOLDOWN_MS,
    });
  }, [characterId]);

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      localStorage.setItem(
        communityReminderStorageKey(characterId),
        JSON.stringify({ dismissedAt: new Date().toISOString() }),
      );
    } catch {
      // ignore
    }
  }, [characterId]);

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Community reminder"
      className="mb-4 sm:mb-5 rounded-2xl border border-uri-keaney/40 bg-gradient-to-r from-uri-keaney/[0.12] to-white/[0.04] px-3.5 py-3 sm:px-4 shadow-sm shadow-black/20"
    >
      <div className="flex gap-3 items-start justify-between">
        <div className="min-w-0 space-y-1.5 text-sm leading-snug">
          <p className="text-white/90">
            Welcome back to CampusQuest. Build each other up, stay respectful, and help create a positive campus
            community.
          </p>
          <p className="text-white/60 text-xs">
            Harassment, scams, threats, and unsafe conduct are not tolerated.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="flex-shrink-0 rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-uri-keaney/50"
          aria-label="Dismiss community reminder"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
