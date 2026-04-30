"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { getCharacter, logActivity, logout as storeLogout } from "@/lib/store";
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
import { Inbox } from "./Inbox";
import { STAT_KEYS, STAT_ICONS, STAT_LABELS } from "@/lib/types";
import { getActivityById } from "@/lib/activities";
import { AvatarDisplay } from "./AvatarDisplay";
import { playXpDing, playLevelUpFanfare } from "@/lib/playGameSound";
import { describeCosmeticEquipEffect } from "@/lib/gameBuffs";
import { SkillTreePanel } from "./SkillTreePanel";
import { SurpriseQuestBanner } from "./SurpriseQuestBanner";
import { DailyTrainingGames } from "./DailyTrainingGames";
import type { StatKey } from "@/lib/types";

type Tab = "quad" | "friends" | "battle" | "leaderboards" | "character" | "inbox";

/** Sub-view on the Character tab (Quad-style toggle). */
type CharacterPane = "sheet" | "profile";

function Header({
  username,
  character,
  onRefresh,
  onOpenInbox,
}: {
  username: string | null;
  character: Character | null;
  onRefresh?: () => void;
  onOpenInbox?: () => void;
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
  const [character, setCharacter] = useState<Character | null>(null);
  const [mounted, setMounted] = useState(false);
  const [showWelcomeSplash, setShowWelcomeSplash] = useState(true);
  const [showAuthScreen, setShowAuthScreen] = useState(true);
  const [tab, setTab] = useState<Tab>("quad");
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

  const XP300_POPUP_KEY = "campusquest_300xp_celebrated";

  const refresh = useCallback(() => {
    setCharacter(getCharacter());
  }, []);

  const handleLogout = useCallback(() => {
    storeLogout();
    setCharacter(null);
    setShowAuthScreen(true);
  }, []);

  useEffect(() => {
    setMounted(true);
    refresh();
  }, [refresh]);

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
      <div className="space-y-4">
        <div className="h-12 rounded-xl bg-white/10 w-3/4 max-w-xs" />
        <div className="card p-5 space-y-4">
          <div className="flex gap-4">
            <div className="w-20 h-20 rounded-2xl bg-white/10" />
            <div className="flex-1 space-y-2">
              <div className="h-5 bg-white/10 rounded w-32" />
              <div className="h-4 bg-white/10 rounded w-24" />
              <div className="h-3 bg-white/10 rounded w-full mt-3" />
            </div>
          </div>
          <div className="h-3 bg-white/10 rounded w-full" />
          <div className="h-3 bg-white/10 rounded w-5/6" />
        </div>
        <div className="card p-4 space-y-2">
          <div className="h-4 bg-white/10 rounded w-40" />
          <div className="h-11 bg-white/10 rounded-xl" />
          <div className="h-11 bg-white/10 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!character) {
    if (showWelcomeSplash) {
      return <WelcomeSplash onComplete={() => setShowWelcomeSplash(false)} />;
    }
    if (showAuthScreen) {
      return (
        <AuthScreen onComplete={() => setShowAuthScreen(false)} />
      );
    }
    return (
      <>
        <Header username={null} character={null} onRefresh={refresh} />
        <CharacterGate onReady={() => { refresh(); setTab("quad"); }} />
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
    { tab: "friends", icon: "👋", label: "Friends" },
    { tab: "battle", icon: "🐉", label: "Battle" },
    { tab: "leaderboards", icon: "🏆", label: "Rank" },
    { tab: "character", icon: "👤", label: "Character" },
  ];

  return (
    <>
      <Header username={character?.username ?? null} character={character} onRefresh={refresh} onOpenInbox={() => setTab("inbox")} />
      <div
        className={screenShake ? "cq-screen-shake" : undefined}
        style={{ paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))" }}
      >
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
          <div className="relative z-10 w-full max-w-sm rounded-3xl border-2 border-uri-keaney/60 bg-uri-navy p-8 text-center cq-level-up-burst overflow-hidden">
            <div className="text-6xl mb-2 cq-level-up-emoji" aria-hidden>
              ⭐
            </div>
            <p className="text-uri-keaney font-black text-3xl font-display">LEVEL {levelUpModal}</p>
            <p className="text-white/80 text-sm mt-3 mb-6">New skill point unlocked — open Skill tree on your Character tab.</p>
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
        {tab === "inbox" && character && (
          <Inbox
            character={character}
            onBack={() => setTab("quad")}
            onOpenDm={setDmWithOther}
          />
        )}

        {tab === "quad" && (
          <div className="-mx-4 w-[calc(100%+2rem)] sm:mx-0 sm:w-full">
            <TheQuad character={character} onRefresh={refresh} />
          </div>
        )}

        {tab === "friends" && (
          <FindFriends character={character} onRefresh={refresh} onOpenDm={setDmWithOther} />
        )}

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
                <Profile character={character} onLogout={handleLogout} onRefresh={refresh} />
              )}
            </div>
          </section>
        )}
      </div>
      </div>

      {/* Bottom nav — width aligned with main content */}
      <div
        className="fixed bottom-0 left-0 right-0 z-20 flex justify-center"
        style={{ paddingBottom: 0 }}
      >
        <nav
          className="w-full sm:max-w-2xl sm:mx-auto flex items-center justify-around rounded-t-2xl bg-uri-navy/95 border border-b-0 border-uri-keaney/25 shadow-[0_-4px_24px_-4px_rgba(0,0,0,0.45),0_-1px_0_0_rgba(104,171,232,0.12)] backdrop-blur-md"
          style={{ paddingTop: "0.5rem", paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
          aria-label="Main navigation"
        >
        {navItems.map(({ tab: t, icon, label }) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 py-2.5 px-1 rounded-xl transition-all touch-manipulation ${
              tab === t
                ? "text-uri-keaney bg-gradient-to-b from-uri-keaney/25 to-uri-keaney/10 shadow-[0_6px_18px_-6px_rgba(104,171,232,0.9)]"
                : "text-white/60 hover:text-white/85 hover:bg-white/5 active:text-white/90"
            }`}
            aria-current={tab === t ? "page" : undefined}
          >
            <span className="text-xl leading-none" aria-hidden>{icon}</span>
            <span className={`text-[11px] font-semibold tracking-wide truncate w-full text-center ${tab === t ? "text-uri-keaney" : "text-white/80"}`}>{label}</span>
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
    </>
  );
}
