"use client";

import { useEffect, useState } from "react";
import {
  type DiceBearAvatarV2,
  serializeDiceBearAvatar,
  parseDiceBearAvatar,
  getDefaultDiceBearAvatar,
  randomDiceBearSeed,
} from "@/lib/dicebearAvatar";
import { buildDiceBearForClass, CHARACTER_CLASSES, STARTER_WEAPONS, type CharacterClassId } from "@/lib/characterClasses";
import { AVATAR_LOOK_PRESETS, isAvatarLookPresetSelected } from "@/lib/avatarPresets";
import { AvatarDisplay } from "./AvatarDisplay";
import { DiceBearForgeControls, DiceBearBackgroundPicker } from "./DiceBearForgeControls";
import { randomAppearanceOptions, randomBackgroundColors } from "@/lib/dicebearAdvancedOptions";

type UnlockContext = {
  achievements: string[];
  level: number;
  unlockedCosmetics?: string[] | null;
} | null;

function cloneDice(d: DiceBearAvatarV2): DiceBearAvatarV2 {
  return {
    v: 2,
    style: d.style,
    seed: d.seed,
    options: { ...d.options },
  };
}

export function AvatarBuilder({
  value,
  onChange,
  compact = false,
  showClassPresets = true,
  selectedClassId,
  onClassChange,
  selectedWeapon,
  onWeaponChange,
  unlockContext: _unlockContext,
  preview,
  hidePreview = false,
}: {
  value: string;
  onChange: (avatar: string) => void;
  compact?: boolean;
  showClassPresets?: boolean;
  selectedClassId?: CharacterClassId | null;
  onClassChange?: (classId: CharacterClassId | null) => void;
  selectedWeapon?: string | null;
  onWeaponChange?: (weaponId: string | null) => void;
  /** Legacy prop from profile editor — DiceBear has no locked cosmetics. */
  unlockContext?: UnlockContext;
  preview?: {
    displayName: string;
    username: string;
    level: number;
    totalXp: number;
    classLabel: string;
  };
  /** Hide inline preview (modal provides a pinned preview). */
  hidePreview?: boolean;
}) {
  const [data, setData] = useState<DiceBearAvatarV2>(() => parseDiceBearAvatar(value) ?? getDefaultDiceBearAvatar());

  useEffect(() => {
    const p = parseDiceBearAvatar(value);
    if (p) setData(cloneDice(p));
  }, [value]);

  const commit = (next: DiceBearAvatarV2) => {
    setData(next);
    onChange(serializeDiceBearAvatar(next));
  };

  const randomize = () => {
    const appearance = randomAppearanceOptions(data.style);
    commit({
      v: 2,
      style: data.style,
      seed: randomDiceBearSeed(),
      options: {
        backgroundColor: randomBackgroundColors(),
        backgroundType: ["gradientLinear"],
        ...appearance,
      },
    });
  };

  const resetToDefault = () => {
    commit(getDefaultDiceBearAvatar());
  };

  const applyPreset = (preset: DiceBearAvatarV2) => {
    commit(cloneDice(preset));
  };

  const patchOptions = (partial: Record<string, unknown>) => {
    commit({
      ...cloneDice(data),
      options: { ...data.options, ...partial },
    });
  };

  const applyBg = (backgroundColor: string[]) => {
    patchOptions({ backgroundColor, backgroundType: ["gradientLinear"] });
  };

  const applyClassPreset = (classId: CharacterClassId) => {
    const next = buildDiceBearForClass(classId);
    commit(next);
    onClassChange?.(classId);
  };

  const previewSize = compact ? 80 : 128;
  const pv = preview ?? {
    displayName: "Adventurer",
    username: "your_name",
    level: 1,
    totalXp: 0,
    classLabel: "Choose your class",
  };

  const xpMax = Math.max(1, (pv.level - 1) * 100 + 100);
  const xpPct = Math.min(100, (pv.totalXp / xpMax) * 100);

  const controls = (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">Random Avatar</p>
            <p className="mt-0.5 text-xs text-white/55">Generate a new avatar instantly.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={randomize}
              className="rounded-xl border border-uri-gold/50 bg-gradient-to-r from-uri-gold/25 to-amber-500/20 px-4 py-2.5 text-sm font-bold text-amber-100 shadow-[0_0_20px_rgba(245,158,11,0.12)] hover:from-uri-gold/35 hover:to-amber-500/30 min-h-[44px]"
            >
              🎲 Randomize
            </button>
            <button
              type="button"
              onClick={resetToDefault}
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/85 hover:border-white/25 hover:bg-white/10 min-h-[44px]"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-white">Choose a Preset</p>
        <p className="mt-0.5 text-xs text-white/55">Tap a preset to instantly apply a complete avatar style.</p>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {AVATAR_LOOK_PRESETS.map((preset) => {
            const selected = isAvatarLookPresetSelected(data, preset);
            const previewAvatar = serializeDiceBearAvatar(preset);
            return (
              <button
                key={preset.seed}
                type="button"
                onClick={() => applyPreset(preset)}
                aria-label={preset.label}
                className={`relative rounded-2xl border px-3 py-3.5 text-left transition-all min-h-[4.75rem] min-w-0 flex flex-col items-start justify-center gap-1.5 ${
                  selected
                    ? "border-2 border-uri-keaney bg-uri-keaney/20 shadow-[0_0_22px_rgba(104,171,232,0.35)] ring-2 ring-uri-keaney/35"
                    : "border-white/12 bg-white/[0.06] hover:border-white/25 hover:bg-white/[0.09]"
                }`}
              >
                {selected ? (
                  <span
                    className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-uri-keaney text-[11px] font-bold text-white shadow-md"
                    aria-hidden
                  >
                    ✓
                  </span>
                ) : null}
                <div
                  className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/20"
                  aria-hidden
                >
                  <AvatarDisplay avatar={previewAvatar} size={40} fitParent />
                </div>
                <p className="text-sm font-semibold text-white leading-tight whitespace-nowrap">{preset.label}</p>
              </button>
            );
          })}
        </div>
      </div>

      <DiceBearBackgroundPicker data={data} applyBg={applyBg} />

      <DiceBearForgeControls
        data={data}
        patchOptions={patchOptions}
        applyBg={applyBg}
        hideBackground
      />
    </div>
  );

  const classStrip =
    showClassPresets && !compact ? (
      <section className="space-y-3 rounded-2xl border border-white/10 bg-uri-navy/80 px-4 py-4 sm:px-5 sm:py-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-uri-keaney/80">Class starter looks</p>
          <h3 className="text-sm font-semibold text-white">Pick a vibe</h3>
          <p className="text-xs text-white/65">Applies a curated DiceBear style + colors inspired by each class.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {CHARACTER_CLASSES.map((cls) => (
            <button
              key={cls.id}
              type="button"
              onClick={() => applyClassPreset(cls.id)}
              className={`flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-xs font-medium tracking-wide transition-all ${
                selectedClassId === cls.id
                  ? "border-uri-gold/70 bg-uri-keaney/90 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.14),0_12px_28px_rgba(0,0,0,0.65)]"
                  : "border-white/10 bg-white/5 text-white/80 hover:border-uri-keaney/60 hover:bg-uri-keaney/20"
              }`}
            >
              <span aria-hidden className="text-base">
                {cls.icon}
              </span>
              <span className="truncate">{cls.outfitLabel}</span>
            </button>
          ))}
        </div>
        {onWeaponChange && (
          <div className="mt-3 border-t border-white/10 pt-3">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
              Starter weapon
            </label>
            <div className="flex flex-wrap gap-2">
              {STARTER_WEAPONS.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => onWeaponChange(selectedWeapon === w.id ? null : w.id)}
                  className={`flex items-center gap-1.5 rounded-2xl border px-3 py-1.5 text-xs font-medium tracking-wide transition-all ${
                    selectedWeapon === w.id
                      ? "border-uri-gold/70 bg-uri-gold/20 text-uri-gold shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
                      : "border-white/10 bg-white/5 text-white/80 hover:border-uri-gold/60 hover:bg-uri-gold/10"
                  }`}
                >
                  <span aria-hidden className="text-sm">
                    {w.icon}
                  </span>
                  <span className="truncate">{w.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    ) : null;

  const previewCard = (
    <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-uri-navy via-[#0a1f3d] to-uri-keaney/35 px-4 py-5 sm:px-6 sm:py-6 shadow-[0_20px_50px_rgba(0,0,0,0.55)] ring-1 ring-white/10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(104,171,232,0.25),transparent_60%)]" />
      <div className="relative flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        <div className="flex justify-center sm:justify-start">
          <div
            className="rounded-3xl border border-white/15 bg-black/25 p-2 shadow-inner"
            style={{ width: previewSize + 24, height: previewSize + 24 }}
          >
            <AvatarDisplay avatar={serializeDiceBearAvatar(data)} size={previewSize} />
          </div>
        </div>
        <div className="flex-1 min-w-0 text-center sm:text-left space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-uri-keaney/90">Hero card</p>
          <p className="font-display text-lg sm:text-xl font-bold text-white truncate">{pv.displayName}</p>
          <p className="text-xs text-uri-keaney/90 font-mono truncate">@{pv.username}</p>
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-[11px]">
            <span className="rounded-lg bg-uri-gold/20 text-uri-gold border border-uri-gold/40 px-2 py-0.5 font-semibold">
              Lv.{pv.level}
            </span>
            <span className="text-white/60 font-mono">{pv.totalXp.toLocaleString()} XP</span>
            <span className="text-white/50">·</span>
            <span className="text-white/80 truncate max-w-[12rem]">{pv.classLabel}</span>
          </div>
          <div className="h-2 rounded-full bg-black/40 overflow-hidden border border-white/10">
            <div
              className="h-full bg-gradient-to-r from-uri-keaney to-uri-gold/90 rounded-full transition-all"
              style={{ width: `${xpPct}%` }}
            />
          </div>
          <p className="text-[10px] text-white/40">Portrait powered by DiceBear · stored as style + options.</p>
        </div>
      </div>
    </div>
  );

  if (compact) {
    return (
      <div className="space-y-4">
        {!hidePreview ? (
          preview ? (
            <div className="rounded-2xl border border-white/12 bg-gradient-to-br from-uri-navy/95 to-black/40 px-3 py-3">
              <div className="flex items-center gap-3">
                <div className="rounded-xl border border-white/10 bg-black/30 p-1.5 shrink-0">
                  <AvatarDisplay avatar={serializeDiceBearAvatar(data)} size={72} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate">{preview.displayName}</p>
                  <p className="text-[11px] text-uri-keaney/90 font-mono truncate">@{preview.username}</p>
                  <p className="text-[10px] text-white/50 mt-0.5 truncate">
                    Lv.{preview.level} · {preview.totalXp.toLocaleString()} XP · {preview.classLabel}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex justify-center">
              <div
                className="rounded-2xl border border-white/15 bg-white/5 p-2"
                style={{ width: previewSize + 20, height: previewSize + 20 }}
              >
                <AvatarDisplay avatar={serializeDiceBearAvatar(data)} size={previewSize} />
              </div>
            </div>
          )
        ) : null}
        {controls}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {previewCard}
      {classStrip}
      <section className="rounded-3xl border border-white/10 bg-uri-navy/90 px-4 py-5 sm:px-6 sm:py-6 space-y-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-uri-keaney/80">Forge your visage</p>
            <h3 className="text-sm font-semibold text-white">DiceBear avatar lab</h3>
          </div>
        </div>
        {controls}
      </section>
    </div>
  );
}
