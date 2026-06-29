"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "framer-motion";
import {
  getCharacter,
  logActivity,
  logQrActivity,
  recordQrLinkedActivityLog,
  type LogActivityResult,
  logout as storeLogout,
  replaceLocalCharacter,
  clearPersistedCharacter,
  hydrateClientMirrorFromGameState,
} from "@/lib/store";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";

import type { Character } from "@/lib/types";
import type { QuadPostXpReward } from "@/lib/quadPostXp";
import { CharacterCard } from "./CharacterCard";
import { CharacterGate } from "./CharacterGate";
import { AuthScreen } from "./AuthScreen";
import { ManualLogScreen } from "./ManualLogScreen";
import { ProgressHubScreen } from "./ProgressHubScreen";
import { SkillsLoreScreen } from "./SkillsLoreScreen";
import { TheQuad, type QuadFeedTab } from "./TheQuad";
import { BossBattles } from "./BossBattles";
import { FindFriends } from "./FindFriends";
import { Leaderboards } from "./Leaderboards";
import { MyProfileScreen } from "./MyProfileScreen";
import { UserProfileScreen } from "./UserProfileScreen";
import { CharacterProfilePaneToggle } from "./profile/CharacterProfilePaneToggle";
import type { ProfileTab } from "./profile/ProfileTabNav";
import { DirectMessageThread } from "./DirectMessageThread";
import { Inbox, type InboxSubTab } from "./Inbox";
import { SharePostSheet } from "@/components/messages/SharePostSheet";
import {
  buildShareTargetFromFieldNote,
  type SharePostTarget,
} from "@/lib/client/dmMessagesClient";
import { emitSocialSync, subscribeSocialSync } from "@/lib/client/socialSync";
import { EventsFeed } from "./EventsFeed";
import { OrganizationsHub } from "./OrganizationsHub";
import { TheRealm } from "./TheRealm";
import { STAT_KEYS, STAT_LABELS } from "@/lib/types";
import { StatIcon } from "@/components/stats/StatIcon";
import { getActivityById } from "@/lib/activities";
import { AvatarDisplay } from "./AvatarDisplay";
import { isGameMusicMuted, playXpDing, playLevelUpFanfare, setGameMusicMuted } from "@/lib/playGameSound";
import { recordUserActivityPing } from "@/lib/client/recordUserActivity";
import {
  evaluateXpMilestoneCrossing,
  fetchXpMilestoneStatus,
  markXpMilestonePopupShown,
  type XpMilestoneStatus,
} from "@/lib/client/xpMilestones";
import { unlockRewardAudioSilently } from "@/lib/client/xpCelebration";
import { logRewardFlow } from "@/lib/client/xpAnimationDebug";
import { unlockMobileForgeAudio } from "@/lib/client/xpCelebration";
import { buildRewardAnimationSnapshot } from "@/lib/client/rewardAnimationSnapshot";
import { estimateXpOverlayDurationMs, readMobileViewport } from "@/lib/client/xpRewardAnimation";
import { describeCosmeticEquipEffect } from "@/lib/gameBuffs";
import { TrainingGrounds } from "./training/TrainingGrounds";
import { TrophyRoom } from "./achievements/TrophyRoom";
import { AchievementUnlockCelebration } from "./achievements/AchievementUnlockCelebration";
import { QuestBoard } from "./quests/QuestBoard";
import { QuestCompleteCelebration } from "./quests/QuestCompleteCelebration";
import type { StatKey } from "@/lib/types";
import { clearAccessToken, getAccessToken } from "@/lib/client/apiSession";
import { clearStaleAuthClientState } from "@/lib/client/authSessionClient";
import { mustRedirectToAgreement, type LegalConsentPayload } from "@/lib/client/agreementAccess";
import {
  ApiRequestError,
  fetchAuthed,
  fetchMeSchoolVerification,
  postAuthed,
  type MeSchoolVerificationResponse,
  SchoolVerificationHttpError,
} from "@/lib/client/dashboardApi";
import {
  commitMeSessionSnapshot,
  fetchMeProfileAndStatsDeduped,
  getMeSessionSnapshot,
  invalidateMeSessionCache,
  resetMeSessionInflight,
} from "@/lib/client/meSessionCache";
import { scheduleNonCriticalWork } from "@/lib/client/deferNonCriticalWork";
import {
  fetchUserProfileView,
  buildCharacterFromProfileView,
  mapProfileViewPosts,
  type UserProfileViewPayload,
} from "@/lib/client/userProfileViewClient";
import { mergeRemoteQuadPostsForMutations } from "@/lib/feedStore";
import type { FieldNote } from "@/lib/types";
import { buildLocalCharacterFromServer, type MeProfileRow, type MeStatsRow } from "@/lib/client/profileCharacter";
import { syncAchievementsAfterHydrate } from "@/lib/client/achievementHydration";
import { subscribeAchievementFocus } from "@/lib/client/achievementFocus";
import { clearSchoolVerificationSnapshot, peekSchoolVerificationSnapshot } from "@/lib/client/schoolVerificationCache";
import { SchoolVerificationScreen } from "@/components/SchoolVerificationScreen";
import { dismissOnboardingTutorialOnServer } from "@/lib/client/dismissOnboardingTutorial";
import { resetMobileViewportScale } from "@/lib/client/modalViewportCleanup";
import { LOGOUT_BLOCKED_SAVE_MESSAGE, isServerBackedUserId, resetUserSaveSyncAfterHydrate } from "@/lib/client/gameStateSync";
import { hydrateUserPersistenceFromServer } from "@/lib/client/hydrateUserPersistence";
import { communityReminderStorageKey } from "./WelcomeBackCommunityReminder";
import { DashboardBootstrapShellSkeleton } from "./DashboardBootstrapShellSkeleton";
import { buildQrXpSession } from "@/lib/client/buildQrXpSession";
import { normalizeQrScanInput } from "@/lib/client/normalizeQrScanInput";
import { logQrScanDebug } from "@/lib/client/qrScanDebug";
import { QR_SCAN_USER_MESSAGES } from "@/lib/client/qrScanUserMessages";
import { redeemCampusQuestQr } from "@/lib/client/redeemCampusQuestQr";
import { LevelUpOverlay } from "@/components/xp/LevelUpOverlay";
import { XPGainBanner } from "@/components/xp/XPGainBanner";
import type { ActivityXPGainSession } from "@/components/xp/xpGainTypes";
import type { CampusQuestQrActivityPayloadParsed } from "@/lib/qrCampusQuestActivity";
import { AppSideDrawer, type AppDrawerDestination } from "@/components/AppSideDrawer";
import type { SettingsActionId } from "@/components/AppSettingsPanel";
import { AppBottomNav, type AppBottomNavTab } from "@/components/AppBottomNav";
import { MobileGestureLayerProvider } from "@/components/mobile/MobileGestureLayerProvider";
import { DashboardTabSwipeShell } from "@/components/mobile/DashboardTabSwipeShell";
import { type SwipeNavDirection } from "@/lib/client/mobileGestures";
import { useDrawerSwipeGestures } from "@/lib/client/useDrawerSwipeGestures";
import { useIsDrawerOpen } from "@/lib/client/appDrawerStore";
import { useScrollChrome } from "@/lib/client/useScrollChrome";
import { shouldShowBottomNav } from "@/lib/client/shouldShowBottomNav";
import { useImmersiveScreenDepth } from "@/lib/client/nestedImmersiveScreen";
import { useAppChromeLayout } from "@/lib/client/useAppChromeLayout";
import { LogoutConfirmModal } from "@/components/LogoutConfirmModal";

/** Load camera + CQ Scanner bundle only after the player taps CQ Scan (avoid mount/worker on cold start). */
const QRScannerModalLazy = dynamic(
  () => import("@/components/QRScannerModal").then((mod) => ({ default: mod.QRScannerModal })),
  { ssr: false },
);

type Tab = "quad" | "friends" | "battle" | "leaderboards" | "character" | "inbox" | "events" | "organizations" | "realm" | "mini-games" | "achievements" | "quest-board" | "manual-log" | "progress-hub" | "skills-lore";

const TAB_QUERY_VALUES: Tab[] = ["quad", "friends", "battle", "leaderboards", "character", "inbox", "events", "organizations", "realm"];

function createXpGainSessionKey(prefix = "xp"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

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

export function Dashboard() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [character, setCharacter] = useState<Character | null>(null);
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<Tab>("quad");
  const [quadFeedTab, setQuadFeedTab] = useState<QuadFeedTab>("public");
  const [inboxSubTab, setInboxSubTab] = useState<InboxSubTab>("messages");
  const [characterPane, setCharacterPane] = useState<CharacterPane>("sheet");
  const [profileTab, setProfileTab] = useState<ProfileTab>("posts");
  const [tabEnterDirection, setTabEnterDirection] = useState<SwipeNavDirection | null>(null);
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [logoutConfirmError, setLogoutConfirmError] = useState<string | null>(null);
  const [drawerSubPanel, setDrawerSubPanel] = useState<"menu" | "settings" | "help">("menu");
  const [gainToast, setGainToast] = useState<null | {
    xp: number;
    stats: Partial<Record<keyof Character["stats"], number>>;
    title: string;
    activityLabel?: string;
    lastBossDrop?: { bossName: string; loot?: { icon: string; label: string; rarity: string; equipEffect: string } };
    modifierLines?: { label: string; emoji?: string }[];
    primaryStat?: StatKey;
  }>(null);
  const [bossDefeatPhase, setBossDefeatPhase] = useState<"teaser" | "reveal" | null>(null);
  const [bossChestPhase, setBossChestPhase] = useState<"idle" | "opening" | "open" | "handoff">("idle");
  const [bossVictoryExiting, setBossVictoryExiting] = useState(false);
  const bossVictoryTimerRef = useRef<number | null>(null);
  const bossChestSequenceTimersRef = useRef<number[]>([]);
  const [pendingMilestonePopup, setPendingMilestonePopup] = useState<XpMilestoneStatus | null>(null);
  const [xpGainSession, setXpGainSession] = useState<ActivityXPGainSession | null>(null);
  const qrXpHandoffLockRef = useRef(false);
  const [dmWithOther, setDmWithOther] = useState<{ userId: string; username: string; name: string; avatar: string } | null>(null);

  const openDirectMessage = useCallback(
    (other: { userId: string; username: string; name: string; avatar: string }) => {
      setDmWithOther(other);
      setInboxSubTab("messages");
      setTab("inbox");
    },
    [],
  );

  const closeDirectMessage = useCallback(() => {
    setDmWithOther(null);
    setInboxSubTab("messages");
    setTab("inbox");
  }, []);
  const [sharePostTarget, setSharePostTarget] = useState<SharePostTarget | null>(null);
  const [sharePostOpen, setSharePostOpen] = useState(false);
  const [friendView, setFriendView] = useState<{
    payload: UserProfileViewPayload;
    character: Character;
    posts: FieldNote[];
  } | null>(null);
  const [friendViewLoading, setFriendViewLoading] = useState(false);
  const [friendViewError, setFriendViewError] = useState<string | null>(null);
  const friendViewReturnTabRef = useRef<Tab>("quad");
  const tabRef = useRef<Tab>(tab);
  /** Lightweight tab back-stack so screens like Events/Organizations can return to wherever they were opened from. */
  const tabHistoryRef = useRef<Tab[]>([]);
  const friendViewUserIdRef = useRef<string | null>(null);
  const [screenShake, setScreenShake] = useState(false);
  const [levelUpModal, setLevelUpModal] = useState<number | null>(null);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [onboardingPreferences, setOnboardingPreferences] = useState<{
    schoolName: string;
    interests: string[];
    discoveryFocus: string[];
    major?: string | null;
  } | null>(null);
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus>("bootstrapping");
  const [bootstrapNonce, setBootstrapNonce] = useState(0);
  const [gatePrefillProfile, setGatePrefillProfile] = useState<MeProfileRow | null>(null);
  const [pilotCampusState, setPilotCampusState] = useState<PilotCampusState>({ status: "loading" });
  const [campusFetchNonce, setCampusFetchNonce] = useState(0);
  const [showCampusSlowNotice, setShowCampusSlowNotice] = useState(false);
  const campusFetchGenRef = useRef(0);
  const [musicMuted, setMusicMuted] = useState(false);
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  /** Mount scanner module after first open so AnimatePresence can exit; chunk still loads on first tap only. */
  const [qrScannerEverOpened, setQrScannerEverOpened] = useState(false);
  const [pendingScanCode, setPendingScanCode] = useState<string | null>(null);
  const [qrDeepLinkError, setQrDeepLinkError] = useState<string | null>(null);
  const deepLinkRedeemRef = useRef<string | null>(null);
  const streakHydrationTimerRef = useRef<number | null>(null);

  const prevTotalXpRef = useRef<number | null>(null);
  /** Last `/api/me/school-verification` HTTP status for this fetch attempt (dev logging only). */
  const schoolVerificationLastHttpRef = useRef<number | null>(null);
  /** Dev-only: prevents double-reset from React strict mode duplicate effects. */
  const onboardingQcResetRanRef = useRef(false);
  const dismissedMilestoneKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t && TAB_QUERY_VALUES.includes(t as Tab)) {
      setTab(t as Tab);
    }
  }, [searchParams]);

  const showMilestonePopupIfNeeded = useCallback((popup: XpMilestoneStatus | null | undefined) => {
    if (!popup || dismissedMilestoneKeysRef.current.has(popup.key)) return;
    setPendingMilestonePopup(popup);
  }, []);

  const syncMilestonePopupAfterXp = useCallback(async (previousTotalXp: number, currentTotalXp: number) => {
    if (currentTotalXp <= previousTotalXp) return;
    try {
      const snapshot = await evaluateXpMilestoneCrossing(previousTotalXp, currentTotalXp);
      const popup =
        snapshot.pendingPopups.find((milestone) => snapshot.newlyUnlocked.includes(milestone.key)) ??
        snapshot.pendingPopups[0] ??
        null;
      showMilestonePopupIfNeeded(popup);
    } catch {
      // Milestone popups must not block XP flows.
    }
  }, [showMilestonePopupIfNeeded]);

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
              className="min-h-[28vh] rounded-2xl border border-white/10 bg-white/5 cq-skeleton-wrap overflow-hidden"
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
        return <p className="text-sm text-white/60 py-10 text-center px-4">Checking campus eligibility…</p>;
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

  const openSharePost = useCallback((target: SharePostTarget) => {
    setSharePostTarget(target);
    setSharePostOpen(true);
  }, []);

  const openSharePostFromNote = useCallback((note: FieldNote, postType: "quad" | "memory" = "quad") => {
    const target = buildShareTargetFromFieldNote(note, postType);
    if (target) openSharePost(target);
  }, [openSharePost]);

  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    friendViewUserIdRef.current = friendView?.character.id ?? null;
  }, [friendView?.character.id]);

  const closeFriendView = useCallback(() => {
    setFriendView(null);
    setFriendViewError(null);
    setTab(friendViewReturnTabRef.current);
  }, []);

  const openFriendView = useCallback(async (userId: string) => {
    const current = getCharacter();
    if (!current) return;
    friendViewReturnTabRef.current = tabRef.current;
    if (userId === current.id) {
      setFriendView(null);
      setFriendViewError(null);
      setTab("character");
      setCharacterPane("profile");
      return;
    }
    setFriendViewLoading(true);
    setFriendViewError(null);
    setTab("character");
    setCharacterPane("profile");
    try {
      const payload = await fetchUserProfileView(userId);
      const nextCharacter = buildCharacterFromProfileView(payload, current.id);
      const posts = mapProfileViewPosts(payload, current.id);
      if (payload.canViewPrivateContent) {
        mergeRemoteQuadPostsForMutations(posts);
      }
      setFriendView({ payload, character: nextCharacter, posts });
    } catch (error) {
      setFriendView(null);
      setFriendViewError(error instanceof Error ? error.message : "Could not load this profile.");
    } finally {
      setFriendViewLoading(false);
    }
  }, []);

  const reloadFriendView = useCallback(async () => {
    const current = getCharacter();
    const targetId = friendViewUserIdRef.current;
    if (!current || !targetId) return;
    try {
      const payload = await fetchUserProfileView(targetId);
      const nextCharacter = buildCharacterFromProfileView(payload, current.id);
      const posts = mapProfileViewPosts(payload, current.id);
      if (payload.canViewPrivateContent) {
        mergeRemoteQuadPostsForMutations(posts);
      }
      setFriendView({ payload, character: nextCharacter, posts });
    } catch {
      /* keep current */
    }
  }, []);

  const scheduleStreakHydrationFromBackend = useCallback((delayMs = 1300) => {
    if (typeof window === "undefined") return;
    const current = getCharacter();
    if (!current || !isServerBackedUserId(current.id) || !getAccessToken()) return;
    if (streakHydrationTimerRef.current != null) {
      window.clearTimeout(streakHydrationTimerRef.current);
      streakHydrationTimerRef.current = null;
    }
    streakHydrationTimerRef.current = window.setTimeout(() => {
      streakHydrationTimerRef.current = null;
      if (!getAccessToken()) return;
      void fetchAuthed<MeProfileRow>("/api/me/profile")
        .then((profile) => {
          const latest = getCharacter();
          if (!latest || latest.id !== profile.id) return;
          const next: Character = {
            ...latest,
            streakDays: Math.max(0, Number(profile.streak_days ?? 0)),
            lastActivityDate: profile.last_activity_date ?? null,
          };
          replaceLocalCharacter(next, { skipRemoteSync: true });
          setCharacter(next);
        })
        .catch(() => {
          // Keep local streak as fallback when backend profile cannot be loaded.
        });
    }, delayMs);
  }, []);

  useEffect(() => {
    return subscribeAchievementFocus((achievementId) => {
      if (achievementId) setTab("achievements");
    });
  }, []);

  const refreshAuthoritativeProfileInBackground = useCallback(() => {
    if (!getAccessToken()) return;
    invalidateMeSessionCache();
    void fetchMeProfileAndStatsDeduped().then((snap) => {
      if (snap?.profile && snap?.stats) {
        const merged = syncAchievementsAfterHydrate(buildLocalCharacterFromServer(snap.profile, snap.stats));
        replaceLocalCharacter(merged, { skipRemoteSync: true });
        setCharacter(merged);
      }
    });
  }, []);

  const handleQuadPostXpReward = useCallback(
    (reward: QuadPostXpReward) => {
      if (reward.awarded && reward.xpAmount > 0) {
        playXpDing();
        setGainToast({
          xp: reward.xpAmount,
          stats: {},
          title: "Posted to The Quad",
        });
        window.setTimeout(() => setGainToast(null), 3800);
      }
      refreshAuthoritativeProfileInBackground();
      scheduleStreakHydrationFromBackend();
    },
    [refreshAuthoritativeProfileInBackground, scheduleStreakHydrationFromBackend],
  );

  const handleClientSessionMissing = useCallback(() => {
    clearStaleAuthClientState();
    clearSchoolVerificationSnapshot();
    storeLogout();
    setCharacter(null);
    setFriendView(null);
    setFriendViewError(null);
    setBootstrapStatus("unauthenticated");
  }, []);

  const navigateToQuad = useCallback(() => {
    setTab("quad");
    setQrScannerOpen(false);
    setPendingScanCode(null);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", "quad");
      url.searchParams.delete("scan");
      const qs = url.searchParams.toString();
      router.replace(qs ? `${url.pathname}?${qs}` : url.pathname);
    }
  }, [router]);

  const adminQrUnlimited = moderationAdminNavVisible(pilotCampusState);

  const openQrScanner = useCallback(() => {
    logRewardFlow("scanner_opened");
    if (readMobileViewport()) void unlockMobileForgeAudio();
    void unlockRewardAudioSilently();
    setQrScannerEverOpened(true);
    setQrScannerOpen(true);
  }, []);

  /** Switch tabs while recording the previous tab on a back-stack (deduped, no duplicate routes). */
  const navigateToTab = useCallback((next: Tab) => {
    const current = tabRef.current;
    if (current === next) return;
    const history = tabHistoryRef.current;
    if (history[history.length - 1] !== current) {
      history.push(current);
      if (history.length > 20) history.shift();
    }
    setTab(next);
  }, []);

  /** Return to the previous tab on the back-stack, falling back to the Quad when empty (deep links). */
  const goBackTab = useCallback(() => {
    const previous = tabHistoryRef.current.pop();
    setTab(previous ?? "quad");
  }, []);

  const handleDrawerNavigate = useCallback(
    (dest: AppDrawerDestination | "guilds" | "mini-games" | "achievements" | "quest-board" | "settings" | "manual-log" | "progress-hub" | "skills-lore" | "collectibles" | "scan") => {
      switch (dest) {
        case "friends":
          setTab("friends");
          break;
        case "quad":
          setTab("quad");
          setQuadFeedTab("public");
          break;
        case "trending":
          setTab("quad");
          setQuadFeedTab("trending");
          break;
        case "leaderboards":
          setTab("leaderboards");
          break;
        case "events":
          navigateToTab("events");
          break;
        case "realm":
          setTab("realm");
          break;
        case "organizations":
          navigateToTab("organizations");
          break;
        case "guilds":
          setTab("friends");
          break;
        case "battle":
          setTab("battle");
          break;
        case "inbox":
          setTab("inbox");
          break;
        case "character-sheet":
          setTab("character");
          setCharacterPane("sheet");
          break;
        case "achievements":
          setTab("achievements");
          break;
        case "quest-board":
          setTab("quest-board");
          break;
        case "manual-log":
          setTab("manual-log");
          break;
        case "progress-hub":
          setTab("progress-hub");
          break;
        case "skills-lore":
          setTab("skills-lore");
          break;
        case "mini-games":
          setTab("mini-games");
          break;
        case "profile":
          setTab("character");
          setCharacterPane("profile");
          setProfileTab("posts");
          break;
        case "collectibles":
          setTab("character");
          setCharacterPane("profile");
          setProfileTab("collectibles");
          break;
        case "settings":
          setDrawerSubPanel("settings");
          setSideMenuOpen(true);
          break;
        case "help":
          setDrawerSubPanel("help");
          setSideMenuOpen(true);
          break;
        case "scan":
          openQrScanner();
          break;
        default:
          break;
      }
    },
    [openQrScanner, navigateToTab],
  );

  const bottomNavActive: AppBottomNavTab | "other" =
    tab === "quad" || tab === "realm" || tab === "leaderboards" || tab === "character"
      ? tab
      : "other";

  const bottomNavSwipeActive: AppBottomNavTab | null = bottomNavActive === "other" ? null : bottomNavActive;

  const immersiveScreenDepth = useImmersiveScreenDepth();
  const drawerBlocksNavigation = useIsDrawerOpen();
  const showBottomNav = shouldShowBottomNav({
    tab,
    friendProfileOpen: friendView != null,
    settingsDrawerOpen: sideMenuOpen && drawerSubPanel === "settings",
    immersiveScreenDepth,
  });
  useAppChromeLayout(showBottomNav);

  const quadChromeSuppressed =
    qrScannerOpen ||
    sideMenuOpen ||
    showLogoutConfirm ||
    dmWithOther != null ||
    sharePostOpen ||
    levelUpModal != null ||
    xpGainSession != null;

  useScrollChrome({
    enabled: bootstrapStatus === "authenticated" && !quadChromeSuppressed,
    topChrome: tab === "quad" && !quadChromeSuppressed,
  });

  const tabSwipeGestureDisabled =
    quadChromeSuppressed ||
    friendView != null ||
    drawerBlocksNavigation;

  const handleBottomNavSwipe = useCallback(
    (nextTab: AppBottomNavTab, direction: SwipeNavDirection) => {
      if (drawerBlocksNavigation) return;
      setTabEnterDirection(direction);
      setTab(nextTab);
      if (nextTab === "quad") setQuadFeedTab("public");
      if (nextTab === "character") {
        setCharacterPane("profile");
        setProfileTab("posts");
      }
    },
    [drawerBlocksNavigation],
  );

  const openSideMenu = useCallback(() => {
    setDrawerSubPanel("menu");
    setSideMenuOpen(true);
  }, []);

  const closeSideMenu = useCallback(() => {
    setSideMenuOpen(false);
    setDrawerSubPanel("menu");
  }, []);

  const drawerSwipeDisabled = quadChromeSuppressed || friendView != null;

  const {
    drawerWidth,
    drawerTranslateX,
    isDraggingDrawer,
    drawerOpenProgress,
  } = useDrawerSwipeGestures({
    open: sideMenuOpen,
    onOpen: openSideMenu,
    onClose: closeSideMenu,
    disabled: drawerSwipeDisabled,
  });

  const handleQrXpHandoff = useCallback((session: ActivityXPGainSession) => {
    if (qrXpHandoffLockRef.current && !adminQrUnlimited) {
      logQrScanDebug("scan_ignored_duplicate", {
        reason: "xp_overlay_active",
        sessionKey: session.sessionKey,
      });
      return;
    }
    qrXpHandoffLockRef.current = true;
    logRewardFlow("xp_handoff", {
      xp: session.xpGained,
      mobile: readMobileViewport(),
      sessionKey: session.sessionKey,
    });
    setQrScannerOpen(false);
    setPendingScanCode(null);
    setQrDeepLinkError(null);
    setXpGainSession(session);
  }, [adminQrUnlimited]);

  const processQrRedeemVerdict = useCallback(
    (verdict: Awaited<ReturnType<typeof redeemCampusQuestQr>>, source: "deep_link" | "scanner") => {
      if (verdict.ok) {
        setQrDeepLinkError(null);
        if (verdict.xpSession) {
          logRewardFlow("validation_success", {
            xp: verdict.xpSession.xpGained,
            beforeTotalXP: verdict.xpSession.beforeTotalXP,
            afterTotalXP: verdict.xpSession.afterTotalXP,
            forgeAudio: "silent_until_fill_started",
          });
          void unlockRewardAudioSilently();
          if (readMobileViewport()) void unlockMobileForgeAudio();
          handleQrXpHandoff(verdict.xpSession);
          return;
        }
        if (source === "scanner") return;
        setGainToast({
          xp: verdict.reward.xp,
          stats: {},
          title: `${verdict.reward.sigilName} logged!`,
          activityLabel: verdict.reward.sigilName,
        });
        navigateToQuad();
        return;
      }
      setQrDeepLinkError(verdict.banner);
      if (source === "deep_link") {
        setQrScannerEverOpened(true);
        setQrScannerOpen(true);
      }
    },
    [handleQrXpHandoff, navigateToQuad],
  );

  const handleSecureQrCode = useCallback(
    async (code: string) => {
      if (!character) {
        return { ok: false as const, banner: "Create your CampusQuest profile before opening CQ Scanner." };
      }
      const verdict = await redeemCampusQuestQr({
        code,
        character,
        getCharacter,
        replaceLocalCharacter,
      });
      if (verdict.ok) {
        const deferProfileUntilXpOverlay = Boolean(verdict.xpSession ?? verdict.handoffToXpOverlay);
        if (!deferProfileUntilXpOverlay) {
          setCharacter(getCharacter());
          refreshAuthoritativeProfileInBackground();
        }
        scheduleStreakHydrationFromBackend();
      }
      return verdict;
    },
    [character, refreshAuthoritativeProfileInBackground, scheduleStreakHydrationFromBackend],
  );

  useEffect(() => {
    const deepLinkCode = searchParams.get("scan")?.trim();
    if (!deepLinkCode) {
      deepLinkRedeemRef.current = null;
      return;
    }
    if (!character || bootstrapStatus !== "authenticated") return;
    if (deepLinkRedeemRef.current === deepLinkCode) return;
    deepLinkRedeemRef.current = deepLinkCode;

    const normalized = normalizeQrScanInput(deepLinkCode);
    logQrScanDebug("format_detected", {
      path: "deep_link",
      rawPreview: deepLinkCode,
      format: normalized?.format ?? "unrecognized",
      extractedCode: normalized?.code ?? null,
      activityId: normalized?.code ?? null,
    });

    if (!normalized) {
      setQrDeepLinkError(QR_SCAN_USER_MESSAGES.invalidFormat);
      setQrScannerEverOpened(true);
      setQrScannerOpen(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      const verdict = await redeemCampusQuestQr({
        code: normalized.code,
        character,
        getCharacter,
        replaceLocalCharacter,
      });
      if (cancelled) return;
      processQrRedeemVerdict(verdict, "deep_link");
      if (verdict.ok) {
        if (!verdict.xpSession) {
          setCharacter(getCharacter());
          refreshAuthoritativeProfileInBackground();
        }
        scheduleStreakHydrationFromBackend();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    searchParams,
    character,
    bootstrapStatus,
    processQrRedeemVerdict,
    refreshAuthoritativeProfileInBackground,
    scheduleStreakHydrationFromBackend,
  ]);

  const finishXpGainOverlay = useCallback(
    (finished: ActivityXPGainSession) => {
      const ms = finished.modifierLines && finished.modifierLines.length > 2 ? 5200 : 3800;
      qrXpHandoffLockRef.current = false;
      setXpGainSession(null);
      if (finished.beforeTotalXP < finished.afterTotalXP) {
        void syncMilestonePopupAfterXp(finished.beforeTotalXP, finished.afterTotalXP);
      }
      if (finished.pendingCharacter) {
        const current = getCharacter();
        if (current) {
          replaceLocalCharacter({
            ...current,
            totalXP: finished.pendingCharacter.totalXP,
            level: finished.pendingCharacter.level,
            stats: { ...current.stats, ...finished.pendingCharacter.stats },
          });
          setCharacter(getCharacter());
        }
      }
      if (finished.afterQrScan) {
        setGainToast({
          xp: finished.xpGained,
          stats: finished.stats,
          title: finished.title,
          activityLabel: finished.activityLabel,
          modifierLines: finished.modifierLines,
          primaryStat: finished.primaryStat,
        });
        navigateToQuad();
        refresh();
        refreshAuthoritativeProfileInBackground();
        window.setTimeout(() => setGainToast(null), ms);
        return;
      }
      setGainToast({
        xp: finished.xpGained,
        stats: finished.stats,
        title: finished.title,
        activityLabel: finished.activityLabel,
        modifierLines: finished.modifierLines,
        primaryStat: finished.primaryStat,
      });
      window.setTimeout(() => setGainToast(null), ms);
    },
    [navigateToQuad, refresh, refreshAuthoritativeProfileInBackground, syncMilestonePopupAfterXp],
  );

  const handleLogout = useCallback(async () => {
    const token = getAccessToken();
    const c = getCharacter();
    if (token && c && isServerBackedUserId(c.id)) {
      try {
        const { flushUserStateToBackend } = await import("@/lib/client/gameStateSync");
        await flushUserStateToBackend(getCharacter);
      } catch {
        throw new Error(LOGOUT_BLOCKED_SAVE_MESSAGE);
      }
    }
    clearAccessToken();
    invalidateMeSessionCache();
    resetMeSessionInflight();
    clearSchoolVerificationSnapshot();
    storeLogout();
    setCharacter(null);
    setGatePrefillProfile(null);
    setOnboardingPreferences(null);
    setXpGainSession(null);
    setQrScannerOpen(false);
    setQrScannerEverOpened(false);
    setBootstrapStatus("bootstrapping");
    setCampusFetchNonce(0);
    setPilotCampusState({ status: "loading" });
    setBootstrapNonce((n) => n + 1);
  }, []);

  const openLogoutConfirm = useCallback(() => {
    setLogoutConfirmError(null);
    setShowLogoutConfirm(true);
  }, []);

  const cancelLogoutConfirm = useCallback(() => {
    if (isSigningOut) return;
    setShowLogoutConfirm(false);
    setIsSigningOut(false);
    setLogoutConfirmError(null);
  }, [isSigningOut]);

  const confirmLogout = useCallback(async () => {
    setLogoutConfirmError(null);
    setIsSigningOut(true);
    try {
      await handleLogout();
      setShowLogoutConfirm(false);
      setSideMenuOpen(false);
      setDrawerSubPanel("menu");
    } catch (err) {
      setLogoutConfirmError(err instanceof Error ? err.message : LOGOUT_BLOCKED_SAVE_MESSAGE);
    } finally {
      setIsSigningOut(false);
    }
  }, [handleLogout]);

  const handleSettingsAction = useCallback(
    (action: SettingsActionId) => {
      switch (action) {
        case "account":
        case "profile-character":
          setTab("character");
          setCharacterPane("profile");
          break;
        case "notifications":
          setTab("inbox");
          break;
        case "privacy":
          if (typeof window !== "undefined") {
            window.location.href = "/legal/privacy";
          }
          break;
        case "campus":
          setTab("character");
          setCharacterPane("profile");
          break;
        case "qr-permissions":
          openQrScanner();
          break;
        case "appearance":
          break;
        case "sound":
          setMusicMuted((muted) => {
            const next = !muted;
            setGameMusicMuted(next);
            return next;
          });
          return;
        default:
          break;
      }
    },
    [openQrScanner],
  );

  useEffect(() => {
    setMounted(true);
    setMusicMuted(isGameMusicMuted());
  }, []);

  useEffect(() => {
    if (qrScannerOpen) setQrScannerEverOpened(true);
  }, [qrScannerOpen]);

  useEffect(() => {
    if (!character) {
      prevTotalXpRef.current = null;
      return;
    }
    const prev = prevTotalXpRef.current;
    if (prev != null && character.totalXP > prev) {
      scheduleStreakHydrationFromBackend();
    }
    prevTotalXpRef.current = character.totalXP;
  }, [character?.id, character?.totalXP, scheduleStreakHydrationFromBackend]);

  useEffect(() => {
    return () => {
      if (streakHydrationTimerRef.current != null) {
        window.clearTimeout(streakHydrationTimerRef.current);
        streakHydrationTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (bootstrapStatus !== "authenticated" || !character) return;
    let cancelled = false;
    let intervalId = 0;
    async function loadUnread() {
      const t0 = typeof performance !== "undefined" ? performance.now() : 0;
      try {
        const data = await fetchAuthed<{ notifications: unknown[]; unreadCount: number }>("/api/notifications?limit=1");
        const ms = typeof performance !== "undefined" ? performance.now() - t0 : 0;
        console.log("[cq:load] notifications", Math.round(ms), "ms");
        if (!cancelled) setUnreadNotificationCount(Number(data.unreadCount ?? 0));
      } catch {
        if (!cancelled) setUnreadNotificationCount(0);
      }
    }
    const tid = scheduleNonCriticalWork(() => void loadUnread());
    intervalId = window.setInterval(() => {
      void loadUnread();
    }, 45000);
    const unsubscribeSocial = subscribeSocialSync(() => void loadUnread());
    return () => {
      cancelled = true;
      window.clearTimeout(tid);
      window.clearInterval(intervalId);
      unsubscribeSocial();
    };
  }, [bootstrapStatus, character?.id]);

  useEffect(() => {
    if (bootstrapStatus !== "authenticated" || !character?.id) return;
    void hydrateUserPersistenceFromServer(character.id);
  }, [bootstrapStatus, character?.id]);

  useEffect(() => {
    if (bootstrapStatus !== "authenticated" || !character?.id) return;
    recordUserActivityPing();
  }, [bootstrapStatus, character?.id]);

  useEffect(() => {
    if (bootstrapStatus !== "authenticated" || !character?.id) return;
    if (tab === "events" || tab === "realm" || tab === "organizations") {
      recordUserActivityPing();
    }
  }, [bootstrapStatus, character?.id, tab]);

  useEffect(() => {
    if (bootstrapStatus !== "authenticated") return;
    let teardown: (() => void) | undefined;
    void import("@/lib/client/gameStateSync").then((m) => {
      teardown = m.installPagehidePersistenceFlush(getCharacter);
    });
    return () => {
      teardown?.();
    };
  }, [bootstrapStatus]);

  useEffect(() => {
    if (bootstrapStatus !== "authenticated") return;
    resetMobileViewportScale();
  }, [bootstrapStatus, bootstrapNonce]);

  useEffect(() => {
    if (bootstrapStatus !== "authenticated" || !character?.id) return;
    void dismissOnboardingTutorialOnServer();
  }, [bootstrapStatus, character?.id]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (searchParams.get("qc_reset_onboarding") !== "1") return;
    if (bootstrapStatus !== "authenticated" || !character?.id) return;
    if (onboardingQcResetRanRef.current) return;
    onboardingQcResetRanRef.current = true;

    try {
      const u = new URL(window.location.href);
      u.searchParams.delete("qc_reset_onboarding");
      window.history.replaceState({}, "", `${u.pathname}${u.search}${u.hash}`);
    } catch {
      // ignore
    }

    void (async () => {
      const id = character.id;
      try {
        const { patchAuthed } = await import("@/lib/client/dashboardApi");
        const {
          onboardingIntroLsKey,
          beginnerCelebrationAckKey,
          beginnerClaimedKey,
        } = await import("@/lib/client/beginnerOnboardingHydration");
        try {
          localStorage.removeItem(onboardingIntroLsKey(id));
          localStorage.removeItem(beginnerCelebrationAckKey(id));
          localStorage.removeItem(beginnerClaimedKey(id));
          localStorage.removeItem(communityReminderStorageKey(id));
        } catch {
          /* ignore */
        }
        await patchAuthed("/api/me/profile", {
          starterIntroSeenReset: true,
          beginnerChainCelebrationSeenReset: true,
        });
      } catch {
        /* ignore */
      }
    })();
  }, [searchParams, bootstrapStatus, character?.id]);

  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;

    async function bootstrap() {
      setBootstrapStatus("bootstrapping");
      setCharacter(null);

      const tokenAtStart = getAccessToken();

      const failUnauthenticated = (opts?: { invalidateToken?: boolean }) => {
        if (opts?.invalidateToken) clearAccessToken();
        invalidateMeSessionCache();
        storeLogout();
        clearSchoolVerificationSnapshot();
        setGatePrefillProfile(null);
        setOnboardingPreferences(null);
        refresh();
      };

      if (!tokenAtStart) {
        failUnauthenticated({ invalidateToken: false });
        logBootstrapDecision({ sessionFound: false, route: "unauthenticated" });
        setBootstrapStatus("unauthenticated");
        return;
      }

      // Current Terms / Privacy / Community Guidelines must be accepted before any app data loads.
      try {
        const consentRes = await fetch("/api/legal/consent/status", {
          headers: { Authorization: `Bearer ${tokenAtStart}` },
          cache: "no-store",
        });
        const consentJson = (await consentRes.json()) as {
          data?: LegalConsentPayload;
          error?: { message?: string };
        };

        if (consentRes.status === 401) {
          if (!cancelled) {
            failUnauthenticated({ invalidateToken: true });
            logBootstrapDecision({
              sessionFound: true,
              sessionValidated: false,
              onboardingCompleted: null,
              route: "unauthenticated",
            });
            setBootstrapStatus("unauthenticated");
          }
          return;
        }

        if (!consentRes.ok || mustRedirectToAgreement(consentJson.data)) {
          if (!cancelled) router.replace("/agreement");
          return;
        }
      } catch {
        if (!cancelled) router.replace("/agreement");
        return;
      }

      // Server fetch below will replace/merge local character; keep existing blob for same-user re-login.

      invalidateMeSessionCache();

      let profileSnap: MeProfileRow | null = null;

      try {
        const tCrit = typeof performance !== "undefined" ? performance.now() : 0;
        const snap0 = await fetchMeProfileAndStatsDeduped();
        if (!snap0?.profile || !snap0?.stats) {
          if (!cancelled) {
            failUnauthenticated({ invalidateToken: true });
            logBootstrapDecision({
              sessionFound: true,
              sessionValidated: false,
              onboardingCompleted: null,
              route: "unauthenticated",
            });
            setBootstrapStatus("unauthenticated");
          }
          return;
        }
        let profileMerged = snap0.profile;
        let statsMerged = snap0.stats;

        const localPre = getCharacter();
        if (
          localPre &&
          localPre.id === profileMerged.id &&
          !localPre.id.startsWith("char-") &&
          Number(localPre.totalXP) > Number(statsMerged.total_xp ?? 0)
        ) {
          const { pushCharacterProgressToServer } = await import("@/lib/client/gameStateSync");
          await pushCharacterProgressToServer(localPre);
          const snap1 = await fetchMeProfileAndStatsDeduped();
          if (!snap1?.profile || !snap1?.stats) {
            throw new Error("profile_resync_failed");
          }
          profileMerged = snap1.profile;
          statsMerged = snap1.stats;
        }

        if (typeof performance !== "undefined") {
          console.log("[cq:load] bootstrap critical (profile+stats+LSPush)", Math.round(performance.now() - tCrit), "ms");
        }

        profileSnap = profileMerged;

        if (cancelled) return;

        const onboardingDone = Boolean(profileMerged.onboarding_completed);
        const characterDone = Boolean(profileMerged.onboarding_character_completed);

        const commitSnap = () => {
          commitMeSessionSnapshot({
            userId: profileMerged.id,
            profile: profileMerged,
            stats: statsMerged,
          });
        };

        const clearLegacyLocalMismatch = () => {
          const local = getCharacter();
          if (local && (local.id !== profileMerged.id || local.id.startsWith("char-"))) {
            clearPersistedCharacter();
          }
        };

        const scheduleDeferredOnboardingPrefs = () => {
          scheduleNonCriticalWork(() => {
            void (async () => {
              if (cancelled) return;
              const tp = typeof performance !== "undefined" ? performance.now() : 0;
              try {
                const prefsResp = await fetchAuthed<{
                  exists: boolean;
                  preferences: {
                    schoolName: string;
                    interests: string[];
                    discoveryFocus: string[];
                    major?: string | null;
                  } | null;
                }>("/api/me/onboarding-preferences");
                if (typeof performance !== "undefined") {
                  console.log("[cq:load] onboarding-preferences deferred", Math.round(performance.now() - tp), "ms");
                }
                if (cancelled) return;
                if (prefsResp.preferences) {
                  setOnboardingPreferences({
                    schoolName: prefsResp.preferences.schoolName,
                    interests: prefsResp.preferences.interests,
                    discoveryFocus: prefsResp.preferences.discoveryFocus,
                    major: prefsResp.preferences.major ?? null,
                  });
                } else {
                  setOnboardingPreferences(null);
                }
              } catch {
                if (cancelled) return;
                setOnboardingPreferences(null);
              }
            })();
          });
        };

        let routeDecision: "character_gate" | "app" = "character_gate";

        if (onboardingDone) {
          clearLegacyLocalMismatch();
          commitSnap();
          const merged = syncAchievementsAfterHydrate(buildLocalCharacterFromServer(profileMerged, statsMerged));
          hydrateClientMirrorFromGameState(profileMerged.game_state_json ?? undefined, profileMerged.id);
          replaceLocalCharacter(merged, { skipRemoteSync: true });
          setCharacter(merged);
          resetUserSaveSyncAfterHydrate();
          setGatePrefillProfile(null);
          setTab("quad");
          routeDecision = "app";
        } else if (characterDone) {
          clearLegacyLocalMismatch();
          commitSnap();
          const merged = syncAchievementsAfterHydrate(buildLocalCharacterFromServer(profileMerged, statsMerged));
          hydrateClientMirrorFromGameState(profileMerged.game_state_json ?? undefined, profileMerged.id);
          replaceLocalCharacter(merged, { skipRemoteSync: true });
          setCharacter(merged);
          resetUserSaveSyncAfterHydrate();
          setGatePrefillProfile(null);
          setTab("quad");
          routeDecision = "app";
        } else {
          clearLegacyLocalMismatch();
          commitSnap();
          setGatePrefillProfile(profileMerged);
          refresh();
          routeDecision = "character_gate";
        }

        scheduleDeferredOnboardingPrefs();

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
  }, [mounted, bootstrapNonce, refresh, router]);

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
          invalidateMeSessionCache();
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
    if (bootstrapStatus !== "authenticated" || !character?.id || !isServerBackedUserId(character.id)) return;
    let cancelled = false;
    void fetchXpMilestoneStatus()
      .then((status) => {
        if (!cancelled) showMilestonePopupIfNeeded(status.pendingPopups[0]);
      })
      .catch(() => {
        // Ignore milestone fetch failures on login.
      });
    return () => {
      cancelled = true;
    };
  }, [bootstrapStatus, character?.id, showMilestonePopupIfNeeded]);

  async function dismissMilestonePopup() {
    const milestone = pendingMilestonePopup;
    setPendingMilestonePopup(null);
    if (!milestone) return;
    dismissedMilestoneKeysRef.current.add(milestone.key);
    try {
      await markXpMilestonePopupShown(milestone.key);
    } catch {
      // Popup already dismissed locally; server will retry on next login if needed.
    }
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
    if (typeof window !== "undefined" && getAccessToken()) {
      return <DashboardBootstrapShellSkeleton />;
    }
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
      <CharacterGate
        prefillProfile={gatePrefillProfile}
        onReady={() => {
          refresh();
          setTab("quad");
          setBootstrapNonce((n) => n + 1);
        }}
      />
    );
  }

  function presentLogResult(
    before: Character,
    result: LogActivityResult,
    opts: {
      title: string;
      primaryStat?: StatKey;
      activityLabel?: string;
      activityQuestType?: string;
      afterQrScan?: boolean;
    },
  ) {
    const updated = result.character;
    setCharacter(updated);
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

    if (result.lastBossDrop) {
      setGainToast({
        xp,
        stats,
        title: opts.title,
        modifierLines: modLines,
        primaryStat: opts.primaryStat,
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
    } else {
      setXpGainSession({
        sessionKey: createXpGainSessionKey(opts.afterQrScan ? "xp-qr" : "xp"),
        beforeTotalXP: before.totalXP,
        afterTotalXP: updated.totalXP,
        xpGained: xp,
        title: opts.title,
        stats,
        modifierLines: modLines,
        primaryStat: opts.primaryStat,
        leveledUp: Boolean(result.leveledUp),
        activityLabel: opts.activityLabel,
        activityQuestType: opts.activityQuestType,
        afterQrScan: opts.afterQrScan,
      });
    }
    if (result.leveledUp && result.lastBossDrop) {
      playLevelUpFanfare();
      setLevelUpModal(updated.level);
      setScreenShake(true);
      window.setTimeout(() => setScreenShake(false), 700);
    }
    if (result.lastBossDrop) {
      setBossChestPhase("idle");
      setBossDefeatPhase("teaser");
    }
    if (before.totalXP < updated.totalXP && isServerBackedUserId(updated.id)) {
      void syncMilestonePopupAfterXp(before.totalXP, updated.totalXP);
    }
  }

  function handleLog(activityId: string, options?: import("@/lib/store").LogActivityOptions) {
    if (!character) return null;
    const before = character;
    const result = logActivity(character.id, activityId, options);
    if (result) {
      const def = getActivityById(activityId);
      presentLogResult(before, result, {
        title: def ? `${def.label} logged!` : "Activity logged",
        primaryStat: def?.stat,
        activityLabel: def?.label,
      });
      scheduleStreakHydrationFromBackend();
      return result.character;
    }
    return null;
  }

  function handleQrPayloadValidated(payload: CampusQuestQrActivityPayloadParsed) {
    if (!character)
      return { ok: false as const, banner: "Create your CampusQuest profile before opening CQ Scanner." };
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return {
        ok: false as const,
        banner: "CQ Scanner lost the Quad link — check your connection, then scan the QR code again.",
      };
    }
    const before = character;
    const out = logQrActivity(character.id, payload);
    if (out.ok === false) {
      logQrScanDebug("validation_failed", {
        path: "legacy_local",
        activityId: payload.activityId,
        type: payload.activityId,
        failureReason: out.reason,
      });
      if (out.reason === "duplicate") {
        return { ok: false as const, banner: QR_SCAN_USER_MESSAGES.alreadyScanned };
      }
      if (out.reason === "expired") {
        return { ok: false as const, banner: QR_SCAN_USER_MESSAGES.expired };
      }
      return { ok: false as const, banner: QR_SCAN_USER_MESSAGES.activityNotActive };
    }
    const updated = out.result.character;
    const xp = Math.max(0, updated.totalXP - before.totalXP);
    scheduleStreakHydrationFromBackend();

    if (xp > 0) {
      const stats: Partial<Record<StatKey, number>> = {};
      if (payload.statIncrease > 0) stats[payload.stat] = payload.statIncrease;
      return {
        ok: true as const,
        suppressVictoryOverlay: true,
        handoffToXpOverlay: true,
        xpSession: buildQrXpSession({
          beforeTotalXP: before.totalXP,
          afterTotalXP: updated.totalXP,
          xpGained: xp,
          title: `${payload.activityName} logged!`,
          activityLabel: payload.activityName,
          primaryStat: payload.stat,
          stats,
          leveledUp: Boolean(out.result.leveledUp),
          pendingCharacter: {
            totalXP: updated.totalXP,
            level: updated.level,
            stats: updated.stats,
          },
        }),
        reward: {
          xp,
          statLabel: STAT_LABELS[payload.stat],
          statIncrease: payload.statIncrease,
          leveledUp: Boolean(out.result.leveledUp),
          levelAfter: updated.level,
          sigilName: payload.activityName,
        },
      };
    }

    setQrScannerOpen(false);
    setPendingScanCode(null);
    presentLogResult(before, out.result, {
      title: `${payload.activityName} logged!`,
      primaryStat: payload.stat,
      activityLabel: payload.activityName,
      afterQrScan: false,
    });
    return {
      ok: true as const,
      reward: {
        xp,
        statLabel: STAT_LABELS[payload.stat],
        statIncrease: payload.statIncrease,
        leveledUp: Boolean(out.result.leveledUp),
        levelAfter: updated.level,
        sigilName: payload.activityName,
      },
    };
  }

  const tabFullBleed = tab === "quad" || tab === "character" || tab === "inbox";

  return (
    <MobileGestureLayerProvider>
      <div className="cq-app-shell min-h-[100dvh]">
      <AppSideDrawer
        open={sideMenuOpen}
        onClose={closeSideMenu}
        character={character}
        onNavigate={handleDrawerNavigate}
        onSettingsAction={handleSettingsAction}
        onRequestSignOut={openLogoutConfirm}
        initialPanel={drawerSubPanel}
        showAdminNav={moderationAdminNavVisible(pilotCampusState)}
        unreadNotificationCount={unreadNotificationCount}
        musicMuted={musicMuted}
        activeContext={{ tab, quadFeedTab, characterPane, profileTab }}
        drawerWidth={drawerWidth}
        drawerTranslateX={drawerTranslateX}
        isDraggingDrawer={isDraggingDrawer}
        drawerOpenProgress={drawerOpenProgress}
      />
      <LogoutConfirmModal
        open={showLogoutConfirm}
        isSigningOut={isSigningOut}
        error={logoutConfirmError}
        onCancel={cancelLogoutConfirm}
        onConfirm={() => void confirmLogout()}
      />
      <div className={screenShake ? "cq-screen-shake cq-dashboard-scroll-pad" : "cq-dashboard-scroll-pad"}>
        {xpGainSession && (
          <LevelUpOverlay
            session={xpGainSession}
            minimumDurationMs={
              xpGainSession.afterQrScan
                ? estimateXpOverlayDurationMs({
                    isMobile: readMobileViewport(),
                    afterQrScan: true,
                    segmentCount: buildRewardAnimationSnapshot(
                      xpGainSession.beforeTotalXP,
                      xpGainSession.afterTotalXP,
                    ).segments.length,
                  }) + 400
                : 5000
            }
            onComplete={finishXpGainOverlay}
          />
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
                        <span key={k} className="inline-flex items-center gap-1 text-white/80">
                          <StatIcon stat={k} variant="glyph" size="sm" />
                          <span className="text-white font-medium">+{(gainToast.stats as any)[k]}</span> {STAT_LABELS[k]}
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
        {gainToast &&
          !gainToast.lastBossDrop &&
          typeof document !== "undefined" &&
          createPortal(
            <div className="pointer-events-none fixed inset-x-0 top-20 z-[120] flex justify-end px-3 sm:px-4">
              <div className="pointer-events-auto w-[min(28rem,calc(100vw-1.5rem))] shrink-0 sm:w-[min(28rem,calc(100vw-2rem))]">
                <XPGainBanner
                  title={gainToast.title}
                  xpGained={gainToast.xp}
                  activityLabel={gainToast.activityLabel}
                  visible
                  stats={gainToast.stats}
                  primaryStat={gainToast.primaryStat}
                  modifierLines={gainToast.modifierLines}
                  onDismiss={() => setGainToast(null)}
                />
              </div>
            </div>,
            document.body
          )}

      {pendingMilestonePopup && character && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="xp-milestone-title">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => void dismissMilestonePopup()} aria-hidden />
          <div
            className="relative z-10 w-full max-w-sm rounded-3xl border-2 border-uri-gold/60 bg-uri-navy p-8 text-center level3-popup-enter level3-popup-glow"
            style={{
              background: "linear-gradient(180deg, rgba(197, 165, 40, 0.12) 0%, rgba(4, 30, 66, 0.98) 30%, #041E42 100%)",
              boxShadow: "0 0 40px rgba(197, 165, 40, 0.4), 0 0 80px rgba(104, 171, 232, 0.2), inset 0 1px 0 rgba(255,255,255,0.08)",
            }}
          >
            <div className="text-5xl mb-3" aria-hidden>🎉</div>
            <p className="text-uri-gold font-bold text-2xl mb-1" id="xp-milestone-title">
              {pendingMilestonePopup.threshold} XP!
            </p>
            <p className="text-white font-semibold text-lg mb-2">Congratulations!</p>
            <p className="text-white/80 text-sm mb-6">{pendingMilestonePopup.description}</p>
            <button
              type="button"
              onClick={() => void dismissMilestonePopup()}
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

      <DashboardTabSwipeShell
        activeTab={bottomNavSwipeActive}
        tabKey={tab}
        tabEnterDirection={tabEnterDirection}
        onTabEnterDirectionDone={() => setTabEnterDirection(null)}
        onTabChange={handleBottomNavSwipe}
        disabled={tabSwipeGestureDisabled}
        className={`tab-content-enter cq-tab-shell ${tabFullBleed ? "w-full pb-0" : "space-y-6 sm:space-y-7 px-4 pb-8"}`}
      >
        {tab === "inbox" && character && renderPilotCampusGate(
          <Inbox
            character={character}
            onBack={() => setTab("quad")}
            onOpenDm={openDirectMessage}
            personalization={onboardingPreferences}
            subTab={inboxSubTab}
            onSubTabChange={setInboxSubTab}
            onUnreadCountChange={setUnreadNotificationCount}
          />,
        )}

        {tab === "quad" && (
          <TheQuad
            character={character}
            onRefresh={refresh}
            feedTab={quadFeedTab}
            onFeedTabChange={setQuadFeedTab}
            onViewAuthor={(author) => void openFriendView(author.userId)}
            onSharePost={(note) => openSharePostFromNote(note, "quad")}
            sessionReady={bootstrapStatus === "authenticated"}
            onSessionMissing={handleClientSessionMissing}
            onOpenMenu={openSideMenu}
            onOpenInbox={() => setTab("inbox")}
            unreadNotificationCount={unreadNotificationCount}
            chromeSuppressed={quadChromeSuppressed}
            canModeratePosts={moderationAdminNavVisible(pilotCampusState)}
            onPostXpReward={handleQuadPostXpReward}
            onLogQuest={() => setTab("manual-log")}
          />
        )}

        {tab === "friends" &&
          renderPilotCampusGate(
            <FindFriends
              character={character}
              onRefresh={refresh}
              onOpenDm={openDirectMessage}
              onViewProfile={openFriendView}
            />,
          )}

        {tab === "events" &&
          renderPilotCampusGate(
            <EventsFeed
              personalization={onboardingPreferences}
              showAdminSyncLink={moderationAdminNavVisible(pilotCampusState)}
              onBack={goBackTab}
            />,
          )}

        {tab === "realm" &&
          renderPilotCampusGate(
            <TheRealm
              onBack={() => setTab("quad")}
              onCreatePost={() => setTab("quad")}
              onViewProfile={openFriendView}
              onSharePost={openSharePost}
              viewer={
                character
                  ? {
                      id: character.id,
                      name: character.name,
                      username: character.username,
                      avatar: character.avatar,
                    }
                  : null
              }
              userId={character?.id ?? null}
              isAdmin={moderationAdminNavVisible(pilotCampusState)}
              userRole={moderationAdminNavVisible(pilotCampusState) ? "admin" : "student"}
            />,
          )}

        {tab === "organizations" && renderPilotCampusGate(<OrganizationsHub personalization={onboardingPreferences} onBack={goBackTab} />)}

        {tab === "leaderboards" && (
          <Leaderboards
            character={character}
            onRefresh={refreshAuthoritativeProfileInBackground}
            onViewProfile={openFriendView}
          />
        )}

        {tab === "battle" && (
          <div className="space-y-4 sm:space-y-5">
            <BossBattles character={character} onRefresh={refresh} />
          </div>
        )}

        {tab === "mini-games" && (
          <TrainingGrounds character={character} onRefresh={refresh} />
        )}

        {tab === "achievements" && (
          <TrophyRoom character={character} onRefresh={refresh} />
        )}

        {tab === "quest-board" && (
          <QuestBoard character={character} onRefresh={refreshAuthoritativeProfileInBackground} />
        )}

        {tab === "manual-log" && character && (
          <ManualLogScreen character={character} onLog={handleLog} onBack={() => setTab("quad")} />
        )}

        {tab === "progress-hub" && character && <ProgressHubScreen character={character} />}

        {tab === "skills-lore" && character && (
          <SkillsLoreScreen character={character} onRefresh={refresh} />
        )}

        {tab === "character" && character ? (
          <div className="cq-profile-screen">
            {!friendView && !friendViewLoading ? (
              <CharacterProfilePaneToggle value={characterPane} onChange={setCharacterPane} />
            ) : null}
            {friendViewLoading ? (
              <p className="py-16 text-center text-sm text-white/60">Loading profile…</p>
            ) : friendView ? (
              <UserProfileScreen
                character={friendView.character}
                viewer={character}
                canViewPrivateContent={friendView.payload.canViewPrivateContent}
                relationshipStatus={friendView.payload.relationshipStatus}
                mutualFriendsCount={friendView.payload.counts.mutualFriends}
                initialPosts={friendView.posts}
                friendsCount={friendView.payload.counts.friends}
                postCount={friendView.payload.counts.posts}
                guildLabel={friendView.payload.user.guild}
                onBack={closeFriendView}
                onOpenMessage={openDirectMessage}
                onProfileReload={reloadFriendView}
                onSharePost={(note) => openSharePostFromNote(note, "quad")}
                canModeratePosts={moderationAdminNavVisible(pilotCampusState)}
              />
            ) : friendViewError ? (
              <div className="space-y-3 px-3 py-12 text-center">
                <p className="text-sm text-red-300">{friendViewError}</p>
                <button
                  type="button"
                  onClick={() => setFriendViewError(null)}
                  className="text-sm font-medium text-uri-keaney hover:text-uri-keaney/80"
                >
                  Dismiss
                </button>
              </div>
            ) : characterPane === "profile" ? (
              <MyProfileScreen
                character={character}
                onLogout={handleLogout}
                onRefresh={refresh}
                onViewFriend={openFriendView}
                onSharePost={(note) => openSharePostFromNote(note, "quad")}
                moderationAdminAccess={moderationAdminNavVisible(pilotCampusState)}
                activeProfileTab={profileTab}
                onProfileTabChange={setProfileTab}
              />
            ) : (
              <CharacterCard character={character} onRefresh={refresh} />
            )}
          </div>
        ) : null}
      </DashboardTabSwipeShell>
      </div>

      {character && showBottomNav ? (
        <button
          type="button"
          onClick={() => {
            const next = !musicMuted;
            setMusicMuted(next);
            setGameMusicMuted(next);
          }}
          className={`cq-bottom-chrome-follower fixed z-40 h-6 w-6 rounded-full border border-white/15 bg-black/30 text-[10px] text-white/50 backdrop-blur-sm transition hover:text-white/85 ${tab === "quad" ? "left-3" : "right-2"}`}
          title={musicMuted ? "Unmute game music" : "Mute game music"}
          aria-label={musicMuted ? "Unmute game music" : "Mute game music"}
          aria-pressed={musicMuted}
        >
          {musicMuted ? "🔇" : "🔊"}
        </button>
      ) : null}

      <AnimatePresence>
        {showBottomNav ? (
          <AppBottomNav
            key="cq-bottom-nav"
            activeTab={bottomNavActive}
            userAvatar={character?.avatar}
            avatarLoading={!character}
            unreadBadgeCount={unreadNotificationCount}
            onOpenScanner={() => {
              if (drawerBlocksNavigation) return;
              openQrScanner();
            }}
            onSelectTab={(t) => {
              if (drawerBlocksNavigation) return;
              setTab(t);
              if (t === "quad") setQuadFeedTab("public");
              if (t === "character") {
                setCharacterPane("profile");
                setProfileTab("posts");
              }
            }}
          />
        ) : null}
      </AnimatePresence>

      {dmWithOther && character && (
        <DirectMessageThread
          currentUser={character}
          otherUser={dmWithOther}
          onClose={closeDirectMessage}
          onMessageSent={refresh}
        />
      )}

      <SharePostSheet
        open={sharePostOpen}
        target={sharePostTarget}
        onClose={() => {
          setSharePostOpen(false);
          setSharePostTarget(null);
        }}
        onShared={() => emitSocialSync({ source: "inbox" })}
      />

      {character && qrScannerEverOpened ? (
        <QRScannerModalLazy
          open={qrScannerOpen}
          onClose={() => {
            setQrScannerOpen(false);
            setPendingScanCode(null);
          }}
          onPayloadValidated={handleQrPayloadValidated}
          onSecureCodeScanned={handleSecureQrCode}
          onXpHandoff={handleQrXpHandoff}
          pendingScanCode={pendingScanCode}
          prefillErrorBanner={qrDeepLinkError}
          allowRepeatQrScan={adminQrUnlimited}
        />
      ) : null}

      {character ? (
        <>
          <AchievementUnlockCelebration />
          <QuestCompleteCelebration />
        </>
      ) : null}
      </div>
    </MobileGestureLayerProvider>
  );
}
