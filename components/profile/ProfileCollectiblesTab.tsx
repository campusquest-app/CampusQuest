"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Character } from "@/lib/types";
import { COSMETICS, getCosmeticById, type CosmeticItem, type LootRarity } from "@/lib/cosmetics";
import { getLootLogForCharacter, type LootDropEntry } from "@/lib/lootLog";
import { describeCosmeticEquipEffect } from "@/lib/gameBuffs";
import { getEarnedAchievements } from "@/lib/achievementEngine";
import { RARITY_CSS } from "@/lib/achievementRarityStyles";

const RARITY_LABELS: Record<LootRarity, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  legendary: "Legendary",
};

const RARITY_BORDER: Record<LootRarity, string> = {
  common: "border-cq-border",
  uncommon: "border-emerald-300/60",
  rare: "border-uri-keaney/50",
  legendary: "border-uri-gold/60",
};

function CollectibleDetail({
  item,
  discovered,
  firstDrop,
  isEquipped,
  onClose,
}: {
  item: CosmeticItem;
  discovered: boolean;
  firstDrop: LootDropEntry | null;
  isEquipped: boolean;
  onClose: () => void;
}) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="relative z-10 w-full max-w-sm rounded-t-2xl border border-cq-border bg-cq-card p-5 shadow-xl sm:rounded-2xl">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl border border-cq-border bg-cq-elevated text-5xl">
          {discovered ? item.icon : "?"}
        </div>
        <h3 className="text-center font-display text-lg font-bold text-cq-foreground">{discovered ? item.label : "Undiscovered"}</h3>
        <p className="mt-1 text-center text-xs font-semibold uppercase tracking-wide text-cq-muted">{RARITY_LABELS[item.rarity]}</p>
        {isEquipped ? (
          <p className="mt-2 text-center text-xs font-semibold text-uri-gold">Currently equipped</p>
        ) : null}
        {discovered ? (
          <p className="mt-3 text-center text-sm text-cq-muted">{describeCosmeticEquipEffect(item.id)}</p>
        ) : (
          <p className="mt-3 text-center text-sm text-cq-muted">Defeat bosses and complete quests to discover this drop.</p>
        )}
        {firstDrop ? (
          <p className="mt-2 text-center text-xs text-cq-subtle">
            Found from {firstDrop.bossName} · {new Date(firstDrop.obtainedAt).toLocaleDateString()}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-uri-keaney py-3 text-sm font-semibold text-uri-navy hover:bg-uri-keaney/90"
        >
          Close
        </button>
      </div>
    </div>,
    document.body,
  );
}

export function ProfileCollectiblesTab({ character }: { character: Character }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { discoveredIds, firstDropByCosmetic, ownedItems } = useMemo(() => {
    const log = getLootLogForCharacter(character.id);
    const discovered = new Set(log.map((e) => e.cosmeticId));
    const firstByCosmetic = new Map<string, LootDropEntry>();
    for (const entry of log) {
      if (!firstByCosmetic.has(entry.cosmeticId)) firstByCosmetic.set(entry.cosmeticId, entry);
    }
    const owned = COSMETICS.filter((c) => discovered.has(c.id));
    return {
      discoveredIds: discovered,
      firstDropByCosmetic: firstByCosmetic,
      ownedItems: owned,
    };
  }, [character]);

  const achievementItems = getEarnedAchievements(character).filter((v) => v.earned);
  const totalCollectibles = discoveredIds.size + achievementItems.length;

  const selectedCosmetic = selectedId ? getCosmeticById(selectedId) : null;

  if (totalCollectibles === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <span className="text-4xl" aria-hidden>
          ✦
        </span>
        <p className="mt-3 font-display text-base font-semibold text-white">No collectibles yet</p>
        <p className="mt-1 max-w-xs text-sm text-white/60">Boss drops and achievements you unlock will appear here.</p>
      </div>
    );
  }

  return (
    <>
      <div className="cq-profile-collectibles-grid">
        {ownedItems.map((item) => {
          const isEquipped = character.equippedCosmetics?.[item.slot] === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedId(item.id)}
              className={`cq-profile-collectible-tile relative flex aspect-square flex-col items-center justify-center gap-1 border bg-cq-elevated p-2 transition active:scale-[0.98] ${RARITY_BORDER[item.rarity]} ${
                isEquipped ? "ring-2 ring-uri-gold/70 ring-offset-1" : ""
              }`}
            >
              <span className="text-3xl" aria-hidden>
                {item.icon}
              </span>
              <span className="line-clamp-2 text-center text-[10px] font-semibold leading-tight text-cq-foreground">{item.label}</span>
            </button>
          );
        })}
        {achievementItems.map(({ def }) => {
          const style = RARITY_CSS[def.rarity];
          return (
            <div
              key={def.id}
              className={`cq-profile-collectible-tile relative flex aspect-square flex-col items-center justify-center gap-1 border bg-gradient-to-b from-cq-card to-cq-elevated p-2 ${style.ring}`}
              title={def.name}
            >
              <span className="text-3xl" aria-hidden>
                {def.icon}
              </span>
              <span className={`line-clamp-2 text-center text-[10px] font-semibold leading-tight ${style.text}`}>{def.name}</span>
            </div>
          );
        })}
      </div>

      {selectedCosmetic ? (
        <CollectibleDetail
          item={selectedCosmetic}
          discovered={discoveredIds.has(selectedCosmetic.id)}
          firstDrop={firstDropByCosmetic.get(selectedCosmetic.id) ?? null}
          isEquipped={character.equippedCosmetics?.[selectedCosmetic.slot] === selectedCosmetic.id}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </>
  );
}
