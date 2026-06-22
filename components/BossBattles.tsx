"use client";

import { useState, useCallback, useMemo, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  getUserBosses,
  getActiveBossId,
  getActiveBoss,
  setActiveBossId,
  addUserBoss,
  deleteUserBoss,
  MAX_BOSSES,
  MIN_BOSS_HP,
} from "@/lib/store";
import type { UserBoss, Character, StatKey } from "@/lib/types";
import { STAT_KEYS, STAT_LABELS } from "@/lib/types";
import { StatIcon } from "@/components/stats/StatIcon";
import { getCosmeticById } from "@/lib/cosmetics";
import { describeCosmeticEquipEffect } from "@/lib/gameBuffs";
import { CampusBossRaid } from "@/components/CampusBossRaid";
import { GuildBossBattle } from "@/components/GuildBossBattle";

const DELETE_CONFIRM_DIALOGS: { message: string; fightOn: string; retreat: string }[] = [
  {
    message: "Halt, brave scholar! Wouldst thou truly abandon this mighty foe? Thy XP and honor hang in the balance!",
    fightOn: "Nay, I shall fight on!",
    retreat: "Aye… retreat to the tavern.",
  },
  {
    message: "By the King's decree, thou seekest to flee this boss battle. Art thou certain thou wilt trade glory for shame and unfinished homework?",
    fightOn: "For glory and GPA!",
    retreat: "Let the enemy win…",
  },
  {
    message: "Good sir/ma'am, thou wouldst forsake this quest? Think of thy streaks, thy leaderboard rank, and the shame before the CampusQuest Guild of URI!",
    fightOn: "I fight for the Guild!",
    retreat: "I yield… midterms broke me.",
  },
  {
    message: "The ancient scrolls warn against cowardice. Abandoning this boss may curse thee with procrastination for seven fortnights.",
    fightOn: "Lift thy sword!",
    retreat: "Accept the curse…",
  },
  {
    message: "Thou art about to rage-quit like a peasant unplugging the royal router. Dost thou swear this is thy final decision?",
    fightOn: "I repent! Back to battle!",
    retreat: "Unplug the router.",
  },
  {
    message: "Art thou certain thou wouldst flee this boss, brave student knight?",
    fightOn: "Fight On",
    retreat: "Retreat to the Quad.",
  },
];

function getRandomDeleteDialog() {
  return DELETE_CONFIRM_DIALOGS[Math.floor(Math.random() * DELETE_CONFIRM_DIALOGS.length)];
}

const FINAL_BOSS_HP = 500;

function BattleSection({
  sectionId,
  icon,
  title,
  subtitle,
  tone = "keaney",
  className = "",
  bodyClassName = "",
  children,
}: {
  sectionId: string;
  icon: ReactNode;
  title: string;
  subtitle?: string;
  tone?: "keaney" | "gold";
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const head =
    tone === "gold"
      ? "border-uri-gold/30 bg-gradient-to-r from-uri-gold/[0.12] via-uri-gold/[0.04] to-transparent"
      : "border-uri-keaney/25 bg-gradient-to-r from-uri-keaney/[0.14] via-uri-keaney/[0.05] to-transparent";
  return (
    <section
      className={`flex flex-col rounded-2xl border border-white/[0.08] shadow-[0_4px_28px_-6px_rgba(0,0,0,0.45)] ${className}`}
      aria-labelledby={sectionId}
    >
      <div className={`shrink-0 border-b px-3 py-3 sm:px-5 sm:py-4 ${head}`}>
        <div className="flex items-start gap-2.5 sm:gap-3">
          <span className="mt-0.5 flex-shrink-0 text-xl leading-none sm:text-2xl" aria-hidden>
            {icon}
          </span>
          <div className="min-w-0">
            <h2 id={sectionId} className="font-display text-[15px] font-bold leading-snug tracking-tight text-white sm:text-lg">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-1 text-xs leading-relaxed text-white/60 sm:text-[13px] sm:text-white/55">{subtitle}</p>
            ) : null}
          </div>
        </div>
      </div>
      <div className={`bg-white/[0.02] p-3 sm:p-4 md:p-5 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

function BossFightRow({
  boss,
  variant,
  isActive,
  onToggleAttack,
  onRemove,
}: {
  boss: UserBoss;
  variant: "final" | "regular";
  isActive: boolean;
  onToggleAttack: () => void;
  onRemove: () => void;
}) {
  const hpPct = boss.defeated ? 0 : Math.min(100, (boss.currentHp / boss.maxHp) * 100);
  const weakness = boss.weaknessStat as StatKey | undefined;
  const loot = (boss.loot ?? []).map((id) => getCosmeticById(id)).filter(Boolean);
  const isFinal = variant === "final";
  const face = boss.defeated ? "💀" : isFinal ? "👑" : "🧟";

  const shell =
    isFinal
      ? `final-boss-card rounded-xl p-3 sm:rounded-2xl sm:p-4 md:p-5 ${boss.defeated ? "opacity-85" : ""}`
      : `rounded-xl p-3 sm:rounded-2xl sm:p-4 md:p-5 ${
          boss.defeated ? "boss-card-defeated" : isActive ? "boss-card-active" : "boss-card-default"
        }`;

  const attackBtn =
    isFinal
      ? isActive
        ? "border-uri-gold/55 bg-uri-gold/35 text-uri-gold hover:bg-uri-gold/45"
        : "border-uri-gold/35 bg-white/10 text-white hover:border-uri-gold/50 hover:bg-uri-gold/15 hover:text-uri-gold"
      : isActive
        ? "border-uri-keaney/50 bg-uri-keaney/35 text-uri-keaney hover:bg-uri-keaney/45"
        : "border-white/20 bg-white/10 text-white hover:border-uri-keaney/45 hover:bg-uri-keaney/15 hover:text-uri-keaney";

  return (
    <article className={`${shell} cq-boss-card flex flex-col gap-3 sm:gap-4`}>
      <div className="flex min-w-0 gap-3 sm:gap-4">
        <div
          className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border text-xl shadow-lg sm:h-16 sm:w-16 sm:rounded-2xl sm:text-3xl ${
            isFinal ? "border-uri-gold/45 bg-black/45" : "border-white/12 bg-black/30"
          }`}
          aria-hidden
        >
          {face}
        </div>
        <div className="min-w-0 w-0 flex-1 basis-0 space-y-2 overflow-x-hidden">
          <h3 className="font-display break-words text-base font-bold leading-snug text-white [overflow-wrap:anywhere] sm:text-lg">
            {boss.name}
          </h3>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {boss.defeated && (
              <span className="rounded-full border border-emerald-500/45 bg-emerald-500/20 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-200">
                Defeated
              </span>
            )}
            {!boss.defeated && isActive && (
              <span
                className={`rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                  isFinal
                    ? "border-uri-gold/55 bg-uri-gold/25 text-uri-gold"
                    : "border-uri-keaney/45 bg-uri-keaney/25 text-uri-keaney"
                }`}
              >
                Attacking
              </span>
            )}
            {weakness && (
              <span className="rounded-full border border-white/15 bg-white/[0.08] px-2 py-1 text-[11px] text-white/80">
                Weak: <StatIcon stat={weakness} variant="glyph" size="sm" className="inline" /> {STAT_LABELS[weakness]}
              </span>
            )}
          </div>

          {loot.length > 0 && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 px-3 py-2.5 sm:py-3">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-emerald-200/90 sm:text-[10px] sm:mb-1.5">
                Loot on this boss
              </p>
              <ul className="space-y-2.5 sm:space-y-1.5">
                {loot.map((piece) => (
                  <li key={piece!.id} className="flex flex-col gap-1 text-xs leading-snug sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-1 sm:text-[11px]">
                    <span className="inline-flex flex-wrap items-baseline gap-1.5">
                      <span aria-hidden>{piece!.icon}</span>
                      <span className="font-semibold text-white">{piece!.label}</span>
                    </span>
                    <span className="pl-7 text-[11px] leading-relaxed text-emerald-200/90 sm:pl-0 sm:leading-snug">
                      <span className="hidden sm:inline">· </span>
                      {describeCosmeticEquipEffect(piece!.id)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!boss.defeated && (
            <div className="w-full min-w-0 pt-0.5">
              <div className="mb-2 flex flex-col gap-1 sm:mb-1.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                <span className="shrink-0 text-xs font-medium text-white/65 sm:text-[11px]">Health</span>
                <span
                  className={`font-mono text-sm font-semibold tabular-nums sm:shrink-0 sm:text-right sm:text-[11px] ${isFinal ? "text-amber-200" : "text-red-200/90"}`}
                >
                  {boss.currentHp} / {boss.maxHp}
                </span>
              </div>
              {isFinal ? (
                <div className="final-boss-hp-bar h-4 w-full min-w-0 min-h-[1rem] sm:h-3 sm:min-h-0">
                  <div className="final-boss-hp-fill cq-hp-fill-animated" style={{ width: `${hpPct}%` }} />
                </div>
              ) : (
                <div className="boss-hp-bar h-4 w-full min-w-0 min-h-[1rem] sm:h-3 sm:min-h-0">
                  <div className="boss-hp-fill cq-hp-fill-animated" style={{ width: `${hpPct}%` }} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <footer className="border-t border-white/10 pt-3 sm:pt-4">
        <div className="flex flex-col gap-3">
          <div
            className={`flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border px-3 py-2.5 ${
              isFinal ? "border-uri-gold/45 bg-uri-gold/10" : "border-uri-gold/35 bg-uri-gold/[0.08]"
            }`}
          >
            <span className="font-mono text-lg font-bold tabular-nums text-uri-gold sm:text-xl">
              +{boss.xpReward}
            </span>
            <span className="text-[11px] font-medium leading-snug text-uri-gold/90 sm:text-xs sm:text-uri-gold/85">
              XP if defeated
            </span>
          </div>

          {boss.defeated ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onRemove}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 text-lg text-white/50 transition-colors hover:border-red-500/35 hover:bg-red-500/10 hover:text-red-200"
                aria-label={`Remove ${boss.name}`}
                title="Remove boss (frees a slot, no XP)"
              >
                🗑️
              </button>
            </div>
          ) : (
            <div className="flex w-full min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={onToggleAttack}
                className={`flex min-h-[48px] min-w-0 flex-1 items-center justify-center rounded-xl border px-3 py-3 text-center text-sm font-semibold leading-snug transition-all active:scale-[0.98] sm:min-h-[44px] sm:px-4 sm:py-2.5 ${attackBtn}`}
              >
                <span className="sm:hidden">{isActive ? "Stop" : "Attack"}</span>
                <span className="hidden sm:inline">{isActive ? "Stop attacking" : "Attack this boss"}</span>
              </button>
              <button
                type="button"
                onClick={onRemove}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 text-lg text-white/50 transition-colors hover:border-red-500/35 hover:bg-red-500/10 hover:text-red-200"
                aria-label={`Remove ${boss.name}`}
                title="Remove boss (frees a slot, no XP)"
              >
                🗑️
              </button>
            </div>
          )}
        </div>
      </footer>
    </article>
  );
}

export function BossBattles({ character, onRefresh }: { character: Character; onRefresh?: () => void }) {
  const [bossName, setBossName] = useState("");
  const [bossHp, setBossHp] = useState("250");
  const [bossWeakness, setBossWeakness] = useState<StatKey | "random">("random");
  /** Open when roster is empty so the full create form shows without an extra tap. */
  const [recruitOpen, setRecruitOpen] = useState(() => getUserBosses().length === 0);
  const [bossToDelete, setBossToDelete] = useState<UserBoss | null>(null);
  const deleteDialog = useMemo(() => (bossToDelete ? getRandomDeleteDialog() : null), [bossToDelete]);

  const bosses = getUserBosses();
  const finalBosses = bosses.filter((b) => b.maxHp > FINAL_BOSS_HP);
  const regularBosses = bosses.filter((b) => b.maxHp <= FINAL_BOSS_HP);
  const activeId = getActiveBossId();
  const activeBoss = getActiveBoss();

  const handleAddBoss = useCallback(() => {
    if (bosses.length >= MAX_BOSSES) return;
    const name = bossName.trim() || "Boss";
    const hp = Math.max(MIN_BOSS_HP, parseInt(bossHp, 10) || MIN_BOSS_HP);
    const weakness = bossWeakness === "random" ? undefined : bossWeakness;
    const added = addUserBoss(name, hp, true, weakness);
    if (added) {
      setBossName("");
      setBossHp(String(MIN_BOSS_HP));
      setBossWeakness("random");
      onRefresh?.();
    }
  }, [bossName, bossHp, bossWeakness, onRefresh, bosses.length]);

  const handleSwitchTarget = useCallback(
    (boss: UserBoss) => {
      if (boss.defeated) return;
      const newId = activeId === boss.id ? null : boss.id;
      setActiveBossId(newId);
      onRefresh?.();
    },
    [activeId, onRefresh]
  );

  const handleConfirmDelete = useCallback(() => {
    if (bossToDelete) {
      deleteUserBoss(bossToDelete.id);
      setBossToDelete(null);
      onRefresh?.();
    }
  }, [bossToDelete, onRefresh]);

  return (
    <section
      className="overflow-hidden rounded-xl border border-white/[0.08] shadow-[0_1px_0_0_rgba(104,171,232,0.1),0_8px_40px_-12px_rgba(0,0,0,0.5)] sm:rounded-2xl"
      style={{
        background: "linear-gradient(180deg, rgba(4, 30, 66, 0.98) 0%, rgba(3, 22, 48, 0.96) 100%)",
      }}
    >
      {/* Hub header */}
      <div
        className="border-b border-white/[0.08] px-3 py-4 sm:px-6 sm:py-6"
        style={{
          background: "linear-gradient(165deg, rgba(104, 171, 232, 0.18) 0%, rgba(4, 30, 66, 0.92) 45%, rgba(4, 30, 66, 0.98) 100%)",
          boxShadow: "0 1px 0 0 rgba(104, 171, 232, 0.12)",
        }}
      >
        <div className="grid gap-4 md:grid-cols-2 md:items-center md:gap-6">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-uri-keaney/40 bg-uri-navy/90 text-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:h-16 sm:w-16 sm:rounded-2xl sm:text-3xl">
              ⚔️
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-lg font-bold leading-tight tracking-tight text-white sm:text-2xl">Boss battles</h1>
              <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-white/70 sm:text-sm sm:text-white/65">
                Tap <strong className="text-uri-keaney/95">Attack</strong> on a boss, then log activities on{" "}
                <strong className="text-white/90">Character</strong> to deal damage.{" "}
                <strong className="text-uri-gold/90">Campus</strong> &amp; <strong className="text-white/90">Guild</strong> raids
                chip in from every log. Weakness = bonus damage. Defeat for XP and loot.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:justify-end">
            <span className="rounded-lg border border-white/15 bg-white/[0.07] px-3 py-2 text-center text-xs font-semibold text-white/85 sm:py-1.5 sm:text-[11px]">
              {bosses.length} / {MAX_BOSSES} boss slots
            </span>
            <span className="rounded-lg border border-uri-gold/35 bg-uri-gold/10 px-3 py-2 text-center text-xs font-semibold leading-snug text-uri-gold/95 sm:py-1.5 sm:text-[11px]">
              Min {MIN_BOSS_HP} HP · Final {FINAL_BOSS_HP}+ HP
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-3 p-3 sm:space-y-4 sm:p-5 md:space-y-5 md:p-6">
        {/* Top strip: spans full width above the 2×2 grid */}
        {activeBoss && !activeBoss.defeated && (
          <div className="rounded-xl border border-uri-keaney/40 bg-gradient-to-r from-uri-keaney/25 via-uri-keaney/10 to-transparent px-3 py-3 sm:flex sm:items-center sm:gap-4 sm:rounded-2xl sm:px-5 sm:py-3.5">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span className="relative mt-1 flex h-3 w-3 flex-shrink-0 sm:mt-0.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-uri-keaney opacity-35" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-uri-keaney shadow-[0_0_10px_rgba(104,171,232,0.8)]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-uri-keaney/90">Active target</p>
                <p className="mt-0.5 break-words font-display text-base font-bold leading-snug text-white sm:text-lg">{activeBoss.name}</p>
                <p className="mt-2 text-[12px] leading-snug text-white/55 sm:hidden">
                  Log activities on the <strong className="text-white/75">Character</strong> tab to deal damage.
                </p>
              </div>
            </div>
            <p className="mt-2 hidden flex-shrink-0 text-[11px] leading-snug text-white/50 sm:mt-0 sm:block sm:max-w-[9.5rem]">
              Log activities on the Character tab to deal damage.
            </p>
          </div>
        )}

        {/* Recruit — collapsible above campus / guild / roster */}
        <div className="overflow-hidden rounded-xl border border-uri-keaney/25 bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:rounded-2xl">
          <button
            type="button"
            id="recruit-boss-toggle"
            aria-expanded={recruitOpen}
            aria-controls="recruit-boss-panel"
            onClick={() => setRecruitOpen((o) => !o)}
            className={`flex w-full items-center gap-3 px-3 py-3.5 text-left transition-colors hover:bg-white/[0.04] sm:gap-4 sm:px-5 sm:py-4 ${
              recruitOpen ? "border-b border-white/10" : "border-b border-transparent"
            }`}
          >
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-uri-keaney/35 bg-gradient-to-br from-uri-keaney/[0.18] to-transparent text-lg shadow-inner sm:h-11 sm:w-11 sm:text-xl">
              ✦
            </span>
            <div className="min-w-0 flex-1">
              <span className="font-display text-[15px] font-bold tracking-tight text-white sm:text-base">Recruit a boss</span>
              <p className="mt-0.5 text-xs leading-relaxed text-white/55 sm:text-[13px]">
                {bosses.length >= MAX_BOSSES
                  ? `Roster full (${MAX_BOSSES}/${MAX_BOSSES}) — defeat or remove one to open a slot.`
                  : `${bosses.length} / ${MAX_BOSSES} slots · min ${MIN_BOSS_HP} HP · ${FINAL_BOSS_HP}+ HP for final tier`}
              </p>
            </div>
            <span className="flex-shrink-0 text-lg text-uri-keaney/90 tabular-nums" aria-hidden>
              {recruitOpen ? "▴" : "▾"}
            </span>
          </button>
          {recruitOpen ? (
            <div
              id="recruit-boss-panel"
              role="region"
              aria-labelledby="recruit-boss-toggle"
              className="border-t border-white/[0.08] bg-black/20 px-3 py-4 sm:px-5 sm:py-5"
            >
              {bosses.length < MAX_BOSSES ? (
                <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.04] p-3 sm:rounded-2xl sm:p-5">
                  <label className="block min-w-0">
                    <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-white/55 sm:text-[10px] sm:text-white/50">
                      Boss name
                    </span>
                    <input
                      type="text"
                      value={bossName}
                      onChange={(e) => setBossName(e.target.value)}
                      placeholder="e.g. MTH 215 Midterm"
                      className="min-h-[48px] w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-base text-white placeholder-white/35 transition-colors focus:border-uri-keaney/50 focus:outline-none focus:ring-2 focus:ring-uri-keaney/30 sm:min-h-0 sm:text-sm"
                    />
                  </label>
                  <div className="flex flex-col gap-3 sm:grid sm:grid-cols-[1fr_auto] sm:items-end">
                    <label className="block min-w-0 sm:max-w-[9rem] sm:justify-self-start">
                      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-white/55 sm:text-[10px] sm:text-white/50">HP</span>
                      <input
                        type="number"
                        min={MIN_BOSS_HP}
                        value={bossHp}
                        onChange={(e) => setBossHp(e.target.value)}
                        className="min-h-[48px] w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 font-mono text-base text-white transition-colors focus:border-uri-keaney/50 focus:outline-none focus:ring-2 focus:ring-uri-keaney/30 sm:min-h-0 sm:text-sm"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={handleAddBoss}
                      className="min-h-[48px] w-full rounded-xl border border-uri-keaney/50 bg-gradient-to-b from-uri-keaney to-uri-keaney/80 px-5 py-3 text-base font-bold text-white shadow-lg shadow-uri-keaney/20 transition-all hover:from-uri-keaney/95 hover:to-uri-keaney/70 active:scale-[0.98] sm:min-h-0 sm:w-auto sm:self-end sm:py-3 sm:text-sm"
                    >
                      Add boss
                    </button>
                  </div>
                  <div>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/50 sm:text-[10px] sm:text-white/45">
                      Weakness — bonus damage when the activity matches
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                      <button
                        type="button"
                        onClick={() => setBossWeakness("random")}
                        className={`col-span-2 min-h-[44px] rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors sm:col-span-1 sm:min-h-0 sm:py-2 sm:text-xs ${
                          bossWeakness === "random"
                            ? "border-uri-keaney/55 bg-uri-keaney/30 text-uri-keaney"
                            : "border-white/15 bg-white/[0.08] text-white/70 hover:bg-white/[0.12]"
                        }`}
                      >
                        Random
                      </button>
                      {STAT_KEYS.map((key) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setBossWeakness(key)}
                          className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-lg border px-1.5 py-2 text-center transition-colors sm:min-h-0 sm:flex-row sm:gap-1.5 sm:px-3 sm:py-2 sm:text-left sm:text-xs ${
                            bossWeakness === key
                              ? "border-uri-keaney/55 bg-uri-keaney/30 font-semibold text-uri-keaney"
                              : "border-white/15 bg-white/[0.08] font-medium text-white/75 hover:bg-white/[0.12]"
                          }`}
                        >
                          <StatIcon stat={key} size="md" className="sm:hidden" />
                          <StatIcon stat={key} size="sm" className="hidden sm:inline-flex" />
                          <span className="max-w-[4.5rem] text-[10px] leading-tight sm:max-w-none sm:text-xs">{STAT_LABELS[key]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-amber-500/25 bg-amber-950/20 py-6 text-center">
                  <p className="text-sm text-amber-100/85">Roster full ({MAX_BOSSES}/{MAX_BOSSES}).</p>
                  <p className="mt-1 text-xs text-white/50">Defeat a boss for XP or remove one to free a slot.</p>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* md+: 2×2 grid; height follows content — no inner scroll so a new boss card is fully visible */}
        <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 md:gap-4 lg:gap-5 md:items-start">
          <BattleSection
            sectionId="battle-campus-raid"
            icon="🌐"
            title="Campus raid"
            subtitle="Weekly shared boss — every log chips in. Resets Monday."
            tone="gold"
          >
            <CampusBossRaid character={character} embedded />
          </BattleSection>

          <BattleSection
            sectionId="battle-guild-battle"
            icon="🛡️"
            title="Guild battle"
            subtitle="Per-guild raid boss — your guild’s logs deal damage. Resets Monday."
            tone="keaney"
          >
            <GuildBossBattle character={character} embedded />
          </BattleSection>

          <BattleSection
            sectionId="battle-final-bosses"
            icon="👑"
            title="Final bosses"
            subtitle={`${FINAL_BOSS_HP}+ HP · better loot odds`}
            tone="gold"
          >
            <div className="final-boss-box rounded-lg p-2.5 sm:rounded-xl sm:p-4">
              {finalBosses.length === 0 ? (
                <div className="rounded-lg border border-uri-gold/25 bg-black/25 py-8 text-center sm:py-10">
                  <p className="text-2xl mb-2" aria-hidden>👑</p>
                  <p className="text-sm text-white/70 font-semibold">No final boss yet.</p>
                  <p className="mt-2 px-2 text-xs text-uri-gold/85">
                    Open <strong className="text-uri-gold">Recruit a boss</strong> above with <strong className="text-uri-gold">{FINAL_BOSS_HP}+ HP</strong>.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {finalBosses.map((boss) => (
                    <BossFightRow
                      key={boss.id}
                      boss={boss}
                      variant="final"
                      isActive={activeId === boss.id}
                      onToggleAttack={() => handleSwitchTarget(boss)}
                      onRemove={() => setBossToDelete(boss)}
                    />
                  ))}
                </div>
              )}
            </div>
          </BattleSection>

          <BattleSection
            sectionId="battle-roster"
            icon="🧟"
            title="Your bosses"
            subtitle="≤500 HP · Attack, then log activities"
            tone="keaney"
          >
            {bosses.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] py-10 text-center sm:py-12">
                <p className="text-2xl mb-2" aria-hidden>🪄</p>
                <p className="text-sm text-white/70 font-semibold">No bosses yet.</p>
                <p className="mt-2 px-3 text-xs text-white/45">Open <strong className="text-white/70">Recruit a boss</strong> above.</p>
              </div>
            ) : regularBosses.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] py-8 text-center">
                <p className="text-2xl mb-2" aria-hidden>🏆</p>
                <p className="text-sm text-white/70 font-semibold">All bosses are final-tier.</p>
                <p className="mt-1 text-xs text-white/45 md:hidden">See <strong className="text-white/60">Final bosses</strong> above.</p>
                <p className="mt-1 hidden text-xs text-white/45 md:block">See the <strong className="text-white/60">Final bosses</strong> column.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {regularBosses.map((boss) => (
                  <BossFightRow
                    key={boss.id}
                    boss={boss}
                    variant="regular"
                    isActive={activeId === boss.id}
                    onToggleAttack={() => handleSwitchTarget(boss)}
                    onRemove={() => setBossToDelete(boss)}
                  />
                ))}
              </div>
            )}
          </BattleSection>
        </div>
      </div>

      {bossToDelete && deleteDialog && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="delete-boss-title">
          <div className="absolute inset-0 bg-black/70" aria-hidden onClick={() => setBossToDelete(null)} />
          <div className="relative z-10 w-full max-w-[22rem] rounded-2xl border-2 border-uri-gold/50 bg-uri-navy p-5 shadow-2xl shadow-black/40">
            <p id="delete-boss-title" className="mb-2 text-sm font-semibold uppercase tracking-wider text-uri-gold">
              ⚔️ Abandon boss?
            </p>
            <p className="mb-5 text-sm leading-relaxed text-white/95">{deleteDialog.message}</p>
            <p className="mb-4 text-xs text-white/50">
              Removing &quot;{bossToDelete.name}&quot; frees a slot. No XP earned.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setBossToDelete(null)}
                className="flex-1 rounded-xl border border-uri-keaney/50 bg-uri-keaney py-2.5 text-sm font-semibold text-white transition-colors hover:bg-uri-keaney/90"
              >
                👉 {deleteDialog.fightOn}
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="flex-1 rounded-xl border border-white/30 bg-white/10 py-2.5 text-sm font-semibold text-white/90 transition-colors hover:border-red-500/40 hover:bg-red-500/20 hover:text-red-200"
              >
                👉 {deleteDialog.retreat}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}
