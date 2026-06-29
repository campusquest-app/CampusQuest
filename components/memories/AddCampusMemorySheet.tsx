"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, ChevronLeft, ImagePlus, MapPin, X } from "lucide-react";
import { CAMPUS_MEMORY_LOCATION_OPTIONS } from "@/lib/locations/registry";
import type { CampusLocationId } from "@/lib/locations/registry";
import { isAcceptedImageType, ImageCompressionError } from "@/lib/client/imageCompression";
import { createCampusMemory, uploadCampusMemoryImage } from "@/lib/client/campusMemoriesClient";

const IS_DEV = process.env.NODE_ENV !== "production";
const ACCEPT_ATTR = "image/jpeg,image/png,image/webp";

export function AddCampusMemorySheet({
  defaultLocationId = "the-quad",
  onClose,
  onCreated,
}: {
  defaultLocationId?: CampusLocationId;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [locationId, setLocationId] = useState<CampusLocationId>(defaultLocationId);
  const [body, setBody] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  function clearImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview("");
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!isAcceptedImageType(file)) {
      setError("Please choose a JPG, PNG, or WebP image.");
      return;
    }
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const trimmed = body.trim();
    if (!trimmed && !imageFile) {
      setError("Add text or a photo for your Memory.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      let mediaUrl: string | null = null;
      let mediaType: "text" | "image" = "text";
      if (imageFile) {
        setUploadProgress(0);
        mediaUrl = await uploadCampusMemoryImage(imageFile, (fraction) => setUploadProgress(fraction));
        mediaType = "image";
      }
      await createCampusMemory({
        locationId,
        mediaType,
        mediaUrl,
        body: trimmed || null,
        visibility: "public",
      });
      onCreated();
      onClose();
    } catch (err) {
      if (IS_DEV) console.error("[cq][memory-create]", err);
      if (err instanceof ImageCompressionError) {
        setError(err.message);
      } else if (imageFile) {
        setError("Couldn't upload your photo. Please try again.");
      } else {
        setError(err instanceof Error ? err.message : "Could not post Memory.");
      }
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  }

  if (typeof document === "undefined") return null;

  const hasContent = Boolean(body.trim() || imageFile);
  const progressPct = uploadProgress != null ? Math.round(uploadProgress * 100) : null;
  const postLabel = submitting
    ? progressPct != null
      ? `Uploading ${progressPct}%`
      : "Posting…"
    : "Post";

  return createPortal(
    <div className="cq-memory-add" role="dialog" aria-modal="true" aria-label="Add campus Memory">
      <header className="cq-composer-head">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="cq-composer-head-back cq-composer-head-cancel"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2.4} />
          <span>Cancel</span>
        </button>
        <span className="cq-composer-head-title">Capture a Campus Memory</span>
        <button
          type="submit"
          form="cq-memory-add-form"
          disabled={submitting || !hasContent}
          className={`cq-composer-head-post${hasContent ? " cq-composer-head-post--ready" : ""}`}
        >
          {postLabel}
        </button>
      </header>

      <form id="cq-memory-add-form" className="cq-memory-add-body" onSubmit={(e) => void handleSubmit(e)}>
        <label className="cq-memory-add-field">
          <span className="cq-memory-add-label">
            <MapPin className="h-4 w-4" strokeWidth={2.2} aria-hidden />
            Location
          </span>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value as CampusLocationId)}
            disabled={submitting}
            className="cq-memory-add-select"
          >
            {CAMPUS_MEMORY_LOCATION_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.name}
              </option>
            ))}
          </select>
        </label>

        <label className="cq-memory-add-field">
          <span className="cq-memory-add-label">Caption</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 500))}
            placeholder="What's happening on campus?"
            rows={4}
            disabled={submitting}
            className="cq-memory-add-textarea"
          />
        </label>

        {imagePreview ? (
          <div className="cq-memory-add-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePreview} alt="Memory preview" />
            {!submitting ? (
              <button
                type="button"
                className="cq-composer-image-remove"
                onClick={clearImage}
                aria-label="Remove image"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            ) : null}
            {submitting && uploadProgress != null ? (
              <div className="cq-memory-add-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPct ?? 0}>
                <span className="cq-memory-add-progress-bar" style={{ width: `${progressPct ?? 0}%` }} />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="cq-memory-add-media-actions">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={submitting}
              className="cq-memory-add-media-btn"
            >
              <Camera className="h-5 w-5" strokeWidth={2} />
              <span>Camera</span>
            </button>
            <button
              type="button"
              onClick={() => photoRef.current?.click()}
              disabled={submitting}
              className="cq-memory-add-media-btn"
            >
              <ImagePlus className="h-5 w-5" strokeWidth={2} />
              <span>Photos</span>
            </button>
          </div>
        )}

        <input ref={photoRef} type="file" accept={ACCEPT_ATTR} className="sr-only" onChange={handleFile} />
        <input ref={cameraRef} type="file" accept={ACCEPT_ATTR} capture="environment" className="sr-only" onChange={handleFile} />

        {error ? <p className="cq-memory-add-error">{error}</p> : null}
        <p className="cq-memory-add-hint">Memories stay live for 24 hours. Save to your Memory Archive to keep them.</p>
      </form>
    </div>,
    document.body,
  );
}
