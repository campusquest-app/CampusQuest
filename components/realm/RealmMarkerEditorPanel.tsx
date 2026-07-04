"use client";

import { ChevronDown, MapPin, Save, X } from "lucide-react";
import { useState } from "react";
import { RealmMapDebugContent } from "./RealmMapDebugPanel";
import type { RealmMapLayerReport } from "./useRealmMapDiagnostics";

export type RealmMarkerEditorDebug = {
  userId: string | null;
  role: string;
  isAdmin: boolean;
  editMode: boolean;
  selectedMarkerId: string | null;
  selectedCoords: { x: number; y: number } | null;
};

export function RealmMarkerEditorPanel({
  debug,
  report,
  onEnterEdit,
  onExitEdit,
  onSave,
  savePending,
  saveMessage,
  newLocationName = "",
  onNewLocationNameChange,
  placingNewLocation = false,
  onStartPlacingNewLocation,
  onCancelPlacingNewLocation,
  createLocationPending = false,
}: {
  debug: RealmMarkerEditorDebug;
  report: RealmMapLayerReport | null;
  onEnterEdit: () => void;
  onExitEdit: () => void;
  onSave: () => void;
  savePending?: boolean;
  saveMessage?: string | null;
  newLocationName?: string;
  onNewLocationNameChange?: (value: string) => void;
  placingNewLocation?: boolean;
  onStartPlacingNewLocation?: () => void;
  onCancelPlacingNewLocation?: () => void;
  createLocationPending?: boolean;
}) {
  const [debugExpanded, setDebugExpanded] = useState(false);

  if (!debug.isAdmin) return null;

  if (!debug.editMode) {
    return (
      <button
        type="button"
        onClick={onEnterEdit}
        data-no-drawer-swipe="true"
        className="cq-realm-float-btn cq-realm-float-btn--edit absolute left-[max(0.75rem,env(safe-area-inset-left))] z-[6] flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-white touch-manipulation"
        aria-label="Edit map marker positions"
      >
        <MapPin className="h-3.5 w-3.5 text-uri-keaney" aria-hidden />
        Edit Map
      </button>
    );
  }

  return (
    <div
      data-no-drawer-swipe="true"
      className="realm-map-editor-panel absolute inset-x-3 bottom-[4.75rem] z-[6] flex max-h-[min(42vh,20rem)] flex-col overflow-hidden rounded-xl border border-uri-keaney/35 bg-[#041E42]/92 shadow-xl backdrop-blur-md transition-all duration-200 sm:inset-x-auto sm:bottom-auto sm:left-3 sm:top-3 sm:max-h-[min(70vh,28rem)] sm:w-[min(18rem,88vw)]"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5">
        <p className="font-display text-xs font-bold uppercase tracking-[0.16em] text-uri-keaney">Map Editor</p>
        <button
          type="button"
          onClick={onExitEdit}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/15 text-white/70 transition hover:bg-white/10 hover:text-white"
          aria-label="Close map editor"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2.5">
        <p className="text-[11px] leading-snug text-white/65">
          Drag pins to reposition, or select a pin then tap the map to place it. Save when finished.
        </p>

        {debug.selectedMarkerId ? (
          <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-[11px] text-white/80">
            <p className="font-semibold text-white/90">Selected marker</p>
            <p className="mt-0.5 truncate capitalize">{debug.selectedMarkerId.replace(/-/g, " ")}</p>
            {debug.selectedCoords ? (
              <p className="mt-1 font-mono text-[10px] text-white/55">
                {debug.selectedCoords.x.toFixed(2)}% · {debug.selectedCoords.y.toFixed(2)}%
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-[10px] text-white/45">Tap a marker to select it for editing.</p>
        )}

        <div className="mt-3 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={onSave}
            disabled={savePending}
            className="flex items-center justify-center gap-2 rounded-lg border border-emerald-400/45 bg-emerald-500/20 px-3 py-2 text-xs font-bold text-emerald-100 transition hover:bg-emerald-500/30 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" aria-hidden />
            {savePending ? "Saving…" : "Save positions"}
          </button>
          <button
            type="button"
            onClick={onExitEdit}
            className="flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold text-white/75 transition hover:bg-white/10"
          >
            Cancel
          </button>
        </div>

        {saveMessage ? <p className="mt-2 text-[10px] text-emerald-300">{saveMessage}</p> : null}

        <div className="mt-3 space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-uri-keaney/90">Add location</p>
          <input
            type="text"
            value={newLocationName}
            onChange={(e) => onNewLocationNameChange?.(e.target.value)}
            placeholder="e.g. Edwards Hall"
            className="w-full rounded-lg border border-white/15 bg-black/30 px-2.5 py-2 text-xs text-white placeholder:text-white/35"
          />
          {placingNewLocation ? (
            <button
              type="button"
              onClick={onCancelPlacingNewLocation}
              disabled={createLocationPending}
              className="w-full rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-100"
            >
              {createLocationPending ? "Creating…" : "Tap the map to place — Cancel"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onStartPlacingNewLocation}
              disabled={!newLocationName.trim() || createLocationPending}
              className="w-full rounded-lg border border-uri-keaney/40 bg-uri-keaney/15 px-3 py-2 text-xs font-semibold text-cyan-100 disabled:opacity-50"
            >
              Place new marker on map
            </button>
          )}
        </div>

        <div className="mt-3 border-t border-white/10 pt-2">
          <button
            type="button"
            onClick={() => setDebugExpanded((open) => !open)}
            className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-amber-200/80 transition hover:text-amber-100"
            aria-expanded={debugExpanded}
          >
            Debug Info
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${debugExpanded ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
          {debugExpanded && report ? (
            <RealmMapDebugContent report={report} userId={debug.userId} role={debug.role} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
