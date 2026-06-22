"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import type { Guild } from "@/lib/types";
import {
  GUILD_INTEREST_LABELS,
  deleteGuild,
  setGuildCofounder,
  updateGuildSettings,
  MAX_GUILD_MEMBERS,
  guildBlockedForJoinWithoutCofounder,
  getGuildDisplayLevel,
  guildXpInCurrentLevel,
  getGuildAggregatedBossKills,
  GUILD_XP_PER_LEVEL,
} from "@/lib/guildStore";
import { getCharacterById } from "@/lib/friendsStore";
import { AvatarDisplay } from "./AvatarDisplay";

export function ViewGuildModal({
  guild,
  currentUserId,
  onLeave,
  onClose,
  onDeleted,
  onUpdated,
}: {
  guild: Guild;
  currentUserId?: string;
  onLeave?: (guildId: string) => void;
  onClose: () => void;
  onDeleted?: () => void;
  onUpdated?: () => void;
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingSettings, setEditingSettings] = useState(false);
  const [editName, setEditName] = useState(guild.name);
  const [editWeeklyGoal, setEditWeeklyGoal] = useState(guild.weeklyQuestGoal);
  useEffect(() => {
    setEditName(guild.name);
    setEditWeeklyGoal(guild.weeklyQuestGoal);
  }, [guild.id, guild.name, guild.weeklyQuestGoal]);
  const creator = guild.createdByUserId ? getCharacterById(guild.createdByUserId) : null;
  const isMember = currentUserId != null && guild.memberIds.includes(currentUserId);
  const isCreator = currentUserId != null && guild.createdByUserId === currentUserId;
  const isCofounder = currentUserId != null && guild.cofounderUserId === currentUserId;
  const canEditGuild = isCreator || isCofounder;
  const level = getGuildDisplayLevel(guild);
  const { current: guildXpCur, needed: guildXpNeed, totalXp: guildTotalXp } = guildXpInCurrentLevel(guild);
  const guildXpPct = guildXpNeed > 0 ? Math.min(100, (guildXpCur / guildXpNeed) * 100) : 0;
  const bossAgg = getGuildAggregatedBossKills(guild);
  const needsCofounder = guildBlockedForJoinWithoutCofounder(guild);

  function startEditing() {
    setEditName(guild.name);
    setEditWeeklyGoal(guild.weeklyQuestGoal);
    setEditingSettings(true);
  }

  function cancelEditing() {
    setEditName(guild.name);
    setEditWeeklyGoal(guild.weeklyQuestGoal);
    setEditingSettings(false);
  }

  function saveSettings() {
    if (!currentUserId) return;
    updateGuildSettings(guild.id, currentUserId, { name: editName, weeklyQuestGoal: editWeeklyGoal });
    setEditingSettings(false);
    onUpdated?.();
  }

  function handleConfirmDelete() {
    if (!currentUserId) return;
    if (deleteGuild(guild.id, currentUserId)) {
      setShowDeleteConfirm(false);
      onDeleted?.();
      onClose();
    }
  }

  const content = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-labelledby="view-guild-title" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative z-10 w-full max-w-[22rem] max-h-[85vh] overflow-y-auto rounded-2xl border border-white/15 bg-uri-navy shadow-xl shadow-black/40 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-uri-keaney/20 to-uri-navy flex items-center justify-center text-3xl border border-uri-keaney/30">
              {guild.crest}
            </div>
            <div className="min-w-0 flex-1">
              {editingSettings ? (
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Guild name"
                  maxLength={40}
                  className="w-full font-display font-semibold text-lg text-white bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-uri-keaney/50"
                  aria-label="Guild name"
                />
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 id="view-guild-title" className="font-display font-semibold text-lg text-white">
                    {guild.name}
                  </h2>
                  {canEditGuild && (
                    <button
                      type="button"
                      onClick={startEditing}
                      className="text-xs font-medium text-uri-keaney/90 hover:text-uri-keaney px-2 py-0.5 rounded border border-uri-keaney/40 hover:bg-uri-keaney/10"
                    >
                      Edit
                    </button>
                  )}
                </div>
              )}
              <p className="text-xs text-white/60 mt-0.5">{GUILD_INTEREST_LABELS[guild.interest]} · Lv.{level}</p>
            </div>
          </div>
          <div className="mb-4 rounded-xl border border-uri-keaney/25 bg-black/25 p-3">
            <div className="flex justify-between text-[11px] text-white/65 mb-1.5">
              <span className="font-semibold uppercase tracking-wider text-uri-keaney/90">Guild XP</span>
              <span className="font-mono text-uri-keaney/95 tabular-nums">
                {guildXpCur} / {guildXpNeed} to Lv.{level + 1}
              </span>
            </div>
            <div className="h-2.5 rounded-full overflow-hidden bg-white/10 border border-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-uri-keaney to-uri-keaney/70 transition-all duration-500"
                style={{ width: `${guildXpPct}%` }}
              />
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-white/45">
              {guildTotalXp.toLocaleString()} total XP · {GUILD_XP_PER_LEVEL} XP per level. Members add guild XP when they earn activity XP and when they defeat bosses.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="rounded-xl border border-uri-gold/30 bg-uri-gold/[0.08] px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-uri-gold/85">Bosses defeated</p>
              <p className="font-display text-xl font-bold text-white tabular-nums">{bossAgg.bossesDefeated}</p>
              <p className="text-[10px] text-white/45 mt-0.5">Across known members</p>
            </div>
            <div className="rounded-xl border border-amber-500/35 bg-amber-950/25 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-200/90">Final bosses</p>
              <p className="font-display text-xl font-bold text-amber-100 tabular-nums">{bossAgg.finalBossesDefeated}</p>
              <p className="text-[10px] text-white/45 mt-0.5">Across known members</p>
            </div>
          </div>
          <div className="space-y-3 text-sm mb-4">
            {editingSettings ? (
              <div className="space-y-2">
                <label className="block text-white/50 text-xs uppercase tracking-wider">Weekly goal</label>
                <input
                  type="text"
                  value={editWeeklyGoal}
                  onChange={(e) => setEditWeeklyGoal(e.target.value)}
                  placeholder="Weekly goal"
                  maxLength={80}
                  className="w-full text-white/90 bg-white/10 border border-white/20 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-uri-keaney/50"
                  aria-label="Weekly goal"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveSettings}
                    className="py-1.5 px-3 rounded-lg font-medium bg-uri-keaney/90 text-uri-navy hover:bg-uri-keaney border border-uri-keaney/50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={cancelEditing}
                    className="py-1.5 px-3 rounded-lg font-medium text-white/80 bg-white/10 border border-white/15 hover:bg-white/15"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p><span className="text-white/50">Weekly goal:</span> <span className="text-white/90">{guild.weeklyQuestGoal}</span></p>
            )}
            {creator && (
              <p className="text-white/70">
                <span className="text-white/50">Founder:</span> {creator.name} <span className="text-uri-keaney/90">@{creator.username}</span>
              </p>
            )}
          </div>
          <div className="border-t border-white/10 pt-4">
            <p className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-2">
              Members ({guild.memberIds.length}/{MAX_GUILD_MEMBERS})
            </p>
            {needsCofounder && isCreator && (
              <p className="text-xs text-amber-400/90 mb-2">Assign a valid co-founder so the guild can accept an 11th member (required once you have 10).</p>
            )}
            <ul className="space-y-2 max-h-48 overflow-y-auto">
              {guild.memberIds.length === 0 ? (
                <li className="text-sm text-white/50">No members yet.</li>
              ) : (
                guild.memberIds.map((id) => {
                  const c = getCharacterById(id);
                  const isFounder = id === guild.createdByUserId;
                  const isCofounder = id === guild.cofounderUserId;
                  const canSetCofounder = isCreator && !isFounder && id !== guild.cofounderUserId;
                  return (
                    <li key={id} className="flex items-center gap-3 p-2 rounded-lg bg-white/5 border border-white/10">
                      <div className="cq-avatar-slot w-9 h-9 bg-white/10">
                        {c ? <AvatarDisplay avatar={c.avatar} fitParent size={36} /> : <span className="text-lg opacity-60">👤</span>}
                      </div>
                      <div className="min-w-0 flex-1">
                        {c ? (
                          <>
                            <p className="font-medium text-white text-sm truncate">{c.name}</p>
                            <p className="text-xs text-white/50 truncate">@{c.username} · Lv.{c.level}</p>
                          </>
                        ) : (
                          <p className="text-sm text-white/50 truncate">Unknown member</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {isFounder && <span className="text-[10px] font-semibold text-uri-gold px-1.5 py-0.5 rounded bg-uri-gold/20">Founder</span>}
                        {isCofounder && <span className="text-[10px] font-semibold text-uri-keaney px-1.5 py-0.5 rounded bg-uri-keaney/20">Co-founder</span>}
                        {canSetCofounder && (
                          <button
                            type="button"
                            onClick={() => { setGuildCofounder(guild.id, currentUserId!, id); onUpdated?.(); }}
                            className="text-[10px] font-medium text-uri-keaney/90 hover:text-uri-keaney px-1.5 py-0.5 rounded border border-uri-keaney/40 hover:bg-uri-keaney/10"
                          >
                            Set co-founder
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
          <div className="mt-6 flex flex-col gap-2">
            {isCreator && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full py-2.5 rounded-xl font-medium text-red-400/90 border border-red-400/40 hover:bg-red-400/10 transition-colors"
              >
                Delete guild
              </button>
            )}
            {isMember && onLeave && !isCreator && (
              <button
                type="button"
                onClick={() => { onLeave(guild.id); onClose(); }}
                className="w-full py-2.5 rounded-xl font-medium text-amber-400/90 border border-amber-400/40 hover:bg-amber-400/10 transition-colors"
              >
                Leave guild
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 rounded-xl font-medium bg-white/10 text-white border border-white/15 hover:bg-white/15"
            >
              Close
            </button>
          </div>
        </div>
    </div>
  );

  const deleteConfirmContent = showDeleteConfirm ? (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="delete-guild-title">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} aria-hidden />
      <div className="relative z-10 w-full max-w-[20rem] rounded-2xl border border-white/15 bg-uri-navy shadow-xl p-6">
        <h3 id="delete-guild-title" className="font-display font-semibold text-white mb-2">Delete guild?</h3>
        <p className="text-sm text-white/70 mb-6">
          Are you sure you want to delete <strong className="text-white">{guild.name}</strong>? This cannot be undone and all members will be removed.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(false)}
            className="flex-1 py-2.5 rounded-xl font-medium text-white/80 bg-white/10 border border-white/15 hover:bg-white/15"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmDelete}
            className="flex-1 py-2.5 rounded-xl font-semibold text-white bg-red-500/90 hover:bg-red-500 border border-red-400/50"
          >
            Delete guild
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (typeof document === "undefined") return null;
  return (
    <>
      {createPortal(content, document.body)}
      {showDeleteConfirm && deleteConfirmContent && createPortal(deleteConfirmContent, document.body)}
    </>
  );
}
