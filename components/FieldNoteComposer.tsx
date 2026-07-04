"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Camera,
  Image as ImageIcon,
  Calendar,
  Award,
  ChevronLeft,
  X,
  Heart,
  MapPin,
  MessageCircle,
  Share2,
} from "lucide-react";
import { normalizeRamMarkTag, prependRemoteQuadPost } from "@/lib/feedStore";
import { createQuadPostRequest } from "@/lib/client/quadPostsClient";
import type { QuadPostXpReward } from "@/lib/quadPostXp";
import { readImageFileAsDataUrl } from "@/lib/client/readImageFile";
import { ApiRequestError } from "@/lib/client/dashboardApi";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import type { Character } from "@/lib/types";
import type { QuadPostVisibility } from "@/lib/types";
import { FIELD_NOTE_MAX_CHARS, RAMMARK_MAX_LENGTH, RAMMARK_MAX_PER_POST } from "@/lib/types";
import type { RamMark } from "@/lib/types";
import type { RealmLocationId } from "@/lib/realm/locations";
import { useCampusLocations } from "@/lib/client/campusLocationsClient";

type CaptionStarter = "event" | "achievement";

const CAPTION_PREFIX: Record<CaptionStarter, string> = {
  event: "What's happening on campus: ",
  achievement: "Just unlocked: ",
};

export function FieldNoteComposer({
  character,
  onPosted,
  onXpReward,
  onCancel,
  onBack,
  onDirtyChange,
  defaultVisibility = "public",
  initialBody = "",
  initialImage = "",
  autoOpenPhotoPicker = false,
}: {
  character: Character;
  onPosted: () => void;
  /** Called when the server awards XP for a new post (may be capped or zero). */
  onXpReward?: (reward: QuadPostXpReward) => void;
  /** Hard-close the composer (Cancel / after posting). */
  onCancel?: () => void;
  /** Go back to the previous step (media picker). Renders a Back button. */
  onBack?: () => void;
  /** Report whether the composer holds unsaved content. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Default selected feed when opening composer (e.g. current tab). */
  defaultVisibility?: QuadPostVisibility;
  initialBody?: string;
  /** Pre-selected image (data URL) carried over from the media picker step. */
  initialImage?: string;
  autoOpenPhotoPicker?: boolean;
}) {
  const [body, setBody] = useState(initialBody);
  const [ramMarkInput, setRamMarkInput] = useState("");
  const [ramMarks, setRamMarks] = useState<RamMark[]>([]);
  const [proofUrl, setProofUrl] = useState(initialImage);
  const [visibility, setVisibility] = useState<QuadPostVisibility>(defaultVisibility);
  const [locationId, setLocationId] = useState<RealmLocationId | "">("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const photoFileRef = useRef<HTMLInputElement>(null);
  const cameraFileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const locationSelectRef = useRef<HTMLSelectElement>(null);
  const { locations: campusLocations } = useCampusLocations();

  const openLocationOptions = useCallback(() => {
    setMoreOpen(true);
    window.requestAnimationFrame(() => {
      locationSelectRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      locationSelectRef.current?.focus();
    });
  }, []);

  useEffect(() => {
    if (!autoOpenPhotoPicker) return undefined;
    const tid = window.setTimeout(() => photoFileRef.current?.click(), 150);
    return () => window.clearTimeout(tid);
  }, [autoOpenPhotoPicker]);

  const hasImage = proofUrl.trim().length > 0;
  const bodyCount = body.length;
  const canPost = (body.trim().length > 0 || hasImage) && bodyCount <= FIELD_NOTE_MAX_CHARS;

  const dirty = body.trim().length > 0 || hasImage || ramMarks.length > 0 || locationId !== "";
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const canAddRamMark =
    ramMarks.length < RAMMARK_MAX_PER_POST &&
    ramMarkInput.trim().length > 0 &&
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

  const applyCaptionStarter = useCallback((starter: CaptionStarter) => {
    const prefix = CAPTION_PREFIX[starter];
    setBody((prev) => {
      if (prev.startsWith(prefix)) return prev;
      const next = `${prefix}${prev}`.slice(0, FIELD_NOTE_MAX_CHARS);
      return next;
    });
    window.requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        const end = el.value.length;
        el.setSelectionRange(end, end);
      }
    });
  }, []);

  async function readImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      setProofUrl(dataUrl);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that image.");
    }
  }

  function removeImage() {
    setProofUrl("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = body.trim();
    if (!trimmed && !hasImage) {
      setError("Add a caption or a photo to post.");
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
      const selectedLocation = campusLocations.find((l) => l.slug === locationId);
      const { note, realmMoment, xpReward } = await createQuadPostRequest(
        {
          body: trimmed,
          proofUrl: proofUrl.trim() || undefined,
          visibility,
          ramMarks,
          authorStreakDays: character.streakDays ?? 0,
          ...(selectedLocation
            ? { locationId: selectedLocation.slug, locationName: selectedLocation.name }
            : {}),
        },
        character.id,
      );
      prependRemoteQuadPost(note);
      if (xpReward.awarded && xpReward.xpAmount > 0) {
        onXpReward?.(xpReward);
      }
      setBody("");
      setRamMarks([]);
      setProofUrl("");
      setLocationId("");
      if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      if (realmMoment) {
        setSuccessMessage(`Posted to Quad and added to ${realmMoment.locationName} Moments.`);
      } else {
        setSuccessMessage("Posted to Quad.");
      }
      setPosted(true);
      // Brief success animation before the parent closes/refreshes the feed.
      window.setTimeout(() => onPosted(), 850);
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

  const previewName = character.name || "You";
  const previewUsername = character.username || "you";
  const showPreview = body.trim().length > 0 || hasImage;

  return (
    <form onSubmit={handleSubmit} className="cq-composer-sheet">
      <header className="cq-composer-head">
        {onBack ? (
          <button type="button" onClick={() => onBack()} className="cq-composer-head-cancel cq-composer-head-back">
            <ChevronLeft className="h-5 w-5" strokeWidth={2.4} />
            <span>Back</span>
          </button>
        ) : (
          <button type="button" onClick={() => onCancel?.()} className="cq-composer-head-cancel">
            Cancel
          </button>
        )}
        <span className="cq-composer-head-title">New Post</span>
        <button
          type="submit"
          disabled={!canPost || isSubmitting || posted}
          className={`cq-composer-head-post ${canPost && !isSubmitting && !posted ? "cq-composer-head-post--ready" : ""}`}
        >
          {posted ? "Posted" : isSubmitting ? "Posting…" : "Post"}
        </button>
      </header>

      <div className="cq-composer-scroll">
        <div className="cq-composer-identity">
          <div className="cq-composer-identity-avatar">
            <AvatarDisplay avatar={character.avatar} fitParent size={44} />
          </div>
          <div className="min-w-0">
            <p className="cq-composer-identity-name">{previewName}</p>
            <div className="cq-composer-visibility" role="group" aria-label="Who can see this post">
              <button
                type="button"
                onClick={() => setVisibility("public")}
                className={`cq-composer-visibility-btn ${visibility === "public" ? "cq-composer-visibility-btn--active" : ""}`}
              >
                🌐 Public
              </button>
              <button
                type="button"
                onClick={() => setVisibility("friends")}
                className={`cq-composer-visibility-btn ${visibility === "friends" ? "cq-composer-visibility-btn--active" : ""}`}
              >
                👥 Following
              </button>
            </div>
          </div>
        </div>

        <textarea
          ref={textareaRef}
          id="field-note-body"
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, FIELD_NOTE_MAX_CHARS))}
          placeholder="What's happening on campus?"
          rows={4}
          className="cq-composer-maintext"
          aria-label="Post caption"
          autoFocus
        />

        <div className="cq-composer-meta-row">
          <span className={`cq-composer-counter ${bodyCount > FIELD_NOTE_MAX_CHARS ? "cq-composer-counter--over" : ""}`}>
            {bodyCount} / {FIELD_NOTE_MAX_CHARS}
          </span>
        </div>

        {hasImage ? (
          <div className="cq-composer-image-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={proofUrl} alt="Selected media preview" />
            <button
              type="button"
              onClick={removeImage}
              className="cq-composer-image-remove"
              aria-label="Remove image"
            >
              <X className="h-4 w-4" strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={() => photoFileRef.current?.click()}
              className="cq-composer-image-replace"
            >
              Replace
            </button>
          </div>
        ) : null}

        {/* Hidden inputs reuse existing upload logic */}
        <input
          ref={photoFileRef}
          type="file"
          accept="image/*"
          onChange={readImageFile}
          className="hidden"
          aria-label="Choose photo from library"
        />
        <input
          ref={cameraFileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={readImageFile}
          className="hidden"
          aria-label="Take a photo with the camera"
        />

        <div className="cq-composer-actionbar" role="group" aria-label="Add to your post">
          <button
            type="button"
            onClick={() => cameraFileRef.current?.click()}
            className="cq-composer-action"
            aria-label="Open camera"
          >
            <Camera className="h-[20px] w-[20px]" strokeWidth={2} />
            <span>Camera</span>
          </button>
          <button
            type="button"
            onClick={() => photoFileRef.current?.click()}
            className="cq-composer-action"
            aria-label="Add photo from library"
          >
            <ImageIcon className="h-[20px] w-[20px]" strokeWidth={2} />
            <span>Photo</span>
          </button>
          <button
            type="button"
            onClick={openLocationOptions}
            className={`cq-composer-action cq-composer-action--pill ${locationId ? "cq-composer-action--on" : ""}`}
            aria-label="Add a location"
          >
            <MapPin className="h-[18px] w-[18px]" strokeWidth={2} />
            <span>Location</span>
          </button>
          <button
            type="button"
            onClick={() => applyCaptionStarter("achievement")}
            className="cq-composer-action cq-composer-action--pill"
            aria-label="Start an achievement post"
          >
            <Award className="h-[18px] w-[18px]" strokeWidth={2} />
            <span>Achievement</span>
          </button>
          <button
            type="button"
            onClick={() => applyCaptionStarter("event")}
            className="cq-composer-action cq-composer-action--pill"
            aria-label="Start an event post"
          >
            <Calendar className="h-[18px] w-[18px]" strokeWidth={2} />
            <span>Event</span>
          </button>
        </div>

        <div className="cq-composer-more">
          <button
            type="button"
            className="cq-composer-more-summary"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((v) => !v)}
          >
            More options
          </button>
          {moreOpen ? (
          <div className="cq-composer-more-body">
            <label htmlFor="field-note-location" className="cq-composer-label">
              Add to Realm Map
            </label>
            <select
              ref={locationSelectRef}
              id="field-note-location"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value as RealmLocationId | "")}
              className="cq-composer-select"
            >
              <option value="">No location</option>
              {campusLocations.map((loc) => (
                <option key={loc.slug} value={loc.slug}>
                  {loc.name}
                </option>
              ))}
            </select>
            <p className="cq-composer-hint">Public posts with a location appear as Realm Moments for 24 hours.</p>

            <div className="cq-composer-rammarks">
              <span className="cq-composer-label mb-0">RAMarks</span>
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
                    className="cq-composer-input w-28 py-1"
                    aria-label="Add a RAMark tag"
                  />
                  <button type="button" onClick={addRamMark} disabled={!canAddRamMark} className="cq-composer-btn-add">
                    Add
                  </button>
                </>
              )}
            </div>
          </div>
          ) : null}
        </div>

        {showPreview ? (
          <div className="cq-composer-preview" aria-label="Post preview">
            <span className="cq-composer-preview-tag">Preview</span>
            <div className="cq-composer-preview-card">
              <div className="cq-composer-preview-head">
                <div className="cq-composer-preview-avatar">
                  <AvatarDisplay avatar={character.avatar} fitParent size={36} />
                </div>
                <div className="min-w-0">
                  <p className="cq-composer-preview-name">{previewName}</p>
                  <p className="cq-composer-preview-sub">@{previewUsername} · now</p>
                </div>
              </div>
              {body.trim() ? <p className="cq-composer-preview-body">{body.trim()}</p> : null}
              {hasImage ? (
                <div className="cq-composer-preview-media">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={proofUrl} alt="Post media preview" />
                </div>
              ) : null}
              {ramMarks.length > 0 ? (
                <div className="cq-composer-preview-tags">
                  {ramMarks.map((r) => (
                    <span key={r.id}>#{r.tag}</span>
                  ))}
                </div>
              ) : null}
              <div className="cq-composer-preview-actions" aria-hidden>
                <span>
                  <Heart className="h-[18px] w-[18px]" strokeWidth={2} /> Like
                </span>
                <span>
                  <MessageCircle className="h-[18px] w-[18px]" strokeWidth={2} /> Comment
                </span>
                <span>
                  <Share2 className="h-[18px] w-[18px]" strokeWidth={2} /> Share
                </span>
              </div>
            </div>
          </div>
        ) : null}

        {successMessage && !posted ? <p className="cq-composer-success">{successMessage}</p> : null}
        {error ? <p className="cq-composer-error" role="alert">{error}</p> : null}
      </div>

      {posted ? (
        <div className="cq-composer-success-overlay" role="status" aria-live="polite">
          <div className="cq-composer-success-burst" aria-hidden />
          <div className="cq-composer-success-check" aria-hidden>
            <svg viewBox="0 0 52 52" className="h-16 w-16">
              <circle className="cq-success-ring" cx="26" cy="26" r="23" fill="none" strokeWidth="3" />
              <path className="cq-success-tick" fill="none" strokeWidth="4" d="M14 27 l8 8 l16 -18" />
            </svg>
          </div>
          <p className="cq-composer-success-text">{successMessage ?? "Posted to Quad."}</p>
        </div>
      ) : null}
    </form>
  );
}
