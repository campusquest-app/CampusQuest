"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { addXpToCharacter, getActiveBossId, getActivityLogs, syncCharacterProgressFromBackend, updateCharacter } from "@/lib/store";
import type { Character } from "@/lib/types";
import { ApiRequestError, patchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import {
  beginnerCelebrationAckKey,
  beginnerClaimedKey,
  loadBeginnerOnboardingHydrationBundle,
  readBeginnerCelebrationSeenLocal,
  type BeginnerClaimStatusResponse,
  type BeginnerOnboardingHydrationBootstrap,
} from "@/lib/client/beginnerOnboardingHydration";

type AppTab =
  | "quad"
  | "friends"
  | "battle"
  | "leaderboards"
  | "character"
  | "inbox"
  | "events"
  | "organizations";
type QuestId = BeginnerClaimStatusResponse["claims"][number]["questKey"];

type BeginnerQuest = {
  id: QuestId;
  title: string;
  description: string;
  xp: number;
  done: boolean;
  ctaTab?: AppTab;
  ctaLabel?: string;
};

type BeginnerClaimResponse = {
  claim: { id: string; quest_key: QuestId; xp_awarded: number };
  xp: { xpLog: { xp_amount: number } };
  player: {
    profile: { streak_days?: number | null; last_activity_date?: string | null };
    stats: {
      level?: number | null;
      total_xp?: number | null;
      strength?: number | null;
      stamina?: number | null;
      knowledge?: number | null;
      social?: number | null;
      focus?: number | null;
    };
  };
};

const ONBOARDING_INTRO_KEY = (characterId: string) => `cq_onboarding_intro_v1_${characterId}`;
const VISITED_LEADERBOARD_KEY = (characterId: string) => `cq_onboarding_visited_leaderboard_v1_${characterId}`;

const BEGINNER_CHAIN_QUEST_IDS: QuestId[] = ["profile", "activity", "boss", "leaderboard", "guild"];

function deriveClaimsFromBeginnerStatus(status: BeginnerClaimStatusResponse) {
  const nextClaimed: QuestId[] = status.claims.map((c) => c.questKey);
  const nextMeta = {} as Partial<Record<QuestId, { claimedAt: string; xpAwarded: number }>>;
  status.claims.forEach((c) => {
    nextMeta[c.questKey] = { claimedAt: c.claimedAt, xpAwarded: c.xpAwarded };
  });
  return { claimed: nextClaimed, claimMeta: nextMeta };
}

/**
 * Manual checklist — beginner-chain completion banner:
 * - Refresh after completion (seen on server): no banner flash / no lingering banner.
 * - Log out and back in after completion: no banner.
 * - First-time completion this session (last claim succeeds): banner shows once; dismiss/fade persists.
 * Dev: append ?cq_reset_beginner_celebration=1 (non-production) to re-show after reset.
 */

const GUILD_SUGGESTIONS: { id: string; icon: string; title: string; subtitle: string }[] = [
  { id: "engineering", icon: "⚙️", title: "Builders Guild", subtitle: "For makers, coders, and systems thinkers." },
  { id: "arts_sciences", icon: "📚", title: "Scholars Guild", subtitle: "Great for studying streaks and mastery runs." },
  { id: "business", icon: "💼", title: "Strategy Guild", subtitle: "Perfect for networking and high-output planning." },
];

export function FirstTimeJourney({
  character,
  currentTab,
  onNavigateTab,
  onRefresh,
  onboardingHydrationBootstrap,
}: {
  character: Character;
  currentTab: AppTab;
  onNavigateTab: (tab: AppTab) => void;
  onRefresh: () => void;
  /** Pre-fetched by parent (Dashboard): do not mount until this is ready — prevents completion UI before server/LS reconciliation. */
  onboardingHydrationBootstrap: BeginnerOnboardingHydrationBootstrap;
}) {
  const [showIntro, setShowIntro] = useState(false);
  const [introStep, setIntroStep] = useState(0);
  const [claimed, setClaimed] = useState<QuestId[]>(
    () => deriveClaimsFromBeginnerStatus(onboardingHydrationBootstrap.beginnerStatus).claimed,
  );
  const [claimMeta, setClaimMeta] = useState<Partial<Record<QuestId, { claimedAt: string; xpAwarded: number }>>>(() =>
    deriveClaimsFromBeginnerStatus(onboardingHydrationBootstrap.beginnerStatus).claimMeta,
  );
  const [showReward, setShowReward] = useState<null | { xp: number; title: string }>(null);
  const [claimingQuestId, setClaimingQuestId] = useState<QuestId | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [visitedLeaderboard, setVisitedLeaderboard] = useState(false);
  const [celebrationAcknowledged, setCelebrationAcknowledged] = useState(() => onboardingHydrationBootstrap.celebrationAcknowledged);
  const [beginnerStatusLoaded, setBeginnerStatusLoaded] = useState(true);
  const [celebrationEligibilityChecked, setCelebrationEligibilityChecked] = useState(true);
  const [celebrationSeenFromServer, setCelebrationSeenFromServer] = useState<string | null | undefined>(
    () => onboardingHydrationBootstrap.celebrationSeenFromServer,
  );
  const [justCompletedChainThisSession, setJustCompletedChainThisSession] = useState(false);
  const [celebrationFadeOut, setCelebrationFadeOut] = useState(false);
  const celebrationPatchSentRef = useRef(false);

  function canUseLocalFallback() {
    const isDev = process.env.NODE_ENV !== "production";
    const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
    return isDev || isOffline;
  }

  const applyHydrationBootstrap = useCallback(
    (bundle: BeginnerOnboardingHydrationBootstrap) => {
      const { claimed: c, claimMeta: m } = deriveClaimsFromBeginnerStatus(bundle.beginnerStatus);
      setClaimed(c);
      setClaimMeta(m);
      setCelebrationSeenFromServer(bundle.celebrationSeenFromServer);
      setCelebrationAcknowledged(bundle.celebrationAcknowledged);
      setCelebrationEligibilityChecked(true);
      setBeginnerStatusLoaded(true);
    },
    [],
  );

  const loadClaimStatusFromBackend = useCallback(async () => {
    const bundle = await loadBeginnerOnboardingHydrationBundle(character.id);
    applyHydrationBootstrap(bundle);
    onRefresh();
  }, [character.id, onRefresh, applyHydrationBootstrap]);

  useEffect(() => {
    setCelebrationFadeOut(false);
    setJustCompletedChainThisSession(false);
    applyHydrationBootstrap(onboardingHydrationBootstrap);

    try {
      const seenIntro = localStorage.getItem(ONBOARDING_INTRO_KEY(character.id)) === "1";
      if (!seenIntro) setShowIntro(true);
      setVisitedLeaderboard(localStorage.getItem(VISITED_LEADERBOARD_KEY(character.id)) === "1");
    } catch {
      setShowIntro(true);
      setVisitedLeaderboard(false);
    }
  }, [character.id, onboardingHydrationBootstrap, applyHydrationBootstrap]);

  useEffect(() => {
    if (currentTab !== "leaderboards") return;
    try {
      localStorage.setItem(VISITED_LEADERBOARD_KEY(character.id), "1");
    } catch {
      // best effort only
    }
    setVisitedLeaderboard(true);
  }, [character.id, currentTab]);

  const logs = getActivityLogs(character.id);
  const quests: BeginnerQuest[] = [
    {
      id: "profile",
      title: "Spawn Character",
      description: "Your identity is forged. Starter profile complete.",
      xp: 25,
      done: true,
    },
    {
      id: "activity",
      title: "Complete First Quest",
      description: "Log any activity on Character to earn your first real XP.",
      xp: 40,
      done: logs.length > 0,
      ctaTab: "character",
      ctaLabel: "Go to Character",
    },
    {
      id: "boss",
      title: "Target Your First Boss",
      description: "Recruit or attack a boss to unlock raid progression.",
      xp: 55,
      done: getActiveBossId() != null,
      ctaTab: "battle",
      ctaLabel: "Open Boss Battles",
    },
    {
      id: "leaderboard",
      title: "Scout The Rankings",
      description: "Visit Leaderboards to see how you stack up on campus.",
      xp: 35,
      done: visitedLeaderboard,
      ctaTab: "leaderboards",
      ctaLabel: "View Leaderboards",
    },
    {
      id: "guild",
      title: "Choose Your Scholars Guild",
      description: "Pick a starter guild identity for your progression path.",
      xp: 45,
      done: !!character.scholarGuildId && character.scholarGuildId !== "undecided",
      ctaTab: "character",
      ctaLabel: "Open Character",
    },
  ];

  const completionPct = Math.round((quests.filter((q) => claimed.includes(q.id)).length / quests.length) * 100);
  const nextQuest = quests.find((q) => q.done && !claimed.includes(q.id)) ?? quests.find((q) => !q.done);
  const allClaimed = quests.every((q) => claimed.includes(q.id));
  /** Never show banner if server persisted celebration_seen_at (strict even if acknowledgement state desynced). */
  const serverSaysCelebrationRecorded =
    typeof celebrationSeenFromServer === "string" && celebrationSeenFromServer.length > 0;

  /** Do not render celebration until onboarding status + acknowledgment reconciliation ran; LS bootstrap blocks seen users before fetch. */
  const showCelebration =
    beginnerStatusLoaded &&
    celebrationEligibilityChecked &&
    allClaimed &&
    !celebrationAcknowledged &&
    !serverSaysCelebrationRecorded &&
    (justCompletedChainThisSession || celebrationSeenFromServer === null);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    console.info("[cq] FirstTimeJourney.celebration", {
      component: "FirstTimeJourney",
      showCelebration,
      beginnerStatusLoaded,
      celebrationEligibilityChecked,
      celebrationAcknowledged,
      celebrationSeenFromServer,
      justCompletedChainThisSession,
      serverSaysCelebrationRecorded,
    });
  }, [
    showCelebration,
    beginnerStatusLoaded,
    celebrationEligibilityChecked,
    celebrationAcknowledged,
    celebrationSeenFromServer,
    justCompletedChainThisSession,
    serverSaysCelebrationRecorded,
  ]);

  useEffect(() => {
    if (celebrationAcknowledged) setJustCompletedChainThisSession(false);
  }, [celebrationAcknowledged]);

  useEffect(() => {
    celebrationPatchSentRef.current = false;
  }, [character.id]);

  useEffect(() => {
    if (!allClaimed) celebrationPatchSentRef.current = false;
  }, [allClaimed]);

  useEffect(() => {
    if (!showCelebration) {
      setCelebrationFadeOut(false);
      return;
    }
    try {
      localStorage.setItem(beginnerCelebrationAckKey(character.id), "1");
    } catch {
      // best effort only
    }
    if (!celebrationPatchSentRef.current) {
      celebrationPatchSentRef.current = true;
      void patchAuthed("/api/me/profile", { beginnerChainCelebrationSeen: true }).catch(() => {});
    }
    const t = window.setTimeout(() => setCelebrationFadeOut(true), 10_000);
    return () => window.clearTimeout(t);
  }, [character.id, showCelebration]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      try {
        const u = new URL(window.location.href);
        if (u.searchParams.get("cq_reset_beginner_celebration") === "1") {
          localStorage.removeItem(beginnerCelebrationAckKey(character.id));
          setCelebrationFadeOut(false);
          setCelebrationEligibilityChecked(false);
          setCelebrationSeenFromServer(undefined);
          setCelebrationAcknowledged(false);
          setJustCompletedChainThisSession(false);
          celebrationPatchSentRef.current = false;
          u.searchParams.delete("cq_reset_beginner_celebration");
          window.history.replaceState({}, "", `${u.pathname}${u.search}${u.hash}`);
          void (async () => {
            try {
              await patchAuthed("/api/me/profile", { beginnerChainCelebrationSeenReset: true });
              await loadClaimStatusFromBackend();
            } catch {
              // ignore
            }
          })();
        }
      } catch {
        // ignore
      }
    }
  }, [character.id, loadClaimStatusFromBackend]);

  function dismissIntro() {
    setShowIntro(false);
    try {
      localStorage.setItem(ONBOARDING_INTRO_KEY(character.id), "1");
    } catch {
      // best effort only
    }
  }

  async function claimQuest(quest: BeginnerQuest) {
    if (!quest.done || claimed.includes(quest.id)) return;
    setClaimError(null);
    setClaimingQuestId(quest.id);

    const markClaimedLocally = () => {
      setClaimed((prev) => {
        if (prev.includes(quest.id)) return prev;
        const next = [...prev, quest.id];
        try {
          localStorage.setItem(beginnerClaimedKey(character.id), JSON.stringify(next));
        } catch {
          // best effort only
        }
        return next;
      });
    };

    try {
      const result = await postAuthed<BeginnerClaimResponse, { questId: QuestId }>(
        "/api/onboarding/beginner-quests/claim",
        { questId: quest.id }
      );
      markClaimedLocally();
      setClaimMeta((prev) => ({
        ...prev,
        [quest.id]: {
          claimedAt: new Date().toISOString(),
          xpAwarded: result.claim.xp_awarded,
        },
      }));
      syncCharacterProgressFromBackend(character.id, result.player);
      onRefresh();
      if (BEGINNER_CHAIN_QUEST_IDS.every((id) => id === quest.id || claimed.includes(id))) {
        setJustCompletedChainThisSession(true);
      }
      setShowReward({ xp: result.claim.xp_awarded, title: quest.title });
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === "BEGINNER_QUEST_ALREADY_CLAIMED") {
        await loadClaimStatusFromBackend().catch(() => {
          markClaimedLocally();
        });
        onRefresh();
      } else if (canUseLocalFallback()) {
        markClaimedLocally();
        setClaimMeta((prev) => ({
          ...prev,
          [quest.id]: {
            claimedAt: new Date().toISOString(),
            xpAwarded: quest.xp,
          },
        }));
        addXpToCharacter(character.id, quest.xp);
        onRefresh();
        if (BEGINNER_CHAIN_QUEST_IDS.every((id) => id === quest.id || claimed.includes(id))) {
          setJustCompletedChainThisSession(true);
        }
        setShowReward({ xp: quest.xp, title: quest.title });
      } else {
        const message = error instanceof Error ? error.message : "Could not claim reward right now.";
        setClaimError(message);
      }
    } finally {
      setClaimingQuestId(null);
    }
  }

  function pickStarterGuild(guildId: string) {
    updateCharacter({ scholarGuildId: guildId });
    onRefresh();
  }

  return (
    <>
      {showIntro && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={dismissIntro} aria-hidden />
          <div className="relative z-10 w-full max-w-md rounded-3xl border border-uri-gold/45 bg-uri-navy p-6 sm:p-7 onboarding-enter">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-uri-gold/90">New Player Protocol</p>
            {introStep === 0 && (
              <div className="mt-3">
                <h2 className="font-display text-2xl font-bold text-white">Welcome to CampusQuest</h2>
                <p className="mt-2 text-sm text-white/75">
                  This is your first 5-minute power run. We will get you hooked on visible progress instantly.
                </p>
              </div>
            )}
            {introStep === 1 && (
              <div className="mt-3">
                <h2 className="font-display text-2xl font-bold text-white">Play Real Life Like An RPG</h2>
                <p className="mt-2 text-sm text-white/75">
                  Log quests, defeat bosses, climb leaderboards, and lock in your daily streak momentum.
                </p>
              </div>
            )}
            {introStep === 2 && (
              <div className="mt-3">
                <h2 className="font-display text-2xl font-bold text-white">Your Journey Starts Now</h2>
                <p className="mt-2 text-sm text-white/75">Complete the Beginner Chain below and claim your starter XP rewards.</p>
              </div>
            )}
            <div className="mt-6 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={dismissIntro}
                className="rounded-xl border border-white/20 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
              >
                Skip
              </button>
              {introStep < 2 ? (
                <button
                  type="button"
                  onClick={() => setIntroStep((s) => s + 1)}
                  className="rounded-xl bg-uri-keaney px-4 py-2 text-sm font-semibold text-white hover:bg-uri-keaney/90"
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  onClick={dismissIntro}
                  className="rounded-xl bg-uri-gold px-4 py-2 text-sm font-semibold text-uri-navy hover:bg-amber-400"
                >
                  Start Questline
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {!allClaimed && (
        <section className="card p-4 sm:p-5 border-uri-gold/35 bg-gradient-to-br from-uri-gold/[0.1] via-white/[0.03] to-uri-keaney/[0.08]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-uri-gold/90">Beginner Quest Chain</p>
              <h2 className="font-display text-lg font-bold text-white">First 5 Minutes</h2>
            </div>
            <span className="rounded-full border border-uri-gold/40 bg-uri-gold/15 px-2.5 py-1 text-[11px] font-semibold text-uri-gold">
              {completionPct}% claimed
            </span>
          </div>

          <div className="mt-3 h-2.5 overflow-hidden rounded-full border border-uri-gold/35 bg-black/35">
            <div className="h-full rounded-full bg-gradient-to-r from-uri-gold via-amber-300 to-uri-keaney transition-all duration-700" style={{ width: `${completionPct}%` }} />
          </div>

          <ul className="mt-4 space-y-2.5">
            {quests.map((q) => {
              const isClaimed = claimed.includes(q.id);
              const questMeta = claimMeta[q.id];
              const isClaiming = claimingQuestId === q.id;
              return (
                <li key={q.id} className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{q.title}</p>
                      <p className="mt-0.5 text-xs text-white/65">{q.description}</p>
                    </div>
                    <span className="text-xs font-mono font-semibold text-uri-gold">+{q.xp} XP</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {isClaimed ? (
                      <>
                        <span className="rounded-full border border-emerald-500/45 bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                          Claimed
                        </span>
                        {questMeta?.claimedAt && (
                          <span className="text-[11px] text-white/50">
                            {new Date(questMeta.claimedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                          </span>
                        )}
                      </>
                    ) : q.done ? (
                      <button
                        type="button"
                        onClick={() => claimQuest(q)}
                        disabled={isClaiming}
                        className="rounded-lg border border-uri-gold/55 bg-uri-gold/20 px-3 py-1.5 text-xs font-semibold text-uri-gold hover:bg-uri-gold/30 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isClaiming ? "Claiming..." : "Claim reward"}
                      </button>
                    ) : (
                      <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[11px] text-white/70">In progress</span>
                    )}

                    {!q.done && q.ctaTab && q.ctaLabel && (
                      <button
                        type="button"
                        onClick={() => onNavigateTab(q.ctaTab!)}
                        className="rounded-lg border border-uri-keaney/45 bg-uri-keaney/20 px-3 py-1.5 text-xs font-semibold text-uri-keaney hover:bg-uri-keaney/30"
                      >
                        {q.ctaLabel}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {claimError && (
            <p className="mt-3 rounded-lg border border-amber-400/35 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">{claimError}</p>
          )}

          {character.scholarGuildId === "undecided" && (
            <div className="mt-4 rounded-xl border border-uri-keaney/35 bg-uri-keaney/[0.08] p-3">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-uri-keaney/90">Starter guild suggestions</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {GUILD_SUGGESTIONS.map((guild) => (
                  <button
                    key={guild.id}
                    type="button"
                    onClick={() => pickStarterGuild(guild.id)}
                    className="rounded-lg border border-white/15 bg-white/[0.05] px-2.5 py-2 text-left hover:border-uri-keaney/40 hover:bg-white/[0.08]"
                  >
                    <p className="text-sm font-semibold text-white">
                      {guild.icon} {guild.title}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-white/60">{guild.subtitle}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {showCelebration ? (
        <section
          className={`card p-4 text-center border-emerald-400/35 bg-emerald-900/15 transition-opacity duration-500 ease-out ${
            celebrationFadeOut ? "opacity-0" : "opacity-100"
          }`}
          aria-live="polite"
          onTransitionEnd={(e) => {
            if (e.target !== e.currentTarget) return;
            if (e.propertyName !== "opacity" || !celebrationFadeOut) return;
            setCelebrationAcknowledged(true);
          }}
        >
          <p className="text-xl" aria-hidden>🎉</p>
          <p className="mt-1 text-sm font-semibold text-emerald-200">Beginner chain complete</p>
          <p className="mt-1 text-xs text-white/60">You are now fully initiated. Keep stacking quests to maintain momentum.</p>
        </section>
      ) : null}

      {nextQuest && !allClaimed && (
        <div className="cq-onboarding-tip fixed bottom-[5.8rem] left-1/2 z-20 w-[min(24rem,92vw)] -translate-x-1/2 rounded-xl border border-uri-keaney/45 bg-uri-navy/95 p-3 shadow-xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-uri-keaney/90">Guided Step</p>
          <p className="mt-1 text-sm font-semibold text-white">{nextQuest.title}</p>
          <p className="mt-0.5 text-xs text-white/65">{nextQuest.description}</p>
          {!nextQuest.done && nextQuest.ctaTab && nextQuest.ctaLabel && (
            <button
              type="button"
              onClick={() => onNavigateTab(nextQuest.ctaTab!)}
              className="mt-2 rounded-lg bg-uri-keaney px-3 py-1.5 text-xs font-semibold text-white hover:bg-uri-keaney/90"
            >
              {nextQuest.ctaLabel}
            </button>
          )}
        </div>
      )}

      {showReward && (
        <div className="fixed inset-0 z-[121] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowReward(null)} aria-hidden />
          <div className="relative z-10 w-full max-w-xs rounded-2xl border border-uri-gold/45 bg-uri-navy p-5 text-center quest-reward-pop">
            <p className="text-3xl" aria-hidden>✨</p>
            <p className="mt-2 text-sm font-semibold text-white">Quest Complete</p>
            <p className="text-xs text-white/65">{showReward.title}</p>
            <p className="mt-2 font-mono text-lg font-bold text-uri-gold">+{showReward.xp} XP</p>
            <button
              type="button"
              onClick={() => setShowReward(null)}
              className="mt-4 w-full rounded-xl bg-uri-gold py-2 text-sm font-semibold text-uri-navy hover:bg-amber-400"
            >
              Keep going
            </button>
          </div>
        </div>
      )}
    </>
  );
}
