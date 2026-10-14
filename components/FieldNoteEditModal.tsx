"use client";

import { useState } from "react";
import type { FieldNote, QuadPostVisibility } from "@/lib/types";
import { FIELD_NOTE_MAX_CHARS } from "@/lib/types";
import type { RealmLocationId } from "@/lib/realm/locations";
import { useCampusLocations } from "@/lib/client/campusLocationsClient";
import { CqModalLayer } from "@/components/ui/CqModalLayer";

export function FieldNoteEditModal({
  note,
  open,
  onClose,
  onSave,
  saving = false,
  error = null,
}: {
  note: FieldNote;
  open: boolean;
  onClose: () => void;
  onSave: (patch: {
    body: string;
    visibility: QuadPostVisibility;
    locationId: string | null;
    locationName: string | null;
  }) => void | Promise<void>;
  saving?: boolean;
  error?: string | null;
}) {
  const [body, setBody] = useState(note.body);
  const [visibility, setVisibility] = useState<QuadPostVisibility>(note.visibility ?? "public");
  const [locationId, setLocationId] = useState<RealmLocationId | "">((note.locationId as RealmLocationId) ?? "");
  const { locations: campusLocations } = useCampusLocations();

  const selectedLocation = campusLocations.find((l) => l.slug === locationId);

  return (
    <CqModalLayer
      open={open}
      onDismiss={onClose}
      dismissible={!saving}
      labelledBy="field-note-edit-title"
      panelAs="form"
      panelClassName="border border-white/15 bg-uri-navy shadow-2xl"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = body.trim();
        if (!trimmed || saving) return;
        void onSave({
          body: trimmed,
          visibility,
          locationId: selectedLocation?.slug ?? null,
          locationName: selectedLocation?.name ?? null,
        });
      }}
    >
      <div className="cq-modal-grabber" aria-hidden />
      <header className="cq-modal-header border-b border-white/10 px-5 pb-3 pt-3 sm:pt-5">
        <h2 id="field-note-edit-title" className="font-display text-lg font-bold text-white">
          Edit Post
        </h2>
        <p className="mt-1 text-xs text-white/45">Update your caption, visibility, or map location. Media stays attached.</p>
      </header>

      <div className="cq-modal-body space-y-3 px-5 py-4">
        <div>
          <span className="mb-1.5 block text-xs text-white/60">Post to</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setVisibility("public")}
              className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                visibility === "public"
                  ? "border-uri-keaney/50 bg-uri-keaney/25 text-uri-keaney"
                  : "border-white/15 bg-white/5 text-white/70"
              }`}
            >
              Public Quad
            </button>
            <button
              type="button"
              onClick={() => setVisibility("friends")}
              className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                visibility === "friends"
                  ? "border-uri-keaney/50 bg-uri-keaney/25 text-uri-keaney"
                  : "border-white/15 bg-white/5 text-white/70"
              }`}
            >
              Following only
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="edit-field-note-location" className="mb-1 block text-xs text-white/60">
            Add to Realm Map
          </label>
          <select
            id="edit-field-note-location"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value as RealmLocationId | "")}
            className="w-full rounded-xl border border-white/15 bg-white/[0.08] px-3 py-2.5 text-base text-white focus:border-uri-keaney/40 focus:outline-none focus:ring-2 focus:ring-uri-keaney/40 sm:text-sm"
          >
            <option value="">No location</option>
            {campusLocations.map((loc) => (
              <option key={loc.slug} value={loc.slug}>
                {loc.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="edit-field-note-body" className="sr-only">
            Caption
          </label>
          <textarea
            id="edit-field-note-body"
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, FIELD_NOTE_MAX_CHARS))}
            rows={4}
            className="w-full resize-none rounded-xl border border-white/15 bg-white/[0.08] px-3 py-2.5 text-base text-white placeholder-white/45 focus:border-uri-keaney/40 focus:outline-none focus:ring-2 focus:ring-uri-keaney/40"
          />
          <p className="mt-1 text-xs text-white/45">{body.length} / {FIELD_NOTE_MAX_CHARS}</p>
        </div>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </div>

      <footer className="cq-modal-footer flex gap-2 border-t border-white/10 px-5 py-3">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="min-h-[44px] flex-1 rounded-xl border border-white/15 py-2.5 text-sm font-medium text-white/75 hover:bg-white/5 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !body.trim()}
          className="min-h-[44px] flex-1 rounded-xl border border-uri-keaney/40 bg-uri-keaney py-2.5 text-sm font-semibold text-white hover:bg-uri-keaney/90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </footer>
    </CqModalLayer>
  );
}
