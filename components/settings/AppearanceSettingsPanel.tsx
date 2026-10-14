"use client";

import { DrawerSubPanelShell } from "@/components/DrawerSubPanelShell";

export function AppearanceSettingsPanel({ onBack }: { onBack: () => void }) {
  return (
    <DrawerSubPanelShell title="Appearance" onBack={onBack} scrollStorageKey="settings-appearance">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-sm font-semibold text-white">Dark navy</p>
        <p className="mt-2 text-[12px] leading-relaxed text-white/55">
          CampusQuest uses its dark navy theme everywhere. A light theme is not available, so there is nothing to switch.
        </p>
      </div>
    </DrawerSubPanelShell>
  );
}
