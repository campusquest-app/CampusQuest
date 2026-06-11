"use client";

import type { Character } from "@/lib/types";
import { COSMETICS } from "@/lib/cosmetics";
import { aggregateBuffs, describeCosmeticEquipEffect } from "@/lib/gameBuffs";
import { setEquippedCosmeticSlot } from "@/lib/store";

const SLOTS = ["hat", "glasses", "backpack"] as const;

export function EquipmentStrip({
  character,
  onRefresh,
  readOnly = false,
}: {
  character: Character;
  onRefresh?: () => void;
  readOnly?: boolean;
}) {
  const unlocked = new Set(character.unlockedCosmetics ?? []);
  const eq = character.equippedCosmetics ?? {};
  const buffs = aggregateBuffs(character);

  return (
    <div className="cq-character-equipment">
      <h4 className="mb-1 flex items-center gap-2 font-display text-sm font-bold text-uri-gold">
        <span aria-hidden>🎁</span> Equipment loadout
      </h4>
      <p className="text-[11px] text-white/50 mb-3">
        {readOnly ? "Equipped loot on this Ram." : "Equip unlocked loot for real XP & streak-save bonuses."}
      </p>
      {buffs.lines.length > 0 && (
        <ul className="text-xs text-emerald-200/90 space-y-0.5 mb-3">
          {buffs.lines.map((line) => (
            <li key={line}>✓ {line}</li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {SLOTS.map((slot) => {
          const options = COSMETICS.filter((c) => c.slot === slot && unlocked.has(c.id));
          const equippedId = eq[slot] ?? "";
          const equipped = equippedId ? COSMETICS.find((c) => c.id === equippedId) : null;
          if (readOnly) {
            return (
              <div key={slot} className="block text-[10px] uppercase tracking-wider text-white/50">
                {slot}
                <div className="mt-1 w-full px-2 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm">
                  {equipped ? `${equipped.icon} ${equipped.label}` : "None"}
                </div>
              </div>
            );
          }
          return (
            <label key={slot} className="block text-[10px] uppercase tracking-wider text-white/50">
              {slot}
              <select
                value={equippedId}
                onChange={(e) => {
                  setEquippedCosmeticSlot(character.id, slot, e.target.value || null);
                  onRefresh?.();
                }}
                className="mt-1 w-full px-2 py-2 rounded-lg bg-white/10 border border-white/15 text-white text-sm"
              >
                <option value="">None</option>
                {options.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.label} — {describeCosmeticEquipEffect(c.id)}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    </div>
  );
}
