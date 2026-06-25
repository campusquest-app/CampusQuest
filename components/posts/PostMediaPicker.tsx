"use client";

import { useRef, useState } from "react";
import { Camera, ImagePlus, X } from "lucide-react";
import { readImageFileAsDataUrl } from "@/lib/client/readImageFile";

/**
 * Step 1 of the create-post flow: an Instagram-style fullscreen media picker.
 * Web has no native gallery grid, so we reuse the existing file/camera inputs
 * and show a large live preview of the chosen image.
 */
export function PostMediaPicker({
  initialImage = "",
  onClose,
  onNext,
}: {
  initialImage?: string;
  onClose: () => void;
  /** Continue to the composer with the selected image (or "" for text-only). */
  onNext: (image: string) => void;
}) {
  const [image, setImage] = useState(initialImage);
  const [error, setError] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      setImage(dataUrl);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that image.");
    }
  }

  const hasImage = image.trim().length > 0;

  return (
    <div className="cq-mediapicker">
      <header className="cq-composer-head">
        <button type="button" onClick={onClose} className="cq-composer-head-icon" aria-label="Close">
          <X className="h-5 w-5" strokeWidth={2.2} />
        </button>
        <span className="cq-composer-head-title">New Post</span>
        <button type="button" onClick={() => onNext(image)} className="cq-composer-head-post cq-composer-head-post--ready">
          Next
        </button>
      </header>

      <div className="cq-mediapicker-stage">
        {hasImage ? (
          <div className="cq-mediapicker-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="Selected media preview" />
            <button
              type="button"
              onClick={() => setImage("")}
              className="cq-composer-image-remove"
              aria-label="Remove image"
            >
              <X className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => photoRef.current?.click()}
            className="cq-mediapicker-empty"
            aria-label="Choose a photo"
          >
            <span className="cq-mediapicker-empty-glow" aria-hidden />
            <ImagePlus className="h-12 w-12" strokeWidth={1.5} />
            <p className="cq-mediapicker-empty-title">Add a photo</p>
            <p className="cq-mediapicker-empty-sub">Tap to choose from your library</p>
          </button>
        )}
      </div>

      {error ? (
        <p className="cq-composer-error px-4" role="alert">
          {error}
        </p>
      ) : null}

      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
        aria-label="Choose photo from library"
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        className="hidden"
        aria-label="Take a photo with the camera"
      />

      <div className="cq-mediapicker-tools">
        <button type="button" onClick={() => cameraRef.current?.click()} className="cq-mediapicker-tool" aria-label="Open camera">
          <Camera className="h-[22px] w-[22px]" strokeWidth={2} />
          <span>Camera</span>
        </button>
        <button type="button" onClick={() => photoRef.current?.click()} className="cq-mediapicker-tool" aria-label="Choose photo">
          <ImagePlus className="h-[22px] w-[22px]" strokeWidth={2} />
          <span>{hasImage ? "Replace" : "Photos"}</span>
        </button>
      </div>

      <button type="button" onClick={() => onNext("")} className="cq-mediapicker-skip">
        Continue without photo
      </button>
    </div>
  );
}
