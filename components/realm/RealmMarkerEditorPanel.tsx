"use client";

import { ChevronDown, MapPin, Save, X } from "lucide-react";
import { useState } from "react";
import type { MarkerPlacementPoint } from "@/lib/realm/mapPlacement";
import { RealmMapDebugContent } from "./RealmMapDebugPanel";
import { RealmUrinvolvedPlacementPanel } from "./RealmUrinvolvedPlacementPanel";
import type { UrinvolvedEditPin } from "@/lib/realm/urinvolvedEditPins";
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
  saveMessageTone = "success",
  newLocationName = "",
  onNewLocationNameChange,
  placingNewLocation = false,
  placementPreview = null,
  onStartPlacingNewLocation,
  onCancelPlacingNewLocation,
  onConfirmPlacement,
  onRepositionPlacement,
  createLocationPending = false,
  selectedUrinvolvedEventId = null,
  onSelectUrinvolvedEventId,
  onUrinvolvedPlacementsChanged,
  selectedLandmarkRealmId = null,
  selectedEventEdit = null,
}: {
  debug: RealmMarkerEditorDebug;
  report: RealmMapLayerReport | null;
  onEnterEdit: () => void;
  onExitEdit: () => void;
  onSave: () => void;
  savePending?: boolean;
  saveMessage?: string | null;
  saveMessageTone?: "success" | "error";
  newLocationName?: string;
  onNewLocationNameChange?: (value: string) => void;
  placingNewLocation?: boolean;
  placementPreview?: MarkerPlacementPoint | null;
  onStartPlacingNewLocation?: () => void;
  onCancelPlacingNewLocation?: () => void;
  onConfirmPlacement?: () => void;
  onRepositionPlacement?: () => void;
  createLocationPending?: boolean;
  selectedUrinvolvedEventId?: string | null;
  onSelectUrinvolvedEventId?: (id: string | null) => void;
  onUrinvolvedPlacementsChanged?: () => void;
  selectedLandmarkRealmId?: string | null;
  selectedEventEdit?: UrinvolvedEditPin | null;
}) {
  const [debugExpanded, setDebugExpanded] = useState(false);

  if (!debug.isAdmin) return null;

  if (placingNewLocation) return null;

  if (!debug.editMode) {
    return (
      <button
        type="button"
        onClick={onEnterEdit}
        data-no-drawer-swipe="true"
        className="cq-realm-float-btn cq-realm-float-btn--edit absolute left-[max(0.75rem,env(safe-area-inset-left))] z-[6] flex items-center gap-1.5 px-2.5 py-2 text-[11px] font-semibold text-white touch-manipulation"
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
      className="realm-map-editor-panel absolute inset-x-3 z-[6] flex max-h-[min(42vh,20rem)] flex-col overflow-hidden rounded-xl border border-uri-keaney/35 bg-[#041E42]/92 shadow-xl backdrop-blur-md transition-all duration-200 sm:inset-x-auto sm:bottom-auto sm:left-3 sm:top-3 sm:max-h-[min(70vh,28rem)] sm:w-[min(18rem,88vw)]"
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
          Drag landmark pins to reposition them, or drag URInvolved event pins (📅) to fine-tune event locations. Save when finished.
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

        {saveMessage ? (
          <p
            className={`mt-2 text-[10px] ${saveMessageTone === "error" ? "text-rose-300" : "text-emerald-300"}`}
            role={saveMessageTone === "error" ? "alert" : "status"}
          >
            {saveMessage}
          </p>
        ) : null}

        <div className="mt-3 space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-uri-keaney/90">Add location</p>
          <input
            type="text"
            value={newLocationName}
            onChange={(e) => onNewLocationNameChange?.(e.target.value)}
            placeholder="e.g. Edwards Hall"
            className="w-full rounded-lg border border-white/15 bg-black/30 px-2.5 py-2 text-xs text-white placeholder:text-white/35"
          />
          {placementPreview ? (
            <div className="space-y-1.5 rounded-lg border border-uri-keaney/35 bg-uri-keaney/10 px-2.5 py-2">
              <p className="text-[11px] font-semibold text-white">{newLocationName.trim() || "New marker"}</p>
              <p className="font-mono text-[10px] text-cyan-100/80">
                {placementPreview.lat.toFixed(5)}, {placementPreview.lng.toFixed(5)}
              </p>
              <button
                type="button"
                onClick={onConfirmPlacement}
                disabled={createLocationPending || !newLocationName.trim()}
                className="w-full rounded-lg border border-emerald-400/45 bg-emerald-500/20 px-3 py-2 text-xs font-bold text-emerald-100 disabled:opacity-50"
              >
                {createLocationPending ? "Saving…" : "Confirm placement"}
              </button>
              <button
                type="button"
                onClick={onRepositionPlacement}
                disabled={createLocationPending}
                className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80"
              >
                Reposition
              </button>
              <button
                type="button"
                onClick={onCancelPlacingNewLocation}
                disabled={createLocationPending}
                className="w-full rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white/60"
              >
                Discard preview
              </button>
            </div>
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

        {selectedEventEdit ? (
          <div className="mb-3 rounded-lg border border-cyan-300/25 bg-cyan-400/10 px-3 py-2 text-[11px] leading-relaxed text-cyan-50">
            <p className="font-semibold text-white">{selectedEventEdit.title}</p>
            <p>Source venue: {selectedEventEdit.sourceVenue || "—"}</p>
            <p>Resolved location: {selectedEventEdit.locationName}</p>
            <p>
              Coordinates: {selectedEventEdit.lat.toFixed(5)}, {selectedEventEdit.lng.toFixed(5)}
              {selectedEventEdit.unsaved ? " (unsaved)" : ""}
            </p>
            <p>Source: {selectedEventEdit.source || "—"}</p>
            <p>Event ID: {selectedEventEdit.externalEventId}</p>
            {selectedEventEdit.realmLocationId ? <p>Canonical location: {selectedEventEdit.realmLocationId}</p> : null}
          </div>
        ) : null}

        <RealmUrinvolvedPlacementPanel
          active
          selectedExternalEventId={selectedUrinvolvedEventId}
          onSelectExternalEventId={onSelectUrinvolvedEventId}
          onPlacementsChanged={onUrinvolvedPlacementsChanged}
          selectedLandmarkRealmId={selectedLandmarkRealmId}
        />

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
