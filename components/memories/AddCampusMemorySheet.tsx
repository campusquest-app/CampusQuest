"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, ChevronLeft, ImagePlus, MapPin, X } from "lucide-react";
import { CAMPUS_LOCATION_OPTIONS, type CampusLocationKey } from "@/lib/campusLocations";
import { readImageFileAsDataUrl } from "@/lib/client/readImageFile";
import {
  createCampusMemory,
  uploadCampusMemoryMedia,
} from "@/lib/client/campusMemoriesClient";

export function AddCampusMemorySheet({
  defaultLocationKey = "quad",
  onClose,
  onCreated,
}: {
  defaultLocationKey?: CampusLocationKey;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [locationKey, setLocationKey] = useState<CampusLocationKey>(defaultLocationKey);
  const [body, setBody] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      setImageDataUrl(dataUrl);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that image.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const trimmed = body.trim();
    if (!trimmed && !imageDataUrl) {
      setError("Add text or a photo for your Memory.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      let mediaUrl: string | null = null;
      let mediaType: "text" | "image" = "text";
      if (imageDataUrl) {
        mediaUrl = await uploadCampusMemoryMedia(imageDataUrl);
        mediaType = "image";
      }
      await createCampusMemory({
        locationKey,
        mediaType,
        mediaUrl,
        body: trimmed || null,
        visibility: "public",
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post Memory.");
    } finally {
      setSubmitting(false);
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="cq-memory-add" role="dialog" aria-modal="true" aria-label="Add campus Memory">
      <header className="cq-composer-head">
        <button type="button" onClick={onClose} className="cq-composer-head-back cq-composer-head-cancel">
          <ChevronLeft className="h-5 w-5" strokeWidth={2.4} />
          <span>Cancel</span>
        </button>
        <span className="cq-composer-head-title">Add Memory</span>
        <button
          type="submit"
          form="cq-memory-add-form"
          disabled={submitting}
          className={`cq-composer-head-post${body.trim() || imageDataUrl ? " cq-composer-head-post--ready" : ""}`}
        >
          {submitting ? "Posting…" : "Post"}
        </button>
      </header>

      <form id="cq-memory-add-form" className="cq-memory-add-body" onSubmit={(e) => void handleSubmit(e)}>
        <label className="cq-memory-add-field">
          <span className="cq-memory-add-label">
            <MapPin className="h-4 w-4" strokeWidth={2.2} aria-hidden />
            Location
          </span>
          <select
            value={locationKey}
            onChange={(e) => setLocationKey(e.target.value as CampusLocationKey)}
            className="cq-memory-add-select"
          >
            {CAMPUS_LOCATION_OPTIONS.filter((o) => o.value !== "other").map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
            <option value="other">Nearby / Other</option>
          </select>
        </label>

        <label className="cq-memory-add-field">
          <span className="cq-memory-add-label">Caption</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 500))}
            placeholder="What's happening on campus?"
            rows={4}
            className="cq-memory-add-textarea"
          />
        </label>

        {imageDataUrl ? (
          <div className="cq-memory-add-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageDataUrl} alt="Memory preview" />
            <button type="button" className="cq-composer-image-remove" onClick={() => setImageDataUrl("")} aria-label="Remove image">
              <X className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
        ) : (
          <div className="cq-memory-add-media-actions">
            <button type="button" onClick={() => cameraRef.current?.click()} className="cq-memory-add-media-btn">
              <Camera className="h-5 w-5" strokeWidth={2} />
              <span>Camera</span>
            </button>
            <button type="button" onClick={() => photoRef.current?.click()} className="cq-memory-add-media-btn">
              <ImagePlus className="h-5 w-5" strokeWidth={2} />
              <span>Photos</span>
            </button>
          </div>
        )}

        <input ref={photoRef} type="file" accept="image/*" className="sr-only" onChange={(e) => void handleFile(e)} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void handleFile(e)} />

        {error ? <p className="cq-memory-add-error">{error}</p> : null}
        <p className="cq-memory-add-hint">Memories stay live for 24 hours. Save to profile to keep them later.</p>
      </form>
    </div>,
    document.body,
  );
}
