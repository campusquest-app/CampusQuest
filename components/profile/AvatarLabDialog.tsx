"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Character } from "@/lib/types";
import { updateCharacter } from "@/lib/store";
import { registerLogoutPrepare } from "@/lib/client/logoutPrepare";
import { openAvatarDraft, saveAvatarDraft } from "@/lib/profile/avatarLabSession";
import { getClassRealm, getClassTitle } from "@/lib/characterClasses";
import { AvatarBuilder } from "@/components/AvatarBuilder";
import { AvatarDisplay } from "@/components/AvatarDisplay";

/** Shared Avatar Lab used by the profile and the character sheet. */
export function AvatarLabDialog({
  character,
  open,
  onClose,
  onSaved,
}: {
  character: Character;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [draft, setDraft] = useState(() => character.avatar);

  const characterRef = useRef(character);
  characterRef.current = character;

  useEffect(() => {
    if (open) setDraft(openAvatarDraft(characterRef.current));
  }, [open]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const root = document.documentElement;
    root.setAttribute("data-cq-avatar-lab-open", "true");
    return () => root.removeAttribute("data-cq-avatar-lab-open");
  }, [open]);

  useEffect(() => {
    return registerLogoutPrepare(() => {
      if (!open) return;
      saveAvatarDraft(draft);
    });
  }, [open, draft]);

  if (!open || typeof document === "undefined") return null;

  function handleSave() {
    saveAvatarDraft(draft);
    onSaved?.();
    onClose();
  }

  return createPortal(
    <div
      className="cq-avatar-lab fixed inset-0 z-[10050] flex items-end justify-center sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Avatar Lab"
    >
      <div className="absolute inset-0 bg-black/85" aria-hidden onClick={onClose} />
      <div className="relative z-10 flex max-h-[calc(100dvh-env(safe-area-inset-top,0px))] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-uri-keaney/30 bg-uri-navy shadow-xl shadow-black/50 sm:max-h-[min(88vh,calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)))] sm:rounded-2xl lg:max-w-3xl">
        <div className="shrink-0 border-b border-white/10 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
          <h2 className="font-display text-lg font-bold text-white sm:text-xl">Avatar Lab</h2>
          <p className="mt-1 text-sm text-white/60">
            Customize presets, colors, hair, face, and more — then save your look.
          </p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          <div className="sticky top-0 z-10 shrink-0 border-b border-white/10 bg-uri-navy px-4 py-4 sm:px-5 lg:static lg:w-56 lg:border-b-0 lg:border-r lg:py-5">
            <div className="flex flex-col items-center text-center">
              <div className="rounded-2xl border border-white/15 bg-white/5 p-3 shadow-inner">
                <AvatarDisplay avatar={draft} size={120} />
              </div>
              <p className="mt-3 text-xs text-white/55">Preview your avatar before saving.</p>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
            <AvatarBuilder
              value={draft}
              onChange={setDraft}
              compact
              hidePreview
              showClassPresets
              selectedClassId={
                character.classId === "gym" ||
                character.classId === "knight" ||
                character.classId === "mage" ||
                character.classId === "bard" ||
                character.classId === "rogue"
                  ? character.classId
                  : null
              }
              selectedWeapon={character.starterWeapon ?? null}
              onWeaponChange={(weaponId) => {
                updateCharacter({ starterWeapon: weaponId ?? undefined });
              }}
              onClassChange={(classId) => {
                if (classId) updateCharacter({ classId });
              }}
              preview={{
                displayName: character.name,
                username: character.username,
                level: character.level,
                totalXp: character.totalXP,
                classLabel:
                  [getClassTitle(character.classId), getClassRealm(character.classId)].filter(Boolean).join(" · ") ||
                  "Adventurer",
              }}
            />
          </div>
        </div>
        <div className="flex shrink-0 gap-2 border-t border-white/10 bg-uri-navy/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/15 py-3 text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 rounded-xl bg-uri-keaney py-3 text-sm font-semibold text-uri-navy hover:bg-uri-keaney/90"
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
