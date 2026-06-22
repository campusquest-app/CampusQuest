"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { GuildInterest } from "@/lib/types";
import { GUILD_INTEREST_LABELS, GUILD_INTEREST_ICONS, createGuild } from "@/lib/guildStore";

const CREST_OPTIONS = ["🛡️", "📚", "💪", "💼", "🌟", "🦌", "⚔️", "☕", "🎸", "🔥"];

export function CreateGuildModal({
  characterId,
  onClose,
  onCreated,
}: {
  characterId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [crest, setCrest] = useState(CREST_OPTIONS[0]);
  const [weeklyGoal, setWeeklyGoal] = useState("");
  const [interest, setInterest] = useState<GuildInterest>("study");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const guild = createGuild({
      name: name.trim(),
      crest,
      weeklyQuestGoal: weeklyGoal.trim() || "Complete activities together",
      interest,
      createdByUserId: characterId,
    });
    if (guild) {
      onCreated();
      onClose();
    } else {
      setError("Enter a guild name.");
    }
  }

  const content = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-labelledby="create-guild-title" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative z-10 w-[min(22rem,92vw)] rounded-2xl border border-white/15 bg-uri-navy shadow-xl shadow-black/40 p-6">
        <h2 id="create-guild-title" className="font-display font-semibold text-lg text-white mb-4">
          Create a Guild
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-white/70 mb-1.5">Guild name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 40))}
              placeholder="e.g. URI Ramblers"
              maxLength={40}
              className="w-full px-3 py-2.5 rounded-xl bg-white/10 border border-white/15 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-uri-keaney/40"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-white/70 mb-1.5">Crest</label>
            <div className="flex flex-wrap gap-2">
              {CREST_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCrest(c)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl border transition-colors ${
                    crest === c ? "bg-uri-keaney/30 border-uri-keaney/50" : "bg-white/10 border-white/15 hover:bg-white/15"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-white/70 mb-1.5">Interest</label>
            <select
              value={interest}
              onChange={(e) => setInterest(e.target.value as GuildInterest)}
              className="w-full px-3 py-2.5 rounded-xl bg-white/10 border border-white/15 text-white focus:outline-none focus:ring-2 focus:ring-uri-keaney/40"
            >
              {(Object.keys(GUILD_INTEREST_LABELS) as GuildInterest[]).map((key) => (
                <option key={key} value={key} className="bg-uri-navy text-white">
                  {GUILD_INTEREST_ICONS[key]} {GUILD_INTEREST_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-white/70 mb-1.5">Weekly quest goal</label>
            <input
              type="text"
              value={weeklyGoal}
              onChange={(e) => setWeeklyGoal(e.target.value.slice(0, 80))}
              placeholder="e.g. Log 20 study sessions as a guild"
              maxLength={80}
              className="w-full px-3 py-2.5 rounded-xl bg-white/10 border border-white/15 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-uri-keaney/40"
            />
          </div>
          {error && <p className="text-sm text-amber-400">{error}</p>}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-white/20 text-white/80 hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl font-semibold bg-uri-keaney text-white hover:bg-uri-keaney/90"
            >
              Create Guild
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
