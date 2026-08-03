"use client";

import { useEffect, useState } from "react";
import {
  type AvatarConfig,
  type AvatarManualField,
  type AvatarManualOverrides,
  avatarConfigFromPreset,
  avatarConfigToDiceBear,
  clearOverrides,
  markAllAppearanceOverrides,
  patchAvatarConfigOptions,
  randomizeAvatarConfig,
  resetAvatarConfigToStarter,
} from "@/lib/avatarConfig";
import type { AvatarLookPreset } from "@/lib/avatarPresets";
import { AvatarPresetPicker } from "@/components/avatar/AvatarPresetPicker";
import { DiceBearForgeControls, DiceBearBackgroundPicker } from "@/components/DiceBearForgeControls";

type AdvancedSection = "avatar" | "appearance" | "face" | "style" | null;

const SECTION_ORDER: { id: Exclude<AdvancedSection, null>; title: string; blurb: string }[] = [
  { id: "avatar", title: "Avatar", blurb: "Presets and randomize" },
  { id: "appearance", title: "Appearance", blurb: "Skin, hair style, hair color" },
  { id: "face", title: "Face", blurb: "Eyes, mouth, glasses, marks" },
  { id: "style", title: "Style", blurb: "Background and accessories" },
];

function touchedFieldsFromPartial(partial: Record<string, unknown>): AvatarManualField[] {
  const touched: AvatarManualField[] = [];
  if ("skinColor" in partial || "baseColor" in partial) touched.push("skinTone");
  if ("hair" in partial || "head" in partial) touched.push("hairStyle");
  if ("hairColor" in partial || "headContrastColor" in partial) touched.push("hairColor");
  if ("eyes" in partial || "face" in partial) touched.push("eyes");
  if ("mouth" in partial) touched.push("mouth");
  if ("glasses" in partial || "glassesProbability" in partial) touched.push("glasses");
  if ("features" in partial || "featuresProbability" in partial) touched.push("features");
  if ("backgroundColor" in partial) touched.push("background");
  return touched.length ? touched : ["hairStyle"];
}

export function AdvancedAvatarEditor({
  config,
  overrides,
  onChange,
  open,
  onOpenChange,
  starterPresetId = null,
}: {
  config: AvatarConfig;
  overrides: AvatarManualOverrides;
  onChange: (next: { config: AvatarConfig; overrides: AvatarManualOverrides }) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Last starter card id — used by Reset after randomize clears presetId. */
  starterPresetId?: string | null;
}) {
  const [section, setSection] = useState<AdvancedSection>("avatar");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    void import("@/lib/dicebearSvg");
  }, [open]);

  if (!open) return null;

  const data = avatarConfigToDiceBear(config);

  const patchOptions = (partial: Record<string, unknown>) => {
    onChange(patchAvatarConfigOptions(config, partial, overrides, touchedFieldsFromPartial(partial)));
  };

  const applyBg = (backgroundColor: string[]) => {
    onChange(
      patchAvatarConfigOptions(
        config,
        { backgroundColor, backgroundType: ["gradientLinear"] },
        overrides,
        ["background"],
      ),
    );
  };

  const applyPreset = (preset: AvatarLookPreset) => {
    onChange({
      config: avatarConfigFromPreset(preset, config.classType),
      overrides: clearOverrides(),
    });
  };

  const toggleSection = (id: Exclude<AdvancedSection, null>) => {
    if (isMobile) {
      setSection((prev) => (prev === id ? null : id));
    } else {
      setSection(id);
    }
  };

  return (
    <div className="cq-advanced-avatar space-y-3" data-testid="advanced-avatar-editor">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-uri-keaney/80">
            Customize Your Look
          </p>
          <p className="text-sm text-white/60">Optional details — skip anytime.</p>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="cq-avatar-btn cq-avatar-btn--ghost min-h-[44px] px-3 text-sm"
        >
          Hide
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            onChange({
              config: randomizeAvatarConfig(config),
              overrides: markAllAppearanceOverrides(),
            })
          }
          className="cq-avatar-btn cq-avatar-btn--gold min-h-[44px]"
        >
          Randomize
        </button>
        <button
          type="button"
          onClick={() =>
            onChange({
              config: resetAvatarConfigToStarter(config, starterPresetId),
              overrides: clearOverrides(),
            })
          }
          className="cq-avatar-btn cq-avatar-btn--ghost min-h-[44px]"
        >
          Reset
        </button>
      </div>

      <div className="space-y-2">
        {SECTION_ORDER.map((item) => {
          const expanded = section === item.id;
          return (
            <div
              key={item.id}
              className="rounded-2xl border border-white/12 bg-white/[0.03] overflow-hidden"
            >
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => toggleSection(item.id)}
                className="flex w-full min-h-[44px] items-center justify-between gap-2 px-4 py-3 text-left"
              >
                <span>
                  <span className="block text-sm font-semibold text-white">{item.title}</span>
                  <span className="block text-xs text-white/50">{item.blurb}</span>
                </span>
                <span className="text-white/50" aria-hidden>
                  {expanded ? "−" : "+"}
                </span>
              </button>
              {expanded ? (
                <div className="border-t border-white/10 px-3 pb-4 pt-3 space-y-4">
                  {item.id === "avatar" ? (
                    <AvatarPresetPicker data={data} onSelect={applyPreset} />
                  ) : null}
                  {item.id === "appearance" || item.id === "face" || item.id === "style" ? (
                    <>
                      {item.id === "style" ? (
                        <DiceBearBackgroundPicker data={data} applyBg={applyBg} />
                      ) : null}
                      <DiceBearForgeControls
                        data={data}
                        patchOptions={patchOptions}
                        applyBg={applyBg}
                        hideBackground={item.id !== "style"}
                      />
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
