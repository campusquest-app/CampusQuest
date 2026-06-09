"use client";

import { MapPin, Save, X } from "lucide-react";

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
  onEnterEdit,
  onExitEdit,
  onSave,
  savePending,
  saveMessage,
}: {
  debug: RealmMarkerEditorDebug;
  onEnterEdit: () => void;
  onExitEdit: () => void;
  onSave: () => void;
  savePending?: boolean;
  saveMessage?: string | null;
}) {
  if (!debug.isAdmin) return null;

  return (
    <div className="realm-marker-editor-panel absolute left-3 top-3 z-[6] flex max-w-[min(18rem,88vw)] flex-col gap-2 rounded-xl border border-amber-400/35 bg-black/75 p-3 text-[11px] text-white/85 shadow-lg backdrop-blur-sm">
      <p className="font-display text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200/90">Marker editor (debug)</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 font-mono text-[10px] text-white/70">
        <dt className="text-white/40">user id</dt>
        <dd className="truncate">{debug.userId ?? "—"}</dd>
        <dt className="text-white/40">role</dt>
        <dd>{debug.role}</dd>
        <dt className="text-white/40">isAdmin</dt>
        <dd className={debug.isAdmin ? "text-emerald-300" : "text-red-300"}>{String(debug.isAdmin)}</dd>
        <dt className="text-white/40">edit mode</dt>
        <dd className={debug.editMode ? "text-amber-200" : "text-white/55"}>{String(debug.editMode)}</dd>
        {debug.selectedMarkerId ? (
          <>
            <dt className="text-white/40">selected</dt>
            <dd className="truncate">{debug.selectedMarkerId}</dd>
            {debug.selectedCoords ? (
              <>
                <dt className="text-white/40">x / y</dt>
                <dd>
                  {debug.selectedCoords.x.toFixed(2)}% · {debug.selectedCoords.y.toFixed(2)}%
                </dd>
              </>
            ) : null}
          </>
        ) : null}
      </dl>

      {!debug.editMode ? (
        <button
          type="button"
          onClick={onEnterEdit}
          className="mt-1 flex items-center justify-center gap-2 rounded-lg border border-amber-400/50 bg-amber-500/20 px-3 py-2 text-xs font-bold text-amber-100 transition hover:bg-amber-500/30"
        >
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          Edit Map
        </button>
      ) : (
        <div className="mt-1 flex flex-col gap-1.5">
          <p className="text-[10px] leading-snug text-amber-100/80">Drag pins to reposition. Map pan is paused while editing.</p>
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
            <X className="h-3.5 w-3.5" aria-hidden />
            Exit Edit Mode
          </button>
        </div>
      )}

      {saveMessage ? <p className="text-[10px] text-emerald-300">{saveMessage}</p> : null}
    </div>
  );
}
