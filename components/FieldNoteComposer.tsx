"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { normalizeRamMarkTag, prependRemoteQuadPost } from "@/lib/feedStore";
import { createQuadPostRequest } from "@/lib/client/quadPostsClient";
import { ApiRequestError } from "@/lib/client/dashboardApi";
import type { Character } from "@/lib/types";
import type { QuadPostVisibility } from "@/lib/types";
import { FIELD_NOTE_MAX_CHARS, RAMMARK_MAX_LENGTH, RAMMARK_MAX_PER_POST } from "@/lib/types";
import type { RamMark } from "@/lib/types";
import type { RealmLocationId } from "@/lib/realm/locations";
import { REALM_LOCATION_OPTIONS } from "@/lib/realm/locations";

export function FieldNoteComposer({
  character,
  onPosted,
  defaultVisibility = "public",
  initialBody = "",
  autoOpenPhotoPicker = false,
}: {
  character: Character;
  onPosted: () => void;
  /** Default selected feed when opening composer (e.g. current tab). */
  defaultVisibility?: QuadPostVisibility;
  initialBody?: string;
  autoOpenPhotoPicker?: boolean;
}) {
  const [body, setBody] = useState(initialBody);
  const [ramMarkInput, setRamMarkInput] = useState("");
  const [ramMarks, setRamMarks] = useState<RamMark[]>([]);
  const [proofUrl, setProofUrl] = useState("");
  const [visibility, setVisibility] = useState<QuadPostVisibility>(defaultVisibility);
  const [locationId, setLocationId] = useState<RealmLocationId | "">("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const proofFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoOpenPhotoPicker) return undefined;
    const tid = window.setTimeout(() => proofFileRef.current?.click(), 150);
    return () => window.clearTimeout(tid);
  }, [autoOpenPhotoPicker]);

  const bodyCount = body.length;
  const canAddRamMark = ramMarks.length < RAMMARK_MAX_PER_POST && ramMarkInput.trim().length > 0 &&
    normalizeRamMarkTag(ramMarkInput).length <= RAMMARK_MAX_LENGTH;

  const addRamMark = useCallback(() => {
    const tag = normalizeRamMarkTag(ramMarkInput).slice(0, RAMMARK_MAX_LENGTH);
    if (!tag || ramMarks.length >= RAMMARK_MAX_PER_POST) return;
    if (ramMarks.some((r) => r.tag === tag)) {
      setRamMarkInput("");
      return;
    }
    setRamMarks((prev) => [...prev, { id: `rm-${Date.now()}-${tag}`, tag }]);
    setRamMarkInput("");
  }, [ramMarkInput, ramMarks]);

  const removeRamMark = useCallback((tag: string) => {
    setRamMarks((prev) => prev.filter((r) => r.tag !== tag));
  }, []);

  function handleProofFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file (e.g. JPEG, PNG).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setProofUrl(reader.result as string);
      setError(null);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = body.trim();
    if (!trimmed) {
      setError("Write something for your post.");
      return;
    }
    if (trimmed.length > FIELD_NOTE_MAX_CHARS) {
      setError(`Keep it under ${FIELD_NOTE_MAX_CHARS} characters.`);
      return;
    }
    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);
    try {
      const selectedLocation = REALM_LOCATION_OPTIONS.find((l) => l.id === locationId);
      const { note, realmMoment } = await createQuadPostRequest(
        {
          body: trimmed,
          proofUrl: proofUrl.trim() || undefined,
          visibility,
          ramMarks,
          authorStreakDays: character.streakDays ?? 0,
          ...(selectedLocation
            ? { locationId: selectedLocation.id, locationName: selectedLocation.name }
            : {}),
        },
        character.id,
      );
      prependRemoteQuadPost(note);
      setBody("");
      setRamMarks([]);
      setProofUrl("");
      setLocationId("");
      if (realmMoment) {
        setSuccessMessage(`Posted to Quad and added to ${realmMoment.locationName} Moments.`);
      } else {
        setSuccessMessage("Posted to Quad.");
      }
      onPosted();
    } catch (err) {
      console.error("[cq][quad-post] submit failed", {
        message: err instanceof Error ? err.message : String(err),
        code: err instanceof ApiRequestError ? err.code : undefined,
        status: err instanceof ApiRequestError ? err.status : undefined,
        details: err instanceof ApiRequestError ? err.details : undefined,
      });
      const detail =
        err instanceof ApiRequestError && err.message.trim().length > 0
          ? err.message
          : err instanceof Error && err.message.trim().length > 0
            ? err.message
            : null;
      setError(
        detail && process.env.NODE_ENV !== "production"
          ? detail
          : "Could not post right now. Check your connection and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="cq-composer space-y-3">
      <div>
        <span className="cq-composer-label">Post to</span>
        <div className="cq-composer-segment">
          <button
            type="button"
            onClick={() => setVisibility("public")}
            className={`cq-composer-segment-btn ${visibility === "public" ? "cq-composer-segment-btn--active" : ""}`}
          >
            🌐 Public Quad
          </button>
          <button
            type="button"
            onClick={() => setVisibility("friends")}
            className={`cq-composer-segment-btn ${visibility === "friends" ? "cq-composer-segment-btn--active" : ""}`}
          >
            👥 Following only
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="field-note-location" className="cq-composer-label">
          Add to Realm Map
        </label>
        <select
          id="field-note-location"
          value={locationId}
          onChange={(e) => setLocationId(e.target.value as RealmLocationId | "")}
          className="cq-composer-select"
        >
          <option value="">No location</option>
          {REALM_LOCATION_OPTIONS.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>
        <p className="cq-composer-hint">
          Public posts with a location appear as Realm Moments for 24 hours.
        </p>
      </div>

      <div>
        <label htmlFor="field-note-body" className="cq-composer-label">
          Caption
        </label>
        <textarea
          id="field-note-body"
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, FIELD_NOTE_MAX_CHARS))}
          placeholder="What's happening on campus?"
          rows={3}
          className="cq-composer-textarea"
        />
        <div className="mt-1.5 flex items-center justify-between">
          <span
            className={`cq-composer-counter ${bodyCount > FIELD_NOTE_MAX_CHARS ? "cq-composer-counter--over" : ""}`}
          >
            {bodyCount} / {FIELD_NOTE_MAX_CHARS}
          </span>
        </div>
      </div>

      <div>
        <label htmlFor="field-note-proof-url" className="cq-composer-label">
          Proof photo (optional)
        </label>
        <input
          id="field-note-proof-url"
          type="url"
          value={proofUrl.startsWith("data:") ? "" : proofUrl}
          onChange={(e) => setProofUrl(e.target.value)}
          placeholder="Paste image URL or add from device"
          className="cq-composer-input"
        />
        <input
          ref={proofFileRef}
          type="file"
          accept="image/*"
          onChange={handleProofFileChange}
          className="hidden"
          aria-label="Add photo from device or open camera to scan QR code"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => proofFileRef.current?.click()} className="cq-composer-btn-accent">
            📷 Add photo from device
          </button>
          <button type="button" onClick={() => proofFileRef.current?.click()} className="cq-composer-btn-secondary">
            📱 Open camera to scan QR code
          </button>
        </div>
        {proofUrl.startsWith("data:") && (
          <div className="mt-2 max-w-[180px] overflow-hidden rounded-xl border border-white/15">
            <img src={proofUrl} alt="Proof" className="h-20 w-full object-cover" />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="cq-composer-label mb-0">RAMarks (optional):</span>
        {ramMarks.map((r) => (
          <span key={r.id} className="ram-mark flex items-center gap-1">
            #{r.tag}
            <button
              type="button"
              onClick={() => removeRamMark(r.tag)}
              className="cq-composer-rammark-remove"
              aria-label={`Remove ${r.tag}`}
            >
              ×
            </button>
          </span>
        ))}
        {ramMarks.length < RAMMARK_MAX_PER_POST && (
          <>
            <input
              type="text"
              value={ramMarkInput}
              onChange={(e) => setRamMarkInput(e.target.value.slice(0, RAMMARK_MAX_LENGTH))}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRamMark())}
              placeholder={`#tag (max ${RAMMARK_MAX_LENGTH})`}
              className="cq-composer-input w-28 py-1 text-xs"
            />
            <button type="button" onClick={addRamMark} disabled={!canAddRamMark} className="cq-composer-btn-add">
              Add
            </button>
          </>
        )}
      </div>

      {successMessage ? <p className="cq-composer-success">{successMessage}</p> : null}
      {error ? <p className="cq-composer-error">{error}</p> : null}

      <button type="submit" disabled={!body.trim() || isSubmitting} className="cq-composer-btn-submit">
        {isSubmitting ? "Posting…" : visibility === "public" ? "Post to Public Quad" : "Post to Following only"}
      </button>
    </form>
  );
}
