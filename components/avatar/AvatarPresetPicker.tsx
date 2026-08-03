"use client";

import { useEffect } from "react";
import type { DiceBearAvatarV2 } from "@/lib/dicebearAvatar";
import { serializeDiceBearAvatar } from "@/lib/dicebearAvatar";
import {
  AVATAR_LOOK_PRESETS,
  isAvatarLookPresetSelected,
  resolveAvatarPreset,
  type AvatarLookPreset,
} from "@/lib/avatarPresets";
import { AvatarDisplay } from "@/components/AvatarDisplay";

const PRESET_THUMB_PX = 80;

export function AvatarPresetPicker({
  data,
  onSelect,
}: {
  data: DiceBearAvatarV2;
  onSelect: (preset: AvatarLookPreset) => void;
}) {
  useEffect(() => {
    let cancelled = false;
    void import("@/lib/dicebearSvg").then((mod) => {
      if (cancelled) return;
      for (const preset of AVATAR_LOOK_PRESETS) {
        mod.createDiceBearSvgString(resolveAvatarPreset(preset));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="cq-avatar-preset-section" aria-label="Choose your avatar preset">
      <header className="cq-avatar-preset-header">
        <h4 className="cq-avatar-preset-title">Avatar presets</h4>
        <p className="cq-avatar-preset-subtitle">Optional looks inside Customize More.</p>
      </header>

      <div className="cq-avatar-preset-grid">
        {AVATAR_LOOK_PRESETS.map((preset) => {
          const selected = isAvatarLookPresetSelected(data, preset);
          const resolved = resolveAvatarPreset(preset);
          const previewAvatar = serializeDiceBearAvatar(resolved);

          return (
            <button
              key={preset.seed}
              type="button"
              onClick={() => onSelect(preset)}
              aria-label={preset.label}
              aria-pressed={selected}
              className={`cq-avatar-preset-card cq-avatar-preset-spring${selected ? " cq-avatar-preset-card--selected" : ""}`}
            >
              {selected ? (
                <span className="cq-avatar-preset-check" aria-hidden>
                  ✓
                </span>
              ) : null}

              <div className="cq-avatar-preset-thumb" aria-hidden>
                <AvatarDisplay
                  avatar={previewAvatar}
                  size={PRESET_THUMB_PX}
                  fitParent
                  showProp={false}
                  className="cq-avatar-preset-thumb__frame"
                />
              </div>

              <span className="cq-avatar-preset-label">{preset.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
