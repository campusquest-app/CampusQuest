"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { Character, StatKey } from "@/lib/types";
import { STAT_KEYS, STAT_LABELS, STAT_ICONS, MAX_STAT } from "@/lib/types";
import { xpProgressInLevel } from "@/lib/level";
import { updateCharacter, prestigeStat } from "@/lib/store";
import { getDefaultCustomAvatar, serializeAvatar } from "@/lib/avatarOptions";
import { getClassTitle, getClassRealm } from "@/lib/characterClasses";
import { getGuildById } from "@/lib/guildStore";
import { AvatarDisplay } from "./AvatarDisplay";
import { AvatarBuilder } from "./AvatarBuilder";

/** Progress bar fill colors – Keaney/accent for cohesion with URI palette */
const STAT_FILL_COLORS: Record<StatKey, string> = {
  strength: "bg-amber-400",
  stamina: "bg-uri-teal",
  knowledge: "bg-uri-keaney",
  social: "bg-uri-green",
  focus: "bg-uri-purple",
};

function AchievementsDropdown({ achievements }: { achievements: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-5 pt-4 border-t border-uri-keaney/20">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 text-left rounded-lg -mx-1 px-1 py-1 hover:text-uri-keaney transition-colors"
        aria-expanded={open}
      >
        <span className="text-xs font-semibold text-uri-keaney/90 uppercase tracking-wider">
          Achievements
        </span>
        <span className="text-uri-keaney/80 text-sm" aria-hidden>
          {open ? "▼" : "▶"}
        </span>
      </button>
      {open && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {achievements.map((a) => (
            <span
              key={a}
              className="text-xs px-2.5 py-1 rounded-full bg-uri-gold/20 text-uri-gold border border-uri-gold/40"
            >
              {a}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function CharacterCard({
  character,
  onRefresh,
}: {
  character: Character;
  onRefresh?: () => void;
}) {
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [editingAvatarValue, setEditingAvatarValue] = useState(character.avatar);
  const { current, needed } = xpProgressInLevel(character.totalXP);
  const xpPct = Math.min(100, (current / needed) * 100);

  function openEditModal() {
    setEditingAvatarValue(character.avatar.startsWith("{") ? character.avatar : serializeAvatar(getDefaultCustomAvatar()));
    setEditingAvatar(true);
  }

  function handleAvatarSave() {
    updateCharacter({ avatar: editingAvatarValue });
    setEditingAvatar(false);
    onRefresh?.();
  }

  return (
    <section className="character-hero-panel rounded-2xl p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <div className="relative flex-shrink-0">
          <div
            className="character-avatar-frame w-20 h-20 rounded-xl flex items-center justify-center overflow-hidden p-[2px]"
            aria-hidden
          >
            <div className="w-full h-full rounded-[calc(0.5rem-1px)] bg-uri-navy flex items-center justify-center overflow-hidden">
              <AvatarDisplay
                avatar={character.avatar}
                size={80}
                classId={character.classId}
                starterWeapon={character.starterWeapon}
              />
            </div>
          </div>
          <div
            className="character-level-badge absolute -bottom-1 -right-1 min-w-[2rem] h-6 px-1.5 rounded-md flex items-center justify-center text-[10px] font-display"
            aria-label={`Level ${character.level}`}
          >
            {character.level}
          </div>
          <button
            type="button"
            onClick={openEditModal}
            className="absolute -bottom-1 left-0 w-7 h-7 rounded-lg bg-uri-keaney text-white border-2 border-uri-navy flex items-center justify-center text-xs shadow-md hover:bg-uri-keaney/90 focus:outline-none focus:ring-2 focus:ring-uri-keaney focus:ring-offset-2 focus:ring-offset-uri-navy"
            aria-label="Edit avatar"
            title="Edit avatar"
          >
            ✏️
          </button>
          {editingAvatar && typeof document !== "undefined" && createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && setEditingAvatar(false)} role="dialog" aria-modal="true" aria-label="Edit your avatar">
              <div className="absolute inset-0 bg-black/85" aria-hidden onClick={() => setEditingAvatar(false)} />
              <div className="relative z-10 w-[min(22rem,92vw)] max-h-[85vh] overflow-y-auto p-4 rounded-2xl bg-uri-navy border border-uri-keaney/30 shadow-xl shadow-black/50">
                <p className="text-xs font-semibold text-white/80 uppercase tracking-wider mb-3">
                  Edit your avatar
                </p>
                <div className="max-h-[60vh] overflow-y-auto pr-1">
                  <AvatarBuilder
                    value={editingAvatarValue}
                    onChange={setEditingAvatarValue}
                    compact
                    unlockContext={{
                      achievements: character.achievements ?? [],
                      level: character.level ?? 1,
                      unlockedCosmetics: character.unlockedCosmetics ?? [],
                    }}
                  />
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => setEditingAvatar(false)}
                    className="flex-1 py-2 text-sm text-white/70 hover:text-white rounded-xl hover:bg-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAvatarSave}
                    className="flex-1 py-2 text-sm font-semibold bg-uri-keaney text-white rounded-xl hover:bg-uri-keaney/90"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-display font-bold text-lg text-white truncate drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)]">
            {character.name}
          </h2>
          {character.classId && (getClassTitle(character.classId) || getClassRealm(character.classId)) && (
            <p className="text-uri-gold/90 text-xs font-medium mt-0.5 truncate">
              {getClassTitle(character.classId)}
              {getClassRealm(character.classId) && (
                <span className="text-white/50 font-normal"> · {getClassRealm(character.classId)}</span>
              )}
            </p>
          )}
          <p className="text-white/50 text-sm mt-0.5">@{character.username}</p>
          {(character.guildIds ?? []).length > 0 && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {(character.guildIds ?? []).map((gid) => {
                const g = getGuildById(gid);
                return g ? (
                  <span key={gid} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/10 text-white/90 border border-white/15 text-xs">
                    {g.crest} {g.name}
                  </span>
                ) : null;
              })}
            </div>
          )}
          <div className="mt-3">
            <div className="flex justify-between text-xs text-white/60 mb-1">
              <span>Level progress</span>
              <span className="font-mono text-uri-keaney/95">{current} / {needed} XP · {Math.round(xpPct)}%</span>
            </div>
            <div className="xp-bar-track h-2.5 rounded-full overflow-hidden">
              <div className="xp-bar-fill xp-bar-fill-animated h-full rounded-full transition-all duration-700" style={{ width: `${xpPct}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-uri-keaney/20">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-base" aria-hidden>⚔️</span>
          <h3 className="text-xs font-semibold text-uri-keaney/90 uppercase tracking-wider">
            Stats
          </h3>
        </div>
        <div className="grid gap-2.5 sm:gap-3">
          {STAT_KEYS.map((key) => {
            const value = character.stats[key] ?? 0;
            const pct = Math.min(100, (value / MAX_STAT) * 100);
            const atMax = value >= MAX_STAT;
            const prestigeCount = character.statPrestige?.[key] ?? 0;
            return (
              <div key={key} className="stat-card-row flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 sm:px-3">
                <span className="text-base w-6 flex-shrink-0" title={STAT_LABELS[key]}>
                  {STAT_ICONS[key]}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center gap-2 text-xs mb-0.5 flex-wrap">
                    <span className="text-white/70 flex items-center gap-1.5">
                      {STAT_LABELS[key]}
                      {prestigeCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-md bg-uri-gold/25 text-uri-gold border border-uri-gold/40 font-mono font-semibold text-[10px]">
                          {prestigeCount}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={`font-mono font-semibold ${atMax ? "text-uri-gold" : "text-white/95"}`}>
                        {value}{atMax && " ★"}
                      </span>
                      {atMax && onRefresh && (
                        <button
                          type="button"
                          onClick={() => {
                            if (prestigeStat(character.id, key)) onRefresh();
                          }}
                          className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-uri-gold/20 text-uri-gold border border-uri-gold/50 hover:bg-uri-gold/30 transition-colors"
                        >
                          Prestige
                        </button>
                      )}
                    </span>
                  </div>
                  <div className="stat-bar-game h-2.5 rounded-full overflow-hidden">
                    <div
                      className={`stat-fill-game stat-fill-animated rounded-full ${atMax ? "bg-gradient-to-r from-uri-gold via-amber-400 to-uri-gold shadow-[0_0_6px_rgba(197,165,40,0.4)]" : STAT_FILL_COLORS[key]}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {character.achievements && character.achievements.length > 0 && (
        <AchievementsDropdown achievements={character.achievements} />
      )}
    </section>
  );
}
