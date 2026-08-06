"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Camera,
  Image as ImageIcon,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  X,
  Heart,
  MapPin,
  MessageCircle,
  Share2,
  Tag,
} from "lucide-react";
import { normalizeRamMarkTag, prependRemoteQuadPost } from "@/lib/feedStore";
import { createQuadPostRequest } from "@/lib/client/quadPostsClient";
import type { QuadPostXpReward } from "@/lib/quadPostXp";
import { ApiRequestError } from "@/lib/client/dashboardApi";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import type { Character } from "@/lib/types";
import type { QuadPostVisibility } from "@/lib/types";
import { FIELD_NOTE_MAX_CHARS, RAMMARK_MAX_LENGTH, RAMMARK_MAX_PER_POST } from "@/lib/types";
import type { RamMark } from "@/lib/types";
import type { RealmLocationId } from "@/lib/realm/locations";
import { useCampusLocations } from "@/lib/client/campusLocationsClient";
import { TagPickerSheet } from "@/components/quad/TagPickerSheet";
import { MentionAutocomplete } from "@/components/quad/MentionAutocomplete";
import { PhotoTagEditor } from "@/components/quad/PhotoTagEditor";
import {
  detectActiveMention,
  insertMentionAtCursor,
  tagEntityKey,
  type CaptionMentionDraft,
  type ComposerTagSelection,
  type PhotoTagDraft,
} from "@/lib/postTags";
import type { TagSearchResult } from "@/lib/client/tagSearchClient";
import {
  allCarouselItemsReady,
  createCarouselItemFromFile,
  filterNewFiles,
  overallUploadProgress,
  revokeCarouselItem,
  runCarouselUploadQueue,
  toPublishMediaItems,
  type ComposerCarouselItem,
} from "@/lib/client/quadMediaUploadQueue";
import { ComposerCarouselEditor } from "@/components/posts/ComposerCarouselEditor";
import { isAllowedImageMime, isAllowedVideoMime } from "@/lib/quadMedia";
import { probeVideoFile } from "@/lib/client/probeVideoFile";

function seedCarouselItems(args: {
  initialCarousel?: { items: ComposerCarouselItem[]; coverClientId: string | null } | null;
  initialImage?: string;
  initialVideo?: { file: File; previewUrl: string; durationSeconds: number } | null;
}): { items: ComposerCarouselItem[]; coverClientId: string | null } {
  if (args.initialCarousel?.items?.length) {
    return {
      items: args.initialCarousel.items.map((i) => ({ ...i, stage: i.stage === "ready" ? "ready" : "waiting" })),
      coverClientId: args.initialCarousel.coverClientId,
    };
  }
  if (args.initialVideo) {
    const item = createCarouselItemFromFile(args.initialVideo.file, "video");
    revokeCarouselItem(item);
    item.previewUrl = args.initialVideo.previewUrl;
    item.durationSeconds = args.initialVideo.durationSeconds;
    return { items: [item], coverClientId: item.clientId };
  }
  if (args.initialImage?.startsWith("data:image/")) {
    // Convert data URL to a File for the upload queue.
    const blob = dataUrlToBlob(args.initialImage);
    const file = new File([blob], "photo.jpg", { type: blob.type || "image/jpeg" });
    const item = createCarouselItemFromFile(file, "image");
    return { items: [item], coverClientId: item.clientId };
  }
  return { items: [], coverClientId: null };
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(",");
  const mime = /data:(.*?);/.exec(header ?? "")?.[1] || "image/jpeg";
  const binary = atob(data ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

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
  initialVideo = null,
  initialCarousel = null,
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
  /** Pre-selected video from media picker (not uploaded yet). */
  initialVideo?: { file: File; previewUrl: string; durationSeconds: number } | null;
  /** Multi-media carousel from the picker step. */
  initialCarousel?: { items: ComposerCarouselItem[]; coverClientId: string | null } | null;
  autoOpenPhotoPicker?: boolean;
}) {
  const seeded = seedCarouselItems({ initialCarousel, initialImage, initialVideo });
  const [body, setBody] = useState(initialBody);
  const [ramMarkInput, setRamMarkInput] = useState("");
  const [ramMarks, setRamMarks] = useState<RamMark[]>([]);
  const [carouselItems, setCarouselItems] = useState<ComposerCarouselItem[]>(seeded.items);
  const [coverClientId, setCoverClientId] = useState<string | null>(seeded.coverClientId);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [previewMuted, setPreviewMuted] = useState(true);
  const itemsRef = useRef(carouselItems);
  itemsRef.current = carouselItems;
  const postingLockRef = useRef(false);
  const publishKeyRef = useRef(`pub-${crypto.randomUUID()}`);
  const [visibility, setVisibility] = useState<QuadPostVisibility>(defaultVisibility);
  const [locationId, setLocationId] = useState<RealmLocationId | "">("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [composerTags, setComposerTags] = useState<ComposerTagSelection[]>([]);
  const [photoTags, setPhotoTags] = useState<PhotoTagDraft[]>([]);
  const [captionMentions, setCaptionMentions] = useState<CaptionMentionDraft[]>([]);
  const [tagSheetOpen, setTagSheetOpen] = useState(false);
  const [photoTagEditorOpen, setPhotoTagEditorOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
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

  const hasMedia = carouselItems.length > 0;
  const mediaReady = !hasMedia || allCarouselItemsReady(carouselItems);
  const bodyCount = body.length;
  const canPost =
    (body.trim().length > 0 || (hasMedia && mediaReady)) &&
    bodyCount <= FIELD_NOTE_MAX_CHARS &&
    !isSubmitting &&
    !(hasMedia && !mediaReady);

  const dirty =
    body.trim().length > 0 ||
    hasMedia ||
    ramMarks.length > 0 ||
    locationId !== "" ||
    composerTags.length > 0 ||
    photoTags.length > 0;

  useEffect(() => {
    const waiting = carouselItems.some((i) => i.stage === "waiting");
    if (!waiting) return;
    void runCarouselUploadQueue(carouselItems, (clientId, next) => {
      setCarouselItems((prev) => prev.map((item) => (item.clientId === clientId ? next : item)));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carouselItems.map((i) => `${i.clientId}:${i.stage}`).join("|")]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    return () => {
      // Revoke previews when composer unmounts after discard/post.
      for (const item of itemsRef.current) {
        if (item.stage !== "ready") revokeCarouselItem(item);
      }
    };
  }, []);

  function syncMentionQuery(text: string, nextCursor: number) {
    const active = detectActiveMention(text, nextCursor);
    setMentionQuery(active ? active.query : null);
  }

  function handleSelectMention(hit: TagSearchResult) {
    const token =
      hit.entityType === "user" ? hit.mentionSlug : hit.mentionSlug || hit.displayLabel.replace(/\s+/g, "_");
    const inserted = insertMentionAtCursor({
      text: body,
      cursor,
      mentionText: token,
    });
    if (!inserted) return;
    setBody(inserted.text);
    setCursor(inserted.cursor);
    setCaptionMentions((prev) => {
      const next = prev.filter((m) => !(m.startIndex === inserted.start && m.endIndex === inserted.end));
      next.push({
        entityType: hit.entityType,
        entityId: hit.entityId,
        displayText: inserted.text.slice(inserted.start, inserted.end),
        startIndex: inserted.start,
        endIndex: inserted.end,
      });
      return next;
    });
    setMentionQuery(null);
    window.requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(inserted.cursor, inserted.cursor);
    });
  }

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

  async function appendComposerFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const { accepted, rejectedReason } = filterNewFiles(carouselItems, Array.from(fileList));
    if (rejectedReason && accepted.length === 0) {
      setError(rejectedReason);
      return;
    }
    setError(rejectedReason ?? null);
    const next: ComposerCarouselItem[] = [];
    for (const file of accepted) {
      const isVideo = file.type.startsWith("video/") || isAllowedVideoMime(file.type);
      if (isVideo) {
        try {
          const probed = await probeVideoFile(file);
          const item = createCarouselItemFromFile(probed.file, "video");
          revokeCarouselItem(item);
          item.previewUrl = probed.objectUrl;
          item.durationSeconds = probed.durationSeconds;
          next.push(item);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not read that video.");
        }
      } else if (file.type.startsWith("image/") || isAllowedImageMime(file.type)) {
        next.push(createCarouselItemFromFile(file, "image"));
      }
    }
    if (!next.length) return;
    setCarouselItems((prev) => {
      const merged = [...prev, ...next];
      if (!coverClientId) setCoverClientId(merged[0]?.clientId ?? null);
      setActiveMediaIndex(merged.length - 1);
      return merged;
    });
  }

  function removeCarouselItem(clientId: string) {
    setCarouselItems((prev) => {
      const target = prev.find((i) => i.clientId === clientId);
      if (target) revokeCarouselItem(target);
      const next = prev.filter((i) => i.clientId !== clientId);
      if (coverClientId === clientId) setCoverClientId(next[0]?.clientId ?? null);
      setPhotoTags((tags) => tags.filter((t) => t.mediaKey !== clientId && t.mediaKey !== target?.mediaId));
      setActiveMediaIndex((idx) => Math.max(0, Math.min(idx, next.length - 1)));
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (postingLockRef.current) return;
    setError(null);
    const trimmed = body.trim();
    if (!trimmed && !hasMedia) {
      setError("Add a caption, photo, or video to post.");
      return;
    }
    if (hasMedia && !mediaReady) {
      setError("Wait for all photos and videos to finish uploading.");
      return;
    }
    if (trimmed.length > FIELD_NOTE_MAX_CHARS) {
      setError(`Keep it under ${FIELD_NOTE_MAX_CHARS} characters.`);
      return;
    }
    setError(null);
    setSuccessMessage(null);
    postingLockRef.current = true;
    setIsSubmitting(true);
    try {
      const selectedLocation = campusLocations.find((l) => l.slug === locationId);
      const published = hasMedia ? toPublishMediaItems(carouselItems) : [];
      const cover =
        published.find((m) => m.clientId === coverClientId) ?? published[0] ?? null;
      const { note, realmMoment, xpReward } = await createQuadPostRequest(
        {
          body: trimmed,
          proofUrl: cover?.playbackUrl,
          mediaType: cover ? cover.mediaType : "none",
          mediaItems:
            published.length > 0
              ? published.map((m) => ({ mediaId: m.mediaId, sortOrder: m.sortOrder }))
              : undefined,
          coverMediaId: cover?.mediaId,
          publishIdempotencyKey: publishKeyRef.current,
          mediaId: published.length === 1 ? published[0]!.mediaId : undefined,
          posterUrl: cover?.mediaType === "video" ? cover.thumbnailUrl ?? undefined : undefined,
          visibility,
          ramMarks,
          authorStreakDays: character.streakDays ?? 0,
          ...(selectedLocation
            ? { locationId: selectedLocation.slug, locationName: selectedLocation.name }
            : {}),
          tags: composerTags.map((t) => ({
            entityType: t.entityType,
            entityId: t.entityId,
            displayLabel: t.displayLabel,
            subtitle: t.subtitle ?? null,
            mentionSlug: t.mentionSlug ?? null,
          })),
          photoTags: !hasMedia
            ? []
            : photoTags.map((t) => {
                const resolved =
                  published.find((p) => p.clientId === t.mediaKey || p.mediaId === t.mediaKey)?.mediaId ||
                  t.mediaKey ||
                  "primary";
                return {
                  entityType: t.entityType,
                  entityId: t.entityId,
                  mediaKey: resolved,
                  positionX: t.positionX,
                  positionY: t.positionY,
                  displayLabel: t.displayLabel,
                };
              }),
          mentions: captionMentions.map((m) => ({
            entityType: m.entityType,
            entityId: m.entityId,
            displayText: m.displayText,
            startIndex: m.startIndex,
            endIndex: m.endIndex,
          })),
        },
        character.id,
      );
      prependRemoteQuadPost(note);
      if (xpReward.awarded && xpReward.xpAmount > 0) {
        onXpReward?.(xpReward);
      }
      setBody("");
      setRamMarks([]);
      setCarouselItems([]);
      setCoverClientId(null);
      setLocationId("");
      setComposerTags([]);
      setPhotoTags([]);
      setCaptionMentions([]);
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
      postingLockRef.current = false;
    }
  }

  const previewName = character.name || "You";
  const previewUsername = character.username || "you";
  const showPreview = body.trim().length > 0 || hasMedia;
  const uploadPct = overallUploadProgress(carouselItems);

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

        <div className="relative">
          <MentionAutocomplete
            open={mentionQuery != null}
            query={mentionQuery ?? ""}
            onSelect={handleSelectMention}
          />
          <textarea
            ref={textareaRef}
            id="field-note-body"
            value={body}
            onChange={(e) => {
              const next = e.target.value.slice(0, FIELD_NOTE_MAX_CHARS);
              const nextCursor = e.target.selectionStart ?? next.length;
              setBody(next);
              setCursor(nextCursor);
              syncMentionQuery(next, nextCursor);
            }}
            onSelect={(e) => {
              const nextCursor = e.currentTarget.selectionStart ?? 0;
              setCursor(nextCursor);
              syncMentionQuery(body, nextCursor);
            }}
            onKeyUp={(e) => {
              const nextCursor = e.currentTarget.selectionStart ?? 0;
              setCursor(nextCursor);
              syncMentionQuery(body, nextCursor);
            }}
            placeholder="What's happening on campus?"
            rows={4}
            className="cq-composer-maintext"
            aria-label="Post caption"
            autoFocus
          />
        </div>

        <div className="cq-composer-meta-row">
          <span className={`cq-composer-counter ${bodyCount > FIELD_NOTE_MAX_CHARS ? "cq-composer-counter--over" : ""}`}>
            {bodyCount} / {FIELD_NOTE_MAX_CHARS}
          </span>
        </div>

        {hasMedia ? (
          <div className="space-y-2">
            <ComposerCarouselEditor
              items={carouselItems}
              activeIndex={activeMediaIndex}
              coverClientId={coverClientId}
              previewMuted={previewMuted}
              onSelectIndex={setActiveMediaIndex}
              onReorder={(from, to) => {
                setCarouselItems((prev) => {
                  const next = [...prev];
                  const [moved] = next.splice(from, 1);
                  if (!moved) return prev;
                  next.splice(to, 0, moved);
                  return next;
                });
                setActiveMediaIndex(to);
              }}
              onRemove={removeCarouselItem}
              onRetry={(clientId) => {
                setCarouselItems((prev) =>
                  prev.map((i) =>
                    i.clientId === clientId ? { ...i, stage: "waiting", percent: 0, error: undefined } : i,
                  ),
                );
              }}
              onAddMore={(files) => void appendComposerFiles(files)}
              onSetCover={setCoverClientId}
              onTogglePreviewMute={() => setPreviewMuted((m) => !m)}
            />
            {!mediaReady ? (
              <p className="text-center text-[11px] text-white/55">Uploading media… {uploadPct}%</p>
            ) : null}
            {carouselItems[activeMediaIndex]?.kind === "image" ? (
              <button
                type="button"
                onClick={() => setPhotoTagEditorOpen(true)}
                className="min-h-[40px] rounded-full bg-white/10 px-3 text-xs font-semibold text-white"
              >
                Tag photo{photoTags.length ? ` (${photoTags.length})` : ""}
              </button>
            ) : null}
          </div>
        ) : null}

        {composerTags.length > 0 ? (
          <div className="flex flex-wrap gap-2 px-1 pb-1" aria-label="Selected tags">
            {composerTags.map((t) => (
              <button
                key={tagEntityKey(t)}
                type="button"
                onClick={() => setComposerTags((prev) => prev.filter((x) => tagEntityKey(x) !== tagEntityKey(t)))}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-full border border-uri-keaney/40 bg-uri-keaney/15 px-2.5 text-xs text-uri-keaney"
              >
                {t.displayLabel}
                <X className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        ) : null}

        {/* Hidden inputs reuse existing upload logic */}
        <input
          ref={photoFileRef}
          type="file"
          accept="image/*,video/mp4,video/quicktime,video/webm,video/x-m4v"
          multiple
          onChange={(e) => {
            void appendComposerFiles(e.target.files);
            e.target.value = "";
          }}
          className="hidden"
          aria-label="Choose photos or videos from library"
        />
        <input
          ref={cameraFileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            void appendComposerFiles(e.target.files);
            e.target.value = "";
          }}
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
            aria-label="Add photo or video from library"
          >
            <ImageIcon className="h-[20px] w-[20px]" strokeWidth={2} />
            <span>Photo/Video</span>
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
        </div>

        <div className="cq-composer-more">
          <button
            type="button"
            className="cq-composer-more-toggle"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((v) => !v)}
          >
            <span>More options</span>
            <ChevronDown
              className={`cq-composer-more-chevron ${moreOpen ? "cq-composer-more-chevron--open" : ""}`}
              strokeWidth={2.4}
              aria-hidden
            />
          </button>
          <div
            className={`cq-composer-more-panel ${moreOpen ? "cq-composer-more-panel--open" : ""}`}
            aria-hidden={!moreOpen}
          >
            <div className="cq-composer-more-panel-inner">
              <div className="cq-composer-more-body">
                <button
                  type="button"
                  className="mb-3 flex w-full min-h-[48px] items-center justify-between rounded-xl border border-white/12 bg-white/[0.04] px-3 text-left"
                  onClick={() => setTagSheetOpen(true)}
                  tabIndex={moreOpen ? 0 : -1}
                >
                  <span className="inline-flex items-center gap-2 text-sm text-white">
                    <Tag className="h-4 w-4 text-uri-keaney" />
                    Tag people, organizations, or events
                  </span>
                  <ChevronRight className="h-4 w-4 text-white/45" />
                </button>

                <label htmlFor="field-note-location" className="cq-composer-label">
                  Add to Realm Map
                </label>
                <select
                  ref={locationSelectRef}
                  id="field-note-location"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value as RealmLocationId | "")}
                  className="cq-composer-select"
                  tabIndex={moreOpen ? 0 : -1}
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
                        tabIndex={moreOpen ? 0 : -1}
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
                        tabIndex={moreOpen ? 0 : -1}
                      />
                      <button
                        type="button"
                        onClick={addRamMark}
                        disabled={!canAddRamMark}
                        className="cq-composer-btn-add"
                        tabIndex={moreOpen ? 0 : -1}
                      >
                        Add RAMark
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
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
              {hasMedia && carouselItems[0] ? (
                <div className="cq-composer-preview-media">
                  {carouselItems[0].kind === "video" ? (
                    <video src={carouselItems[0].previewUrl} muted playsInline className="w-full" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={carouselItems[0].previewUrl} alt="Post media preview" />
                  )}
                  {carouselItems.length > 1 ? (
                    <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                      1/{carouselItems.length}
                    </span>
                  ) : null}
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

      <TagPickerSheet
        open={tagSheetOpen}
        selected={composerTags}
        onChange={setComposerTags}
        onClose={() => setTagSheetOpen(false)}
        onDone={() => setTagSheetOpen(false)}
      />
      <PhotoTagEditor
        open={photoTagEditorOpen}
        imageUrl={carouselItems[activeMediaIndex]?.previewUrl || ""}
        tags={photoTags.filter(
          (t) =>
            !t.mediaKey ||
            t.mediaKey === "primary" ||
            t.mediaKey === carouselItems[activeMediaIndex]?.clientId ||
            t.mediaKey === carouselItems[activeMediaIndex]?.mediaId,
        )}
        onChange={(next) => {
          const mediaKey =
            carouselItems[activeMediaIndex]?.mediaId ||
            carouselItems[activeMediaIndex]?.clientId ||
            "primary";
          const keyed = next.map((t) => ({ ...t, mediaKey }));
          setPhotoTags((prev) => {
            const others = prev.filter(
              (t) =>
                t.mediaKey &&
                t.mediaKey !== mediaKey &&
                t.mediaKey !== carouselItems[activeMediaIndex]?.clientId &&
                t.mediaKey !== "primary",
            );
            return [...others, ...keyed];
          });
        }}
        onClose={() => setPhotoTagEditorOpen(false)}
      />

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
