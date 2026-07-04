"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { FieldNote, QuadPostVisibility } from "@/lib/types";
import { FIELD_NOTE_MAX_CHARS } from "@/lib/types";
import type { RealmLocationId } from "@/lib/realm/locations";
import { useCampusLocations } from "@/lib/client/campusLocationsClient";

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

  if (!open || typeof document === "undefined") return null;

  const selectedLocation = campusLocations.find((l) => l.slug === locationId);

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="field-note-edit-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" aria-hidden />
      <form
        className="relative z-10 w-full max-w-md rounded-2xl border border-white/15 bg-uri-navy p-5 shadow-2xl"
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
        <h2 id="field-note-edit-title" className="font-display text-lg font-bold text-white">
          Edit Post
        </h2>
        <p className="mt-1 text-xs text-white/45">Update your caption, visibility, or map location. Media stays attached.</p>

        <div className="mt-4 space-y-3">
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
              className="w-full rounded-xl border border-white/15 bg-white/[0.08] px-3 py-2.5 text-sm text-white focus:border-uri-keaney/40 focus:outline-none focus:ring-2 focus:ring-uri-keaney/40"
            >
              <option value="">No location</option>
              {campusLocations.map((loc) => (
                <option key={loc.slug} value={loc.slug}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, FIELD_NOTE_MAX_CHARS))}
            rows={4}
            className="w-full resize-none rounded-xl border border-white/15 bg-white/[0.08] px-3 py-2.5 text-white placeholder-white/45 focus:border-uri-keaney/40 focus:outline-none focus:ring-2 focus:ring-uri-keaney/40"
          />
          <p className="text-xs text-white/45">{body.length} / {FIELD_NOTE_MAX_CHARS}</p>
        </div>

        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-xl border border-white/15 py-2.5 text-sm font-medium text-white/75 hover:bg-white/5 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !body.trim()}
            className="flex-1 rounded-xl border border-uri-keaney/40 bg-uri-keaney py-2.5 text-sm font-semibold text-white hover:bg-uri-keaney/90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
