"use client";

import { useRef, useState } from "react";
import { Camera, ImageIcon, Mic, Send } from "lucide-react";
import {
  imageAcceptAttribute,
  resetFileInput,
  validateDmImageFile,
  type DmImagePickSource,
  type DmPendingImageDraft,
} from "@/lib/client/dmMediaComposer";
import { readImageFileAsDataUrl } from "@/lib/client/dmMessagesClient";
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

      <DmMediaActionSheet
        open={cameraSheetOpen}
        onClose={() => setCameraSheetOpen(false)}
        onSelect={handleCameraAction}
      />

      <form
        onSubmit={onSubmit}
        className="cq-dm-composer shrink-0 border-t border-white/[0.06] bg-black px-3 pt-2 pb-[max(0.625rem,env(safe-area-inset-bottom))]"
      >
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

        <div className="cq-dm-composer-pill flex items-center gap-1 rounded-full bg-[#262626] px-2 py-1.5">
          <button
            type="button"
            onClick={() => setCameraSheetOpen(true)}
            disabled={disabled || sending || Boolean(imageDraft)}
            className="cq-dm-composer-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/85 disabled:opacity-40"
            aria-label="Camera"
          >
            <Camera className="h-[22px] w-[22px]" strokeWidth={1.75} />
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => onInputChange(e.target.value.slice(0, 2000))}
            placeholder="Message..."
            maxLength={2000}
            disabled={disabled || Boolean(imageDraft)}
            className="min-w-0 flex-1 border-0 bg-transparent px-2 py-2 text-[15px] text-white placeholder:text-white/40 focus:outline-none disabled:opacity-60"
          />

          {imageDraft ? (
            <button
              type="button"
              onClick={() => onImageSend({ draft: imageDraft, caption: previewCaption.trim() })}
              disabled={!canSendImage}
              className="cq-dm-composer-send flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0095f6] text-white disabled:opacity-40"
              aria-label="Send photo"
            >
              <Send className="h-4 w-4" strokeWidth={2} />
            </button>
          ) : canSendText ? (
            <button
              type="submit"
              disabled={sending || disabled}
              className="cq-dm-composer-send flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0095f6] text-white disabled:opacity-40"
              aria-label="Send message"
            >
              <Send className="h-4 w-4" strokeWidth={2} />
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={disabled || sending}
                className="cq-dm-composer-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/55 disabled:opacity-40"
                aria-label="Voice message"
              >
                <Mic className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                onClick={() => openPicker("library")}
                disabled={disabled || sending}
                className="cq-dm-composer-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/55 disabled:opacity-40"
                aria-label="Photo library"
              >
                <ImageIcon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </button>
            </>
          )}
        </div>
      </form>
    </>
  );
}
