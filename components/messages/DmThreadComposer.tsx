"use client";

import { useRef, useState } from "react";
import { Camera, Plus } from "lucide-react";
import {
  imageAcceptAttribute,
  resetFileInput,
  validateDmImageFile,
  type DmImagePickSource,
  type DmPendingImageDraft,
} from "@/lib/client/dmMediaComposer";
import { readImageFileAsDataUrl } from "@/lib/client/dmMessagesClient";
import { DmAttachMenuSheet } from "@/components/messages/DmAttachMenuSheet";
import { DmMediaActionSheet, type DmCameraAction } from "@/components/messages/DmMediaActionSheet";
import { DmImageSendPreview } from "@/components/messages/DmImageSendPreview";

export function DmThreadComposer({
  input,
  onInputChange,
  onSubmit,
  disabled,
  sending,
  imageDraft,
  onImageDraftChange,
  onImageSend,
  onImageSendError,
  uploadProgress,
}: {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  disabled: boolean;
  sending: boolean;
  imageDraft: DmPendingImageDraft | null;
  onImageDraftChange: (draft: DmPendingImageDraft | null) => void;
  onImageSend: (args: { draft: DmPendingImageDraft; caption: string }) => void;
  onImageSendError: (message: string) => void;
  uploadProgress: number;
}) {
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [cameraSheetOpen, setCameraSheetOpen] = useState(false);
  const [previewCaption, setPreviewCaption] = useState("");
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const accept = imageAcceptAttribute();

  async function consumeFile(file: File | null | undefined, source: DmImagePickSource) {
    if (!file) return;
    const validationError = validateDmImageFile(file);
    if (validationError) {
      onImageSendError(validationError);
      return;
    }
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      setPreviewCaption("");
      onImageDraftChange({ dataUrl, source, fileName: file.name });
    } catch {
      onImageSendError("Could not read that image.");
    }
  }

  function openPicker(source: DmImagePickSource) {
    if (source === "camera") {
      resetFileInput(cameraInputRef.current);
      cameraInputRef.current?.click();
      return;
    }
    resetFileInput(libraryInputRef.current);
    libraryInputRef.current?.click();
  }

  function handleCameraAction(action: DmCameraAction) {
    setCameraSheetOpen(false);
    openPicker(action === "take_photo" ? "camera" : "library");
  }

  function clearDraft() {
    onImageDraftChange(null);
    setPreviewCaption("");
    resetFileInput(cameraInputRef.current);
    resetFileInput(libraryInputRef.current);
  }

  const canSendText = Boolean(input.trim()) && !imageDraft;
  const canSendImage = Boolean(imageDraft) && !sending;

  return (
    <>
      <input
        ref={cameraInputRef}
        type="file"
        accept={accept}
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void consumeFile(e.target.files?.[0], "camera");
          resetFileInput(e.currentTarget);
        }}
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          void consumeFile(e.target.files?.[0], "library");
          resetFileInput(e.currentTarget);
        }}
      />

      <DmAttachMenuSheet
        open={attachMenuOpen}
        onClose={() => setAttachMenuOpen(false)}
        onSelect={(item) => {
          setAttachMenuOpen(false);
          if (item.kind === "image") openPicker("library");
        }}
      />

      <DmMediaActionSheet
        open={cameraSheetOpen}
        onClose={() => setCameraSheetOpen(false)}
        onSelect={handleCameraAction}
      />

      <form onSubmit={onSubmit} className="p-3 border-t border-white/10 flex-shrink-0">
        {imageDraft ? (
          <DmImageSendPreview
            imageUrl={imageDraft.dataUrl}
            caption={previewCaption}
            onCaptionChange={setPreviewCaption}
            onCancel={clearDraft}
            onSend={() => onImageSend({ draft: imageDraft, caption: previewCaption.trim() })}
            sending={sending}
            uploadProgress={uploadProgress}
          />
        ) : null}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAttachMenuOpen(true)}
            disabled={disabled || sending}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 text-white/80 hover:bg-white/10 disabled:opacity-50 touch-manipulation"
            aria-label="Attach"
          >
            <Plus className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setCameraSheetOpen(true)}
            disabled={disabled || sending}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 text-white/80 hover:bg-white/10 disabled:opacity-50 touch-manipulation"
            aria-label="Camera"
          >
            <Camera className="h-5 w-5" />
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => onInputChange(e.target.value.slice(0, 2000))}
            placeholder="Message..."
            maxLength={2000}
            disabled={disabled || Boolean(imageDraft)}
            className="flex-1 min-w-0 px-4 py-2.5 rounded-xl bg-white/10 border border-white/15 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-uri-keaney/40 disabled:opacity-60"
          />
          {imageDraft ? (
            <button
              type="button"
              onClick={() => onImageSend({ draft: imageDraft, caption: previewCaption.trim() })}
              disabled={!canSendImage}
              className="px-4 py-2.5 rounded-xl font-semibold bg-uri-keaney text-uri-navy hover:bg-uri-keaney/90 disabled:opacity-50 disabled:pointer-events-none transition-colors touch-manipulation"
            >
              {sending ? "Sending..." : "Send"}
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSendText || sending || disabled}
              className="px-4 py-2.5 rounded-xl font-semibold bg-uri-keaney text-uri-navy hover:bg-uri-keaney/90 disabled:opacity-50 disabled:pointer-events-none transition-colors touch-manipulation"
            >
              {sending ? "Sending..." : "Send"}
            </button>
          )}
        </div>
        <p className="mt-2 text-[11px] text-white/55 leading-relaxed">
          Keep conversations respectful. Harassment, threats, scams, or unsafe conduct may lead to removal from
          CampusQuest and referral to university conduct offices.
        </p>
      </form>
    </>
  );
}
