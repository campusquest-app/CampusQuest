"use client";

import { useState } from "react";
import { DrawerSubPanelShell } from "@/components/DrawerSubPanelShell";
import { hapticsSupported, isHapticsEnabled, pulseHaptic, setHapticsEnabled } from "@/lib/client/hapticsPreference";
import { isGameMusicMuted, playXpDing, setGameMusicMuted } from "@/lib/playGameSound";

function Toggle({
  checked,
  label,
  onChange,
  disabled,
}: {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition touch-manipulation disabled:opacity-40 ${
        checked ? "bg-cyan-400/80" : "bg-white/15"
      }`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${checked ? "left-[1.35rem]" : "left-0.5"}`}
        aria-hidden
      />
    </button>
  );
}

export function SoundHapticsSettingsPanel({
  onBack,
  onMutedChange,
}: {
  onBack: () => void;
  onMutedChange?: (muted: boolean) => void;
}) {
  const [muted, setMuted] = useState(() => isGameMusicMuted());
  const [haptics, setHaptics] = useState(() => isHapticsEnabled());
  const vibrationAvailable = hapticsSupported();

  return (
    <DrawerSubPanelShell title="Sound & Haptics" onBack={onBack} scrollStorageKey="settings-sound">
      <ul className="overflow-hidden rounded-2xl border border-white/10">
        <li className="flex items-center gap-3 border-b border-white/[0.06] px-3 py-3.5">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-white/92">App sounds</span>
            <span className="block text-[11px] text-white/40">XP chimes and feedback sounds</span>
          </span>
          <Toggle
            checked={!muted}
            label="App sounds"
            onChange={(on) => {
              setGameMusicMuted(!on);
              setMuted(!on);
              onMutedChange?.(!on);
              if (on) playXpDing();
            }}
          />
        </li>
        <li className="flex items-center gap-3 px-3 py-3.5">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-white/92">Vibration</span>
            <span className="block text-[11px] text-white/40">
              {vibrationAvailable ? "Taps and reward feedback" : "This browser does not support vibration"}
            </span>
          </span>
          <Toggle
            checked={vibrationAvailable && haptics}
            disabled={!vibrationAvailable}
            label="Vibration"
            onChange={(on) => {
              setHapticsEnabled(on);
              setHaptics(on);
              if (on) pulseHaptic(12);
            }}
          />
        </li>
      </ul>
    </DrawerSubPanelShell>
  );
}
