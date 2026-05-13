"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getCharacter, logActivity, logout as storeLogout, replaceLocalCharacter, clearPersistedCharacter } from "@/lib/store";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import type { Character } from "@/lib/types";
import { CharacterCard } from "./CharacterCard";
import { CharacterGate } from "./CharacterGate";
import { WelcomeSplash } from "./WelcomeSplash";
import { AuthScreen } from "./AuthScreen";
import { ActivityList } from "./ActivityList";
import { TheQuad } from "./TheQuad";
import { DailyQuests } from "./DailyQuests";
import { SpecialQuests } from "./SpecialQuests";
import { StreakCard } from "./StreakCard";
import { BossBattles } from "./BossBattles";
import { RecentActivities } from "./RecentActivities";
import { FindFriends } from "./FindFriends";
import { Leaderboards } from "./Leaderboards";
import { Profile } from "./Profile";
import { WeeklyRecapCard } from "./WeeklyRecapCard";
import { CollapsibleSection } from "./CollapsibleSection";
import { DirectMessageThread } from "./DirectMessageThread";
import { Inbox, type InboxSubTab } from "./Inbox";
import { EventsFeed } from "./EventsFeed";
import { OrganizationsHub } from "./OrganizationsHub";
import { STAT_KEYS, STAT_ICONS, STAT_LABELS } from "@/lib/types";
import { getActivityById } from "@/lib/activities";
import { AvatarDisplay } from "./AvatarDisplay";
import { playXpDing, playLevelUpFanfare } from "@/lib/playGameSound";
import { describeCosmeticEquipEffect } from "@/lib/gameBuffs";
import { SkillTreePanel } from "./SkillTreePanel";
import { SurpriseQuestBanner } from "./SurpriseQuestBanner";
import { DailyTrainingGames } from "./DailyTrainingGames";
import { LoreArchiveCard } from "./LoreArchiveCard";
import { FirstTimeJourney } from "./FirstTimeJourney";
import { OnboardingPreferencesModal } from "./OnboardingPreferencesModal";
import type { StatKey } from "@/lib/types";
import { clearAccessToken, getAccessToken } from "@/lib/client/apiSession";
import {
  fetchAuthed,
  fetchMeSchoolVerification,
  type MeSchoolVerificationResponse,
  SchoolVerificationHttpError,
} from "@/lib/client/dashboardApi";
import { buildLocalCharacterFromServer, type MeProfileRow, type MeStatsRow } from "@/lib/client/profileCharacter";
import { clearSchoolVerificationSnapshot, peekSchoolVerificationSnapshot } from "@/lib/client/schoolVerificationCache";
import {
  loadBeginnerOnboardingHydrationBundle,
  type BeginnerOnboardingHydrationBootstrap,
} from "@/lib/client/beginnerOnboardingHydration";
import { SchoolVerificationScreen } from "./SchoolVerificationScreen";

type Tab = "quad" | "friends" | "battle" | "leaderboards" | "character" | "inbox" | "events" | "organizations";

const TAB_QUERY_VALUES: Tab[] = ["quad", "friends", "battle", "leaderboards", "character", "inbox", "events", "organizations"];

type PilotCampusState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; snapshot: MeSchoolVerificationResponse };

/** Whether to show internal admin links (moderation allow-list accounts). Uses live snapshot or cached school verification. */
function moderationAdminNavVisible(pilotCampusState: PilotCampusState): boolean {
  if (pilotCampusState.status === "ready") {
    return pilotCampusState.snapshot.moderationAdminAccess;
  }
  const token = getAccessToken();
  return Boolean(token && peekSchoolVerificationSnapshot(token)?.moderationAdminAccess);
}

type BootstrapStatus = "bootstrapping" | "unauthenticated" | "authenticated";

function logBootstrapDecision(info: {
  sessionFound: boolean;
  sessionValidated?: boolean;
  onboardingCompleted?: boolean | null;
  route: "unauthenticated" | "character_gate" | "app";
}) {
  if (process.env.NODE_ENV === "production") return;
  console.info("[cq] bootstrap", {
    sessionFound: info.sessionFound,
    ...(info.sessionValidated !== undefined ? { sessionValidated: info.sessionValidated } : {}),
    ...(info.onboardingCompleted !== undefined ? { onboardingCompleted: info.onboardingCompleted } : {}),
    route: info.route,
  });
}

/** Sub-view on the Character tab (Quad-style toggle). */
type CharacterPane = "sheet" | "profile";

function Header({
  username,
  character,
  onRefresh,
  onOpenInbox,
  onOpenNotifications,
  unreadNotificationCount,
  showAdminNav,
}: {
  username: string | null;
  character: Character | null;
  onRefresh?: () => void;
  onOpenInbox?: () => void;
  onOpenNotifications?: () => void;
  unreadNotificationCount?: number;
  /** Moderation admins only — links to internal tooling. */
  showAdminNav?: boolean;
}) {
  const [questsOpen, setQuestsOpen] = useState(false);
  const [specialQuestsOpen, setSpecialQuestsOpen] = useState(false);
  const questsButtonRef = useRef<HTMLButtonElement | null>(null);

  return (
    <>
    <header
      className={`sticky top-0 -mx-4 -mt-4 mb-4 sm:mb-5 transition-z-index ${questsOpen || specialQuestsOpen ? "z-[110]" : "z-10"}`}
      style={{
        background: "linear-gradient(180deg, rgba(4, 30, 66, 0.98) 0%, rgba(3, 22, 48, 0.97) 100%)",
        boxShadow: "0 1px 0 0 rgba(104, 171, 232, 0.15), 0 4px 20px -4px rgba(0,0,0,0.4)",
      }}
    >
      <div className="backdrop-blur-sm border-b border-white/[0.08]">
        <div className="max-w-2xl mx-auto px-4 py-3 sm:py-3.5 flex items-center justify-between gap-3">
          {/* Left: Brand + user */}
          <div className="min-w-0 flex items-center gap-3 flex-shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-uri-keaney/30 to-uri-keaney/10 border border-uri-keaney/40 flex items-center justify-center flex-shrink-0 shadow-[0_0_12px_rgba(104,171,232,0.2)]">
              <span className="text-base font-bold text-uri-keaney leading-none">CQ</span>
            </div>
            <div className="min-w-0">
              <h1 className="font-display font-bold text-white text-sm sm:text-base tracking-tight truncate">
                CampusQuest
              </h1>
              <p className="text-[10px] sm:text-xs text-uri-keaney/80 font-medium truncate">
                {username ? `@${username}` : "URI · Level up for real"}
              </p>
            </div>
          </div>

          {/* Right: Quick actions */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {showAdminNav ? (
              <div className="flex items-center gap-1.5" role="navigation" aria-label="Internal admin">
                <Link
                  href="/internal/admin"
                  className="rounded-lg border border-emerald-400/45 bg-emerald-500/[0.12] px-2 py-1.5 sm:px-2.5 text-[11px] sm:text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20 whitespace-nowrap"
                >
                  Admin
                </Link>
              </div>
            ) : null}
            {character && (
              <div
                className="flex items-center rounded-xl border border-white/15 bg-white/5 p-1 gap-0.5 shadow-inner"
                role="group"
                aria-label="Quick actions"
              >
                <div className="relative">
                  <button
                    ref={questsButtonRef}
                    type="button"
                    onClick={() => {
                      setSpecialQuestsOpen(false);
                      setQuestsOpen((v) => !v);
                    }}
                    className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      questsOpen
                        ? "bg-uri-keaney/25 text-uri-keaney border border-uri-keaney/40 shadow-sm"
                        : "text-white/90 hover:bg-white/10 hover:text-white border border-transparent"
                    }`}
                    aria-haspopup="dialog"
                    aria-expanded={questsOpen}
                    title="Daily quests"
                  >
                    <span aria-hidden>📋</span>
                    <span className="hidden sm:inline">Daily</span>
                    <span className="text-[10px] opacity-70" aria-hidden>{questsOpen ? "▴" : "▾"}</span>
                  </button>
                  {questsOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-[100] bg-black/30 cursor-default"
                        onClick={() => setQuestsOpen(false)}
                        aria-hidden
                      />
                      <div className="fixed left-3 right-3 top-14 z-[101] max-h-[calc(100vh-4rem)] overflow-y-auto sm:left-1/2 sm:right-auto sm:top-full sm:mt-2 sm:w-[min(34rem,92vw)] sm:max-h-[70vh] sm:-translate-x-1/2">
                        <div className="rounded-2xl border border-uri-keaney/40 bg-[#041E42] shadow-xl shadow-black/40 ring-1 ring-black/20 overflow-hidden">
                          <DailyQuests character={character} compact />
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setQuestsOpen(false);
                      setSpecialQuestsOpen((v) => !v);
                    }}
                    className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      specialQuestsOpen
                        ? "bg-uri-gold/20 text-uri-gold border border-uri-gold/50 shadow-sm"
                        : "text-white/90 hover:bg-white/10 hover:text-white border border-transparent"
                    }`}
                    aria-haspopup="dialog"
                    aria-expanded={specialQuestsOpen}
                    title="Special quests"
                  >
                    <span aria-hidden>⭐</span>
                    <span className="hidden sm:inline">Special</span>
                    <span className="text-[10px] opacity-70" aria-hidden>{specialQuestsOpen ? "▴" : "▾"}</span>
                  </button>
                  {specialQuestsOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-[100] bg-black/30 cursor-default"
                        onClick={() => setSpecialQuestsOpen(false)}
                        aria-hidden
                      />
                      <div className="fixed left-3 right-3 top-14 z-[101] max-h-[calc(100vh-4rem)] overflow-y-auto sm:left-1/2 sm:right-auto sm:top-full sm:mt-2 sm:w-[min(34rem,92vw)] sm:max-h-[70vh] sm:-translate-x-1/2">
                        <div
                          className="rounded-2xl overflow-hidden border-2 border-uri-gold/60 bg-[#041E42] ring-1 ring-black/20"
                          style={{
                            boxShadow: "0 0 0 1px rgba(197, 165, 40, 0.25), 0 12px 40px -8px rgba(0,0,0,0.5), 0 0 40px rgba(197, 165, 40, 0.12)",
                            background: "linear-gradient(175deg, rgba(197, 165, 40, 0.12) 0%, rgba(197, 165, 40, 0.04) 8%, #041E42 18%, #041E42 100%)",
                          }}
                        >
                          <div className="h-1.5 bg-gradient-to-r from-transparent via-amber-400/70 to-transparent" aria-hidden />
                          <div className="h-px bg-gradient-to-r from-transparent via-uri-gold/40 to-transparent" aria-hidden />
                          <SpecialQuests character={character} compact onClaim={onRefresh ?? undefined} />
                        </div>
                      </div>
                    </>
                  )}
                </div>
                {onOpenInbox && (
                  <button
                    type="button"
                    onClick={onOpenInbox}
                    className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg text-sm font-medium text-white/90 hover:bg-white/10 hover:text-white border border-transparent transition-all"
                    title="Inbox"
                  >
                    <span aria-hidden>📬</span>
                    <span className="hidden sm:inline">Inbox</span>
                  </button>
                )}
                {onOpenNotifications && (
                  <button
                    type="button"
                    onClick={onOpenNotifications}
                    className="relative flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg text-sm font-medium text-white/90 hover:bg-white/10 hover:text-white border border-transparent transition-all"
                    title="Notifications"
                  >
                    <span aria-hidden>🔔</span>
                    <span className="hidden sm:inline">Notifications</span>
                    {(unreadNotificationCount ?? 0) > 0 ? (
                      <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-[10px] font-bold text-white flex items-center justify-center">
                        {Math.min(99, unreadNotificationCount ?? 0)}
                      </span>
                    ) : null}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
    </>
  );
}

export function Dashboard() {
  const searchParams = useSearchParams();
  const [character, setCharacter] = useState<Character | null>(null);
  const [mounted, setMounted] = useState(false);
  const [showWelcomeSplash, setShowWelcomeSplash] = useState(true);
  const [tab, setTab] = useState<Tab>("quad");
  const [inboxSubTab, setInboxSubTab] = useState<InboxSubTab>("messages");
  const [characterPane, setCharacterPane] = useState<CharacterPane>("sheet");
  const [gainToast, setGainToast] = useState<null | {
    xp: number;
    stats: Partial<Record<keyof Character["stats"], number>>;
    title: string;
    lastBossDrop?: { bossName: string; loot?: { icon: string; label: string; rarity: string; equipEffect: string } };
    modifierLines?: { label: string; emoji?: string }[];
    primaryStat?: StatKey;
  }>(null);
  const [bossDefeatPhase, setBossDefeatPhase] = useState<"teaser" | "reveal" | null>(null);
  const [bossChestPhase, setBossChestPhase] = useState<"idle" | "opening" | "open" | "handoff">("idle");
  const [bossVictoryExiting, setBossVictoryExiting] = useState(false);
  const bossVictoryTimerRef = useRef<number | null>(null);
  const bossChestSequenceTimersRef = useRef<number[]>([]);
  const [showLevel3Popup, setShowLevel3Popup] = useState(false);
  const [dmWithOther, setDmWithOther] = useState<{ userId: string; username: string; name: string; avatar: string } | null>(null);
  const [screenShake, setScreenShake] = useState(false);
  const [levelUpModal, setLevelUpModal] = useState<number | null>(null);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [onboardingPreferences, setOnboardingPreferences] = useState<{
    schoolName: string;
    interests: string[];
    discoveryFocus: string[];
    major?: string | null;
  } | null>(null);
  const [needsOnboardingPreferences, setNeedsOnboardingPreferences] = useState(false);
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus>("bootstrapping");
  const [bootstrapNonce, setBootstrapNonce] = useState(0);
  const [gatePrefillProfile, setGatePrefillProfile] = useState<MeProfileRow | null>(null);
  const [pilotCampusState, setPilotCampusState] = useState<PilotCampusState>({ status: "loading" });
  const [campusFetchNonce, setCampusFetchNonce] = useState(0);
  const [showCampusSlowNotice, setShowCampusSlowNotice] = useState(false);
  const campusFetchGenRef = useRef(0);
  /** Beginner onboarding bundle: parent fetches before mounting FirstTimeJourney to avoid completion UI flashing before server/LS reconciliation. */
  const [beginnerJourneyHydration, setBeginnerJourneyHydration] = useState<BeginnerOnboardingHydrationBootstrap | null>(null);
  /** Last `/api/me/school-verification` HTTP status for this fetch attempt (dev logging only). */
  const schoolVerificationLastHttpRef = useRef<number | null>(null);

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t && TAB_QUERY_VALUES.includes(t as Tab)) {
      setTab(t as Tab);
    }
  }, [searchParams]);

  const XP300_POPUP_KEY = "campusquest_300xp_celebrated";

  const pilotCampusFeaturesUnlocked = useCallback((snapshot: MeSchoolVerificationResponse) => {
    if (snapshot.moderationAdminAccess) return true;
    const v = snapshot.verification;
    return v.status === "verified" && Boolean(v.schoolDomain) && Boolean(v.schoolName);
  }, []);

  const renderPilotCampusGate = useCallback(
    (node: ReactNode): ReactNode => {
      if (pilotCampusState.status === "loading") {
        const tokenForPeek = getAccessToken();
        const peekSnap = tokenForPeek ? peekSchoolVerificationSnapshot(tokenForPeek) : null;
        if (peekSnap && pilotCampusFeaturesUnlocked(peekSnap)) {
          return node;
        }
        if (!showCampusSlowNotice) {
          return (
            <div
              className="min-h-[28vh] rounded-2xl border border-white/[0.06] bg-white/[0.02] cq-skeleton-wrap overflow-hidden"
              aria-busy="true"
              aria-label="Loading campus access"
            >
              <div className="p-4 space-y-3">
                <div className="cq-skeleton h-4 rounded-lg w-2/3 max-w-xs" />
                <div className="cq-skeleton h-3 rounded-lg w-full" />
                <div className="cq-skeleton h-3 rounded-lg w-5/6" />
              </div>
            </div>
          );
        }
        return <p className="text-sm text-white/65 py-10 text-center px-4">Checking campus eligibility…</p>;
      }
      if (pilotCampusState.status === "error") {
        return (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-6 text-center space-y-3">
            <p className="text-sm text-amber-100">{pilotCampusState.message}</p>
            <button
              type="button"
              onClick={() => setCampusFetchNonce((n) => n + 1)}
              className="rounded-xl border border-uri-keaney/50 bg-uri-keaney/20 px-4 py-2 text-sm font-semibold text-uri-keaney hover:bg-uri-keaney/30"
            >
              Try again
            </button>
          </div>
        );
      }
      const snap = pilotCampusState.snapshot;
      if (!pilotCampusFeaturesUnlocked(snap)) {
        return (
          <SchoolVerificationScreen
            requiredSchoolName={snap.verification.requiredPilotSchoolName ?? "your school"}
            requiredSchoolDomain={snap.verification.requiredPilotDomain ?? null}
            currentDomain={snap.verification.schoolDomain ?? null}
            supplementalContent={
              snap.moderationAdminAccess ? (
                <p>
                  Verified staff accounts are campus-eligible automatically. Tools:{" "}
                  <Link href="/internal/admin" className="font-semibold text-uri-keaney underline-offset-2 hover:underline">
                    Internal Admin
                  </Link>
                  ,{" "}
                  <Link href="/internal/moderation" className="font-semibold text-uri-keaney underline-offset-2 hover:underline">
                    Moderation
                  </Link>
                  .
                </p>
              ) : undefined
            }
          />
        );
      }
      return node;
    },
    [pilotCampusState, pilotCampusFeaturesUnlocked, showCampusSlowNotice],
  );

  const refresh = useCallback(() => {
    setCharacter(getCharacter());
  }, []);

  const handleLogout = useCallback(() => {
    void (async () => {
      try {
        const { flushGameStateSync } = await import("@/lib/client/gameStateSync");
        await flushGameStateSync(getCharacter);
      } catch {
        /* best-effort sync before token clear */
      }
      clearAccessToken();
      clearSchoolVerificationSnapshot();
      storeLogout();
      setCharacter(null);
      setGatePrefillProfile(null);
      setOnboardingPreferences(null);
      setNeedsOnboardingPreferences(false);
      setBootstrapStatus("bootstrapping");
      setShowWelcomeSplash(false);
      setCampusFetchNonce(0);
      setPilotCampusState({ status: "loading" });
      setBootstrapNonce((n) => n + 1);
    })();
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (bootstrapStatus !== "authenticated" || !character) return;
    let cancelled = false;
    async function loadUnread() {
      try {
        const data = await fetchAuthed<{ notifications: unknown[]; unreadCount: number }>("/api/notifications?limit=1");
        if (!cancelled) setUnreadNotificationCount(Number(data.unreadCount ?? 0));
      } catch {
        if (!cancelled) setUnreadNotificationCount(0);
      }
    }
    void loadUnread();
    const intervalId = window.setInterval(() => {
      void loadUnread();
    }, 45000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [bootstrapStatus, character?.id]);

  useEffect(() => {
    if (bootstrapStatus !== "authenticated" || !character) return;
    let cancelled = false;
    async function loadOnboardingPreferences() {
      try {
        const data = await fetchAuthed<{
          exists: boolean;
          preferences: {
            schoolName: string;
            interests: string[];
            discoveryFocus: string[];
            major?: string | null;
          } | null;
        }>("/api/me/onboarding-preferences");
        if (cancelled) return;
        setOnboardingPreferences(
          data.preferences
            ? {
                schoolName: data.preferences.schoolName,
                interests: data.preferences.interests,
                discoveryFocus: data.preferences.discoveryFocus,
                major: data.preferences.major ?? null,
              }
            : null,
        );
        setNeedsOnboardingPreferences(!data.exists);
      } catch {
        if (cancelled) return;
        setOnboardingPreferences(null);
        setNeedsOnboardingPreferences(true);
      }
    }
    void loadOnboardingPreferences();
    return () => {
      cancelled = true;
    };
  }, [bootstrapStatus, character?.id]);

  useEffect(() => {
    if (bootstrapStatus !== "authenticated" || !character?.id) {
      setBeginnerJourneyHydration(null);
      return;
    }
    let cancelled = false;
    const characterId = character.id;
    setBeginnerJourneyHydration(null);
    void loadBeginnerOnboardingHydrationBundle(characterId).then((hydrationPayload) => {
      if (!cancelled) setBeginnerJourneyHydration(hydrationPayload);
    });
    return () => {
      cancelled = true;
    };
  }, [bootstrapStatus, character?.id]);

  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;

    async function bootstrap() {
      setBootstrapStatus("bootstrapping");
      setCharacter(null);

      const tokenAtStart = getAccessToken();

      const failUnauthenticated = (opts?: { invalidateToken?: boolean }) => {
        if (opts?.invalidateToken) clearAccessToken();
        storeLogout();
        clearSchoolVerificationSnapshot();
        setGatePrefillProfile(null);
        setNeedsOnboardingPreferences(false);
        setOnboardingPreferences(null);
        refresh();
      };

      if (!tokenAtStart) {
        failUnauthenticated({ invalidateToken: false });
        logBootstrapDecision({ sessionFound: false, route: "unauthenticated" });
        setBootstrapStatus("unauthenticated");
        return;
      }

      // Server fetch below will replace/merge local character; keep existing blob for same-user re-login.

      let profileSnap: MeProfileRow | null = null;

      try {
        const [profile, stats] = await Promise.all([
          fetchAuthed<MeProfileRow>("/api/me/profile"),
          fetchAuthed<MeStatsRow>("/api/me/stats"),
        ]);

        let profileMerged: MeProfileRow = profile;
        let statsMerged: MeStatsRow = stats;

        const localPre = getCharacter();
        if (
          localPre &&
          localPre.id === profile.id &&
          !localPre.id.startsWith("char-") &&
          Number(localPre.totalXP) > Number(stats.total_xp ?? 0)
        ) {
          const { pushCharacterProgressToServer } = await import("@/lib/client/gameStateSync");
          await pushCharacterProgressToServer(localPre);
          const [p2, s2] = await Promise.all([
            fetchAuthed<MeProfileRow>("/api/me/profile"),
            fetchAuthed<MeStatsRow>("/api/me/stats"),
          ]);
          profileMerged = p2;
          statsMerged = s2;
        }

        let prefs: {
          exists: boolean;
          preferences: {
            schoolName: string;
            interests: string[];
            discoveryFocus: string[];
            major?: string | null;
          } | null;
        };
        try {
          prefs = await fetchAuthed("/api/me/onboarding-preferences");
        } catch {
          prefs = { exists: false, preferences: null };
        }

        profileSnap = profileMerged;

        if (cancelled) return;

        const onboardingDone = Boolean(profileMerged.onboarding_completed);
        const characterDone = Boolean(profileMerged.onboarding_character_completed);

        const applyPrefsState = () => {
          if (prefs.preferences) {
            setOnboardingPreferences({
              schoolName: prefs.preferences.schoolName,
              interests: prefs.preferences.interests,
              discoveryFocus: prefs.preferences.discoveryFocus,
              major: prefs.preferences.major ?? null,
            });
          } else {
            setOnboardingPreferences(null);
          }
        };

        const clearLegacyLocalMismatch = () => {
          const local = getCharacter();
          if (local && (local.id !== profileMerged.id || local.id.startsWith("char-"))) {
            clearPersistedCharacter();
          }
        };

        let routeDecision: "character_gate" | "app" = "character_gate";

        if (onboardingDone) {
          clearLegacyLocalMismatch();
          replaceLocalCharacter(buildLocalCharacterFromServer(profileMerged, statsMerged));
          setNeedsOnboardingPreferences(false);
          applyPrefsState();
          setGatePrefillProfile(null);
          setShowWelcomeSplash(false);
          setTab("quad");
          refresh();
          routeDecision = "app";
        } else if (characterDone) {
          clearLegacyLocalMismatch();
          replaceLocalCharacter(buildLocalCharacterFromServer(profileMerged, statsMerged));
          setNeedsOnboardingPreferences(!prefs.exists);
          applyPrefsState();
          setGatePrefillProfile(null);
          setShowWelcomeSplash(false);
          setTab("quad");
          refresh();
          routeDecision = "app";
        } else {
          clearLegacyLocalMismatch();
          setNeedsOnboardingPreferences(false);
          setGatePrefillProfile(profileMerged);
          setShowWelcomeSplash(false);
          refresh();
          routeDecision = "character_gate";
        }

        logBootstrapDecision({
          sessionFound: true,
          sessionValidated: true,
          onboardingCompleted: profileMerged.onboarding_completed ?? null,
          route: routeDecision === "character_gate" ? "character_gate" : "app",
        });

        setBootstrapStatus("authenticated");
      } catch {
        if (!cancelled) {
          failUnauthenticated({ invalidateToken: true });
          logBootstrapDecision({
            sessionFound: true,
            sessionValidated: false,
            onboardingCompleted: profileSnap?.onboarding_completed ?? null,
            route: "unauthenticated",
          });
          setBootstrapStatus("unauthenticated");
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [mounted, bootstrapNonce, refresh]);

  useEffect(() => {
    if (pilotCampusState.status !== "loading") {
      setShowCampusSlowNotice(false);
      return;
    }
    const t = window.setTimeout(() => setShowCampusSlowNotice(true), 180);
    return () => window.clearTimeout(t);
  }, [pilotCampusState.status]);

  useEffect(() => {
    if (bootstrapStatus !== "authenticated") return;

    const token = getAccessToken();
    if (!token) {
      setPilotCampusState({ status: "error", message: "Session missing. Please sign in again." });
      return;
    }

    campusFetchGenRef.current += 1;
    const myGen = campusFetchGenRef.current;
    schoolVerificationLastHttpRef.current = null;

    const cached = peekSchoolVerificationSnapshot(token);
    if (cached) {
      setPilotCampusState({ status: "ready", snapshot: cached });
    } else {
      setPilotCampusState({ status: "loading" });
    }

    let cancelled = false;
    let settled = false;

    void (async () => {
      try {
        const snapshot = await fetchMeSchoolVerification(token);
        if (!cancelled && myGen === campusFetchGenRef.current) {
          schoolVerificationLastHttpRef.current = 200;
          setPilotCampusState({ status: "ready", snapshot });
          settled = true;
        }
      } catch (e) {
        if (cancelled || myGen !== campusFetchGenRef.current) return;
        if (e instanceof SchoolVerificationHttpError) {
          schoolVerificationLastHttpRef.current = e.status;
        }
        if (e instanceof SchoolVerificationHttpError && e.status === 401) {
          storeLogout();
          clearAccessToken();
          setCharacter(null);
          setBootstrapStatus("bootstrapping");
          setPilotCampusState({ status: "loading" });
          setBootstrapNonce((n) => n + 1);
          settled = true;
          return;
        }
        const fallback = peekSchoolVerificationSnapshot(token);
        if (fallback && myGen === campusFetchGenRef.current) {
          setPilotCampusState({ status: "ready", snapshot: fallback });
          settled = true;
          return;
        }
        const message =
          e instanceof SchoolVerificationHttpError
            ? e.message
            : "Could not verify campus eligibility. Please try again.";
        if (myGen === campusFetchGenRef.current) {
          setPilotCampusState({ status: "error", message });
          settled = true;
        }
      } finally {
        if (!cancelled && !settled && myGen === campusFetchGenRef.current) {
          const again = peekSchoolVerificationSnapshot(token);
          setPilotCampusState(
            again
              ? { status: "ready", snapshot: again }
              : { status: "error", message: "Could not verify campus eligibility. Please try again." },
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- campusFetchNonce forces retry; character.id optional for same session
  }, [bootstrapStatus, character?.id, campusFetchNonce]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (tab !== "friends") return;
    const peekTok = getAccessToken();
    const peekSnap = peekTok ? peekSchoolVerificationSnapshot(peekTok) : null;
    console.info("[cq] Friends eligibility", {
      httpStatus: schoolVerificationLastHttpRef.current,
      pilotStatus: pilotCampusState.status,
      ...(pilotCampusState.status === "ready"
        ? {
            verified: pilotCampusState.snapshot.verification.status === "verified",
            moderationAdminAccess: pilotCampusState.snapshot.moderationAdminAccess,
          }
        : peekSnap
          ? {
              peekVerified: peekSnap.verification.status === "verified",
              peekModerationAdminAccess: peekSnap.moderationAdminAccess,
              peekUnlocksPilotTabs: pilotCampusFeaturesUnlocked(peekSnap),
            }
          : { peekPresent: false }),
    });
  }, [tab, pilotCampusState, pilotCampusFeaturesUnlocked]);

  useEffect(() => {
    if (!character || character.totalXP < 300) return;
    try {
      if (typeof window !== "undefined" && !localStorage.getItem(XP300_POPUP_KEY)) {
        setShowLevel3Popup(true);
      }
    } catch {
      setShowLevel3Popup(true);
    }
  }, [character?.id, character?.totalXP]);

  function dismissLevel3Popup() {
    try {
      if (typeof window !== "undefined") localStorage.setItem(XP300_POPUP_KEY, "1");
    } catch {}
    setShowLevel3Popup(false);
  }

  function dismissBossVictory() {
    bossChestSequenceTimersRef.current.forEach((timerId) => clearTimeout(timerId));
    bossChestSequenceTimersRef.current = [];
    if (bossVictoryTimerRef.current) {
      clearTimeout(bossVictoryTimerRef.current);
      bossVictoryTimerRef.current = null;
    }
    setBossVictoryExiting(true);
    window.setTimeout(() => {
      setGainToast(null);
      setBossDefeatPhase(null);
      setBossVictoryExiting(false);
    }, 500);
  }

  const startBossChestReveal = useCallback(() => {
    if (bossDefeatPhase !== "teaser" || bossChestPhase !== "idle") return;

    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.([18, 40, 24]);
    }
    setBossChestPhase("opening");
    bossChestSequenceTimersRef.current.push(
      window.setTimeout(() => {
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate?.([10, 20, 40]);
        }
        setBossChestPhase("open");
      }, 900),
      // Hold the open chest state for 2 seconds before transitioning.
      window.setTimeout(() => setBossChestPhase("handoff"), 2900),
      window.setTimeout(() => {
        setBossDefeatPhase("reveal");
        setBossChestPhase("idle");
        bossChestSequenceTimersRef.current = [];
      }, 3400)
    );
  }, [bossDefeatPhase, bossChestPhase]);

  useEffect(() => {
    if (bossDefeatPhase === "teaser") return;
    bossChestSequenceTimersRef.current.forEach((timerId) => clearTimeout(timerId));
    bossChestSequenceTimersRef.current = [];
    setBossChestPhase("idle");
  }, [bossDefeatPhase]);

  useEffect(() => {
    if (bossDefeatPhase !== "reveal") return;
    bossVictoryTimerRef.current = window.setTimeout(dismissBossVictory, 10000);
    return () => {
      if (bossVictoryTimerRef.current) {
        clearTimeout(bossVictoryTimerRef.current);
        bossVictoryTimerRef.current = null;
      }
    };
  }, [bossDefeatPhase]);

  if (!mounted) {
    return (
      <div className="space-y-4 cq-skeleton-wrap">
        <div className="cq-skeleton h-12 rounded-xl w-3/4 max-w-xs" />
        <div className="card p-5 space-y-4">
          <div className="flex gap-4">
            <div className="cq-skeleton w-20 h-20 rounded-2xl" />
            <div className="flex-1 space-y-2">
              <div className="cq-skeleton h-5 rounded w-32" />
              <div className="cq-skeleton h-4 rounded w-24" />
              <div className="cq-skeleton h-3 rounded w-full mt-3" />
            </div>
          </div>
          <div className="cq-skeleton h-3 rounded w-full" />
          <div className="cq-skeleton h-3 rounded w-5/6" />
        </div>
        <div className="card p-4 space-y-2">
          <div className="cq-skeleton h-4 rounded w-40" />
          <div className="cq-skeleton h-11 rounded-xl" />
          <div className="cq-skeleton h-11 rounded-xl" />
        </div>
      </div>
    );
  }

  if (bootstrapStatus === "bootstrapping") {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 text-center">
        <div
          className="w-14 h-14 rounded-2xl bg-uri-keaney/20 border border-uri-keaney/40 flex items-center justify-center text-3xl mb-4"
          aria-hidden
        >
          🐏
        </div>
        <p className="text-base font-semibold text-white tracking-wide">Loading CampusQuest…</p>
        <p className="mt-2 text-sm text-white/55">Checking your session</p>
      </div>
    );
  }

  if (bootstrapStatus === "unauthenticated") {
    if (showWelcomeSplash) {
      return <WelcomeSplash onComplete={() => setShowWelcomeSplash(false)} />;
    }
    return (
      <AuthScreen
        onComplete={() => {
          setBootstrapNonce((n) => n + 1);
        }}
      />
    );
  }

  if (!character) {
    return (
      <>
        <Header
          username={null}
          character={null}
          onRefresh={refresh}
          showAdminNav={moderationAdminNavVisible(pilotCampusState)}
        />
        <CharacterGate
          prefillProfile={gatePrefillProfile}
          onReady={() => {
            refresh();
            setTab("quad");
            setBootstrapNonce((n) => n + 1);
          }}
        />
      </>
    );
  }

  function handleLog(activityId: string, options?: { minutes?: number; proofUrl?: string; tags?: string[] }) {
    if (!character) return null;
    const before = character;
    const result = logActivity(character.id, activityId, options);
    if (result) {
      const updated = result.character;
      setCharacter(updated);
      const def = getActivityById(activityId);
      const xp = Math.max(0, updated.totalXP - before.totalXP);
      const stats: Partial<Record<keyof Character["stats"], number>> = {};
      for (const k of STAT_KEYS) {
        const delta = (updated.stats?.[k] ?? 0) - (before.stats?.[k] ?? 0);
        if (delta > 0) stats[k] = delta;
      }
      const rarityLabel =
        result.lastBossDrop?.loot != null
          ? result.lastBossDrop.loot.rarity.charAt(0).toUpperCase() + result.lastBossDrop.loot.rarity.slice(1)
          : undefined;
      playXpDing();
      const modLines = result.xpBreakdown?.lines?.map((l) => ({ label: l.label, emoji: l.emoji }));
      setGainToast({
        xp,
        stats,
        title: def ? `${def.icon} ${def.label}` : "Activity logged",
        modifierLines: modLines,
        primaryStat: def?.stat,
        lastBossDrop: result.lastBossDrop
          ? {
              bossName: result.lastBossDrop.bossName,
              loot:
                result.lastBossDrop.loot != null
                  ? {
                      icon: result.lastBossDrop.loot.icon,
                      label: result.lastBossDrop.loot.label,
                      rarity: rarityLabel ?? result.lastBossDrop.loot.rarity,
                      equipEffect: describeCosmeticEquipEffect(result.lastBossDrop.loot.id),
                    }
                  : undefined,
            }
          : undefined,
      });
      if (result.leveledUp) {
        playLevelUpFanfare();
        setLevelUpModal(updated.level);
        setScreenShake(true);
        window.setTimeout(() => setScreenShake(false), 700);
      }
      if (result.lastBossDrop) {
        setBossChestPhase("idle");
        setBossDefeatPhase("teaser");
      }
      if (!result.lastBossDrop) {
        const ms = modLines && modLines.length > 2 ? 5200 : 3800;
        window.setTimeout(() => setGainToast(null), ms);
      }
      // Show 300 XP celebration when they just reached 300 total XP
      if (before.totalXP < 300 && updated.totalXP >= 300) {
        try {
          if (typeof window !== "undefined" && !localStorage.getItem(XP300_POPUP_KEY)) {
            setShowLevel3Popup(true);
          }
        } catch {
          setShowLevel3Popup(true);
        }
      }
      return result.character;
    }
    return null;
  }

  const navItems: { tab: Tab; icon: string; label: string }[] = [
    { tab: "quad", icon: "📋", label: "Quad" },
    { tab: "events", icon: "📅", label: "Events" },
    { tab: "organizations", icon: "🏛️", label: "Orgs" },
    { tab: "friends", icon: "👋", label: "Friends" },
    { tab: "battle", icon: "🐉", label: "Battle" },
    { tab: "leaderboards", icon: "🏆", label: "Rank" },
    { tab: "character", icon: "👤", label: "Character" },
  ];

  return (
    <>
      <Header
        username={character?.username ?? null}
        character={character}
        onRefresh={refresh}
        onOpenInbox={() => setTab("inbox")}
        onOpenNotifications={() => {
          setInboxSubTab("notifications");
          setTab("inbox");
        }}
        unreadNotificationCount={unreadNotificationCount}
        showAdminNav={moderationAdminNavVisible(pilotCampusState)}
      />
      <div
        className={screenShake ? "cq-screen-shake" : undefined}
        style={{ paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        {character && (
          <div className="mb-4 sm:mb-5">
            {beginnerJourneyHydration ? (
              <FirstTimeJourney
                character={character}
                currentTab={tab}
                onNavigateTab={setTab}
                onRefresh={refresh}
                onboardingHydrationBootstrap={beginnerJourneyHydration}
              />
            ) : (
              <div
                className="card min-h-[7rem] rounded-2xl border border-uri-gold/20 bg-white/[0.02] p-4 cq-skeleton-wrap overflow-hidden"
                aria-busy="true"
                aria-label="Loading beginner quest status"
              >
                <div className="cq-skeleton mb-3 h-4 w-44 rounded-lg" />
                <div className="cq-skeleton mb-2 h-3 w-full rounded-lg" />
                <div className="cq-skeleton h-3 max-w-[92%] rounded-lg" />
              </div>
            )}
          </div>
        )}
        {gainToast?.lastBossDrop && typeof document !== "undefined" && createPortal(
          bossDefeatPhase === "teaser" ? (
            <div
              className={`fixed inset-0 z-[100] flex items-center justify-center p-4 lootbox-teaser-enter ${
                bossChestPhase === "handoff" ? "lootbox-teaser-handoff" : ""
              } ${bossVictoryExiting ? "boss-victory-exit" : ""}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="lootbox-teaser-title"
              style={{ background: "radial-gradient(ellipse 100% 100% at 50% 40%, rgba(197,165,40,0.2) 0%, rgba(4,30,66,0.98) 45%, #041E42 100%)" }}
            >
              <div className="absolute inset-0 bg-black/50" aria-hidden />
              <div className="relative z-10 w-full max-w-md flex flex-col items-center text-center">
                <p className="text-uri-gold/90 font-semibold text-sm uppercase tracking-widest mb-2">Victory!</p>
                <h2 id="lootbox-teaser-title" className="lootbox-title-glow text-white font-display font-bold text-3xl mb-1">A loot box awaits</h2>
                <p className="text-white/70 text-sm mb-6">You defeated a boss. Open it to see what you earned.</p>
                <button
                  type="button"
                  onClick={startBossChestReveal}
                  className={`lootbox-teaser-glow relative flex items-center justify-center rounded-2xl border-4 border-uri-gold/60 bg-gradient-to-br from-uri-gold/30 to-uri-navy p-2 shadow-2xl transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-uri-gold w-64 h-64 sm:w-72 sm:h-72 min-w-[16rem] min-h-[16rem] overflow-visible ${
                    bossChestPhase === "idle"
                      ? "cursor-pointer hover:scale-105 active:scale-[0.98]"
                      : "cursor-default pointer-events-none"
                  }`}
                  aria-label="Open loot box"
                >
                  <span
                    aria-hidden
                    className={`lootbox-arcane-ring ${
                      bossChestPhase === "opening" || bossChestPhase === "open" || bossChestPhase === "handoff" ? "is-active" : ""
                    }`}
                  />
                  <span
                    aria-hidden
                    className={`lootbox-starfield ${
                      bossChestPhase === "opening" || bossChestPhase === "open" || bossChestPhase === "handoff" ? "is-active" : ""
                    }`}
                  />
                  <span
                    className={`lootbox-teaser-chest flex w-full h-full items-center justify-center pointer-events-none ${
                      bossChestPhase === "opening" ? "lootbox-teaser-chest-opening" : ""
                    } ${
                      bossChestPhase === "open" || bossChestPhase === "handoff" ? "lootbox-teaser-chest-opened" : ""
                    }`}
                  >
                    <img
                      src="/boss-chest-closed.png"
                      alt=""
                      className={`lootbox-chest-closed w-full h-full max-w-[14.5rem] max-h-[14.5rem] object-contain ${
                        bossChestPhase === "open" || bossChestPhase === "handoff" ? "opacity-0" : "opacity-100"
                      }`}
                      width={232}
                      height={232}
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                        const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                        if (fallback) fallback.style.display = "flex";
                      }}
                    />
                    <span
                      className="hidden w-full h-full items-center justify-center text-6xl sm:text-7xl"
                      style={{ display: "none" }}
                      aria-hidden
                    >
                      📦
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={`lootbox-chest-open absolute inset-0 flex items-center justify-center transition-all duration-500 ${
                      bossChestPhase === "open" || bossChestPhase === "handoff"
                        ? "opacity-100 scale-100"
                        : "opacity-0 scale-95"
                    }`}
                  >
                    <img
                      src="/boss-chest-open.png"
                      alt=""
                      className="w-full h-full max-w-[16rem] max-h-[16rem] object-contain"
                      width={256}
                      height={256}
                    />
                  </span>
                  <span
                    aria-hidden
                    className={`lootbox-magic-bloom ${bossChestPhase === "opening" || bossChestPhase === "open" || bossChestPhase === "handoff" ? "is-active" : ""}`}
                  />
                  <span
                    aria-hidden
                    className={`lootbox-magic-sparkles ${bossChestPhase === "opening" || bossChestPhase === "open" || bossChestPhase === "handoff" ? "is-active" : ""}`}
                  />
                </button>
                <p className="mt-6 text-white/60 text-sm">
                  {bossChestPhase === "idle"
                    ? "Tap the chest to open"
                    : bossChestPhase === "opening"
                      ? "Arcane seals breaking..."
                      : bossChestPhase === "open"
                        ? "Treasure revealed!"
                        : "Claiming your victory..."}
                </p>
              </div>
            </div>
          ) : (
            <div
              className={`fixed inset-0 z-[100] flex items-center justify-center p-4 boss-victory-enter ${bossVictoryExiting ? "boss-victory-exit" : ""}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="boss-victory-title"
              style={{ background: "radial-gradient(ellipse 80% 60% at 50% 30%, rgba(197,165,40,0.25) 0%, rgba(4,30,66,0.97) 50%, #041E42 100%)" }}
            >
              <div className="absolute inset-0 bg-black/40" aria-hidden />
              <div className="relative z-10 w-full max-w-md rounded-3xl border-2 border-uri-gold/50 bg-uri-navy/95 shadow-2xl boss-victory-glow overflow-hidden">
                <div className="p-6 sm:p-8 text-center">
                  <h2 id="boss-victory-title" className="boss-victory-title font-display font-black text-3xl sm:text-4xl text-transparent bg-clip-text bg-gradient-to-r from-uri-gold via-amber-200 to-uri-gold drop-shadow-lg">
                    BOSS DEFEATED!
                  </h2>
                  <p className="mt-2 text-white/90 font-semibold text-lg">
                    You defeated {gainToast.lastBossDrop.bossName}
                  </p>
                  <div className="boss-victory-card mt-6 rounded-2xl border border-white/15 bg-white/10 p-4 text-left">
                    <div className="text-sm text-white/80 font-medium mb-1">Activity</div>
                    <div className="text-white font-semibold">{gainToast.title}</div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm">
                      <span className="font-mono text-uri-keaney font-bold">+{gainToast.xp} XP</span>
                      {STAT_KEYS.filter((k) => (gainToast.stats as any)[k] > 0).map((k) => (
                        <span key={k} className="text-white/80">
                          {STAT_ICONS[k]} <span className="text-white font-medium">+{(gainToast.stats as any)[k]}</span> {STAT_LABELS[k]}
                        </span>
                      ))}
                    </div>
                  </div>
                  {gainToast.lastBossDrop.loot ? (
                    <div className="boss-victory-card mt-4 rounded-2xl border-2 border-uri-gold/40 bg-uri-gold/10 p-4">
                      <div className="text-xs font-semibold text-uri-gold/90 uppercase tracking-wider mb-2">Loot dropped</div>
                      <div className="flex items-center justify-center gap-3">
                        <span className="boss-victory-loot-icon inline-flex w-16 h-16 items-center justify-center text-4xl rounded-xl bg-white/15 border border-uri-gold/30">
                          {gainToast.lastBossDrop.loot.icon}
                        </span>
                        <div className="text-left min-w-0">
                          <div className="text-white font-bold text-lg">{gainToast.lastBossDrop.loot.label}</div>
                          <div className="text-uri-gold font-semibold text-sm">{gainToast.lastBossDrop.loot.rarity}</div>
                          <div className="text-emerald-200/90 text-xs mt-1.5 leading-snug">
                            When equipped: {gainToast.lastBossDrop.loot.equipEffect}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="boss-victory-card mt-4 rounded-2xl border-2 border-uri-gold/40 bg-uri-gold/10 p-4">
                      <div className="text-xs font-semibold text-uri-gold/90 uppercase tracking-wider mb-2">Loot</div>
                      <p className="text-white/80 text-sm">No new loot this time. Keep defeating bosses to collect more!</p>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={dismissBossVictory}
                    className="mt-6 w-full py-3.5 rounded-xl font-bold text-uri-navy bg-uri-gold hover:bg-amber-400 border-2 border-uri-gold/60 shadow-lg transition-transform active:scale-[0.98]"
                  >
                    Awesome!
                  </button>
                </div>
              </div>
            </div>
          ),
          document.body
        )}
        {gainToast && !gainToast.lastBossDrop && (
          <div className="fixed left-1/2 top-20 -translate-x-1/2 z-40 w-[min(28rem,92vw)] toast-enter">
            <div className="card px-4 py-3 border border-uri-keaney/40 bg-uri-navy shadow-keaney">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-white font-semibold truncate">{gainToast.title}</div>
                  <div className="text-xs text-white/60 mt-0.5">
                    <span
                      className={`font-mono text-uri-keaney font-bold cq-xp-burst ${
                        gainToast.primaryStat === "strength"
                          ? "stat-burst-strength"
                          : gainToast.primaryStat === "knowledge"
                            ? "stat-burst-knowledge"
                            : ""
                      }`}
                    >
                      +{gainToast.xp} XP
                    </span>
                    {Object.keys(gainToast.stats).length > 0 && <span className="text-white/40"> · </span>}
                    {STAT_KEYS.filter((k) => (gainToast.stats as any)[k] > 0).map((k) => (
                      <span key={k} className="mr-2">
                        {STAT_ICONS[k]} <span className="text-white/80">+{(gainToast.stats as any)[k]}</span>
                        <span className="text-white/40"> {STAT_LABELS[k]}</span>
                      </span>
                    ))}
                  </div>
                  {gainToast.modifierLines && gainToast.modifierLines.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {gainToast.modifierLines.map((l, i) => (
                        <span
                          key={`${l.label}-${i}`}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-uri-gold/15 text-uri-gold border border-uri-gold/35"
                        >
                          {l.emoji ? `${l.emoji} ` : ""}
                          {l.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setGainToast(null)}
                  className="text-white/40 hover:text-white/70"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        )}

      {showLevel3Popup && character && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="xp300-title">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={dismissLevel3Popup} aria-hidden />
          <div
            className="relative z-10 w-full max-w-sm rounded-3xl border-2 border-uri-gold/60 bg-uri-navy p-8 text-center level3-popup-enter level3-popup-glow"
            style={{
              background: "linear-gradient(180deg, rgba(197, 165, 40, 0.12) 0%, rgba(4, 30, 66, 0.98) 30%, #041E42 100%)",
              boxShadow: "0 0 40px rgba(197, 165, 40, 0.4), 0 0 80px rgba(104, 171, 232, 0.2), inset 0 1px 0 rgba(255,255,255,0.08)",
            }}
          >
            <div className="text-5xl mb-3" aria-hidden>🎉</div>
            <p className="text-uri-gold font-bold text-2xl mb-1" id="xp300-title">300 XP!</p>
            <p className="text-white font-semibold text-lg mb-2">Congratulations!</p>
            <p className="text-white/80 text-sm mb-6">
              You&apos;ve reached 300 total XP and unlocked <strong className="text-uri-keaney">Create Guild</strong>. Head to Find Friends to start or join a guild and earn bonus XP with other Rams.
            </p>
            <button
              type="button"
              onClick={dismissLevel3Popup}
              className="w-full py-3.5 rounded-xl bg-uri-keaney text-white font-bold text-sm hover:bg-uri-keaney/90 focus:outline-none focus:ring-2 focus:ring-uri-keaney focus:ring-offset-2 focus:ring-offset-uri-navy transition-colors shadow-lg"
            >
              Let&apos;s go!
            </button>
          </div>
        </div>,
        document.body
      )}

      {levelUpModal != null && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={() => setLevelUpModal(null)} aria-hidden />
          <div className="relative z-10 w-full max-w-sm rounded-3xl border-2 border-uri-keaney/60 bg-uri-navy p-8 text-center cq-level-up-burst cq-level-up-crown overflow-hidden">
            <span className="cq-level-up-sparkle" aria-hidden />
            <div className="text-6xl mb-2 cq-level-up-emoji" aria-hidden>
              ⭐
            </div>
            <p className="text-uri-keaney font-black text-3xl font-display">LEVEL {levelUpModal}</p>
            <p className="text-white/80 text-sm mt-3 mb-1">New skill point unlocked — open Skill tree on your Character tab.</p>
            <p className="text-uri-gold/90 text-xs mb-6">Your legend grows stronger.</p>
            <button
              type="button"
              onClick={() => setLevelUpModal(null)}
              className="w-full py-3.5 rounded-xl bg-uri-gold text-uri-navy font-bold text-sm hover:bg-amber-400"
            >
              Let&apos;s go!
            </button>
          </div>
        </div>,
        document.body
      )}

      <div key={tab} className="tab-content-enter space-y-5 sm:space-y-6">
        {tab === "inbox" && character && renderPilotCampusGate(
          <Inbox
            character={character}
            onBack={() => setTab("quad")}
            onOpenDm={setDmWithOther}
            personalization={onboardingPreferences}
            subTab={inboxSubTab}
            onSubTabChange={setInboxSubTab}
            onUnreadCountChange={setUnreadNotificationCount}
          />,
        )}

        {tab === "quad" && (
          <div className="space-y-4 sm:space-y-5">
            <div className="-mx-4 w-[calc(100%+2rem)] sm:mx-0 sm:w-full">
              <TheQuad character={character} onRefresh={refresh} />
            </div>
          </div>
        )}

        {tab === "friends" &&
          renderPilotCampusGate(<FindFriends character={character} onRefresh={refresh} onOpenDm={setDmWithOther} />)}

        {tab === "events" && renderPilotCampusGate(<EventsFeed personalization={onboardingPreferences} />)}

        {tab === "organizations" && renderPilotCampusGate(<OrganizationsHub personalization={onboardingPreferences} />)}

        {tab === "leaderboards" && (
          <Leaderboards character={character} />
        )}

        {tab === "battle" && (
          <div className="space-y-4 sm:space-y-5">
            <BossBattles character={character} onRefresh={refresh} />
          </div>
        )}

        {tab === "character" && (
          <section
            className="overflow-hidden rounded-xl border border-white/[0.08] shadow-[0_1px_0_0_rgba(104,171,232,0.12),0_8px_32px_-8px_rgba(0,0,0,0.45)] sm:rounded-2xl"
            style={{
              background: "linear-gradient(180deg, rgba(4, 30, 66, 0.98) 0%, rgba(3, 22, 48, 0.96) 100%)",
            }}
          >
            <div
              className="border-b border-white/[0.08] px-3 py-4 sm:px-5 sm:py-5"
              style={{
                background: "linear-gradient(165deg, rgba(104, 171, 232, 0.16) 0%, rgba(4, 30, 66, 0.95) 42%, rgba(4, 30, 66, 0.99) 100%)",
                boxShadow: "0 1px 0 0 rgba(104, 171, 232, 0.12)",
              }}
            >
              <div className="mb-4 flex items-start gap-3 sm:mb-5 sm:gap-4">
                <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-2xl border border-uri-keaney/45 bg-white shadow-[0_0_20px_rgba(104,171,232,0.2),inset_0_1px_0_rgba(255,255,255,0.08)] sm:h-24 sm:w-24">
                  <img
                    src="/rhody-ai-ram.png"
                    alt="Rhody AI mascot"
                    className="h-full w-full object-contain object-left"
                    width={96}
                    height={96}
                  />
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <h2 className="font-display text-lg font-bold leading-tight tracking-tight text-white sm:text-xl">Your Ram</h2>
                  <p className="mt-1 text-xs leading-relaxed text-white/60 sm:text-[13px] sm:text-white/55">
                    Level up, equip loot, and manage how you show up on the Quad.
                  </p>
                </div>
              </div>

              <div className="mb-4 rounded-2xl border border-uri-gold/35 bg-gradient-to-br from-uri-gold/[0.12] via-uri-gold/[0.04] to-transparent p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:mb-5 sm:p-4">
                <div className="mb-2.5 flex items-center gap-2">
                  <span className="text-sm" aria-hidden>
                    ⚡
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-uri-gold/95 sm:text-xs">Quick stats</span>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  <div className="rounded-xl border border-white/12 bg-black/25 px-2 py-2.5 text-center shadow-inner sm:px-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Level</div>
                    <div className="mt-0.5 font-display text-lg font-bold text-uri-keaney sm:text-xl">{character.level}</div>
                  </div>
                  <div className="rounded-xl border border-white/12 bg-black/25 px-2 py-2.5 text-center shadow-inner sm:px-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Streak</div>
                    <div className="mt-0.5 font-display text-lg font-bold text-white sm:text-xl">{character.streakDays}d</div>
                  </div>
                  <div className="rounded-xl border border-white/12 bg-black/25 px-2 py-2.5 text-center shadow-inner sm:px-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-white/45">XP</div>
                    <div className="mt-0.5 truncate font-mono text-sm font-bold text-uri-keaney/95 sm:text-base">
                      {character.totalXP.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/25 p-1 shadow-inner">
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => setCharacterPane("sheet")}
                    className={`rounded-xl px-2 py-3 text-center transition-all duration-200 sm:flex sm:items-center sm:justify-center sm:gap-2 sm:py-3 sm:pl-3 sm:pr-4 ${
                      characterPane === "sheet"
                        ? "bg-gradient-to-b from-uri-keaney/45 to-uri-keaney/20 text-white shadow-[0_0_24px_rgba(104,171,232,0.2)] ring-1 ring-uri-keaney/50"
                        : "text-white/55 hover:bg-white/[0.06] hover:text-white/85"
                    }`}
                  >
                    <span className="text-xl leading-none sm:text-lg" aria-hidden>
                      ⚔️
                    </span>
                    <span className="mt-1 block text-xs font-bold sm:mt-0 sm:text-sm">Character</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCharacterPane("profile")}
                    className={`rounded-xl px-2 py-3 text-center transition-all duration-200 sm:flex sm:items-center sm:justify-center sm:gap-2 sm:py-3 sm:pl-3 sm:pr-4 ${
                      characterPane === "profile"
                        ? "bg-gradient-to-b from-uri-keaney/45 to-uri-keaney/20 text-white shadow-[0_0_24px_rgba(104,171,232,0.2)] ring-1 ring-uri-keaney/50"
                        : "text-white/55 hover:bg-white/[0.06] hover:text-white/85"
                    }`}
                  >
                    <span className="text-xl leading-none sm:text-lg" aria-hidden>
                      👤
                    </span>
                    <span className="mt-1 block text-xs font-bold sm:mt-0 sm:text-sm">Profile</span>
                  </button>
                </div>
              </div>
              <p className="mt-3 text-center text-[11px] leading-relaxed text-white/45 sm:text-left sm:text-xs">
                {characterPane === "sheet"
                  ? "Log activities, skills, streaks, and weekly recap — your main progression hub."
                  : "Bio, equipment, stats sheet, Loot Codex, and posts you’ve shared to the Quad."}
              </p>
            </div>

            <div className="space-y-4 px-3 py-4 sm:space-y-5 sm:px-5 sm:py-5">
              {characterPane === "sheet" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                  <div className="md:col-span-2">
                    <CharacterCard character={character} onRefresh={refresh} />
                  </div>
                  <div className="md:col-span-2">
                    <ActivityList onLog={handleLog} />
                  </div>
                  <div className="md:col-span-2">
                    <StreakCard character={character} />
                  </div>
                  <div className="md:col-span-2">
                    <SurpriseQuestBanner character={character} />
                  </div>
                  <div className="md:col-span-2">
                    <SkillTreePanel character={character} onRefresh={refresh} />
                  </div>
                  <div className="md:col-span-2">
                    <DailyTrainingGames character={character} onRefresh={refresh} />
                  </div>
                  <div className="md:col-span-2">
                    <CollapsibleSection title="Lore archive" defaultCollapsed>
                      <LoreArchiveCard />
                    </CollapsibleSection>
                  </div>
                  <div className="md:col-span-2">
                    <CollapsibleSection title="Weekly recap" defaultCollapsed>
                      <WeeklyRecapCard character={character} />
                    </CollapsibleSection>
                  </div>
                  <div className="min-w-0 md:col-span-2">
                    <CollapsibleSection title="Recent activities" defaultCollapsed>
                      <RecentActivities characterId={character.id} />
                    </CollapsibleSection>
                  </div>
                </div>
              ) : (
                <Profile
                  character={character}
                  onLogout={handleLogout}
                  onRefresh={refresh}
                  moderationAdminAccess={moderationAdminNavVisible(pilotCampusState)}
                />
              )}
            </div>
          </section>
        )}
      </div>
      </div>

      {/* Bottom nav — aligned with content max width; items share row evenly */}
      <div
        className="fixed bottom-0 left-0 right-0 z-20 flex justify-center px-3 sm:px-4"
      >
        <nav
          className="w-full max-w-2xl flex items-stretch justify-evenly gap-0.5 sm:gap-1 rounded-t-2xl border border-b-0 border-uri-keaney/25 bg-uri-navy/95 px-1.5 pt-2 shadow-[0_-4px_24px_-4px_rgba(0,0,0,0.45),0_-1px_0_0_rgba(104,171,232,0.12)] backdrop-blur-md sm:px-3 sm:pt-2.5"
          style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom, 0px))" }}
          aria-label="Main navigation"
        >
        {navItems.map(({ tab: t, icon, label }) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2.5 transition-all touch-manipulation sm:px-2 ${
              tab === t
                ? "text-uri-keaney bg-gradient-to-b from-uri-keaney/25 to-uri-keaney/10 shadow-[0_6px_18px_-6px_rgba(104,171,232,0.9)]"
                : "text-white/60 hover:text-white/85 hover:bg-white/5 active:text-white/90"
            }`}
            aria-current={tab === t ? "page" : undefined}
          >
            <span className="text-xl leading-none" aria-hidden>{icon}</span>
            <span className={`w-full truncate text-center text-[10px] font-semibold tracking-wide sm:text-[11px] ${tab === t ? "text-uri-keaney" : "text-white/80"}`}>{label}</span>
          </button>
        ))}
        </nav>
      </div>

      {dmWithOther && character && (
        <DirectMessageThread
          currentUser={character}
          otherUser={dmWithOther}
          onClose={() => setDmWithOther(null)}
          onMessageSent={refresh}
        />
      )}

      {bootstrapStatus === "authenticated" && needsOnboardingPreferences && character ? (
        <OnboardingPreferencesModal
          onCompleted={(preferences) => {
            setOnboardingPreferences(preferences);
            setNeedsOnboardingPreferences(false);
            setBootstrapNonce((n) => n + 1);
          }}
        />
      ) : null}
    </>
  );
}
