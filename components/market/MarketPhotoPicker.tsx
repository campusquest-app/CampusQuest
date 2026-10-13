"use client";

import { forwardRef, useState } from "react";
import { ImagePlus, Plus, X } from "lucide-react";

export type MarketPhotoPreview = {
  id: string;
  url: string;
};

export const MARKET_PHOTO_INPUT_ID = "cq-market-photos";

/**
 * Listing photo picker. Uses a real (visually hidden) file input so the native
 * picker offers the photo library / camera on mobile; the first photo is the cover.
 */
export const MarketPhotoPicker = forwardRef<
  HTMLInputElement,
  {
    photos: MarketPhotoPreview[];
    max: number;
    error: string | null;
    notice: string | null;
    onAddFiles: (files: File[]) => void;
    onRemove: (id: string) => void;
  }
>(function MarketPhotoPicker({ photos, max, error, notice, onAddFiles, onRemove }, inputRef) {
  const [broken, setBroken] = useState<Record<string, true>>({});
  const errorId = `${MARKET_PHOTO_INPUT_ID}-error`;
  const hintId = `${MARKET_PHOTO_INPUT_ID}-hint`;
  const canAddMore = photos.length < max;

  const input = (
    <input
      ref={inputRef}
      id={MARKET_PHOTO_INPUT_ID}
      type="file"
      accept="image/*"
      multiple
      className="cq-market-photos__input"
      aria-describedby={error ? `${hintId} ${errorId}` : hintId}
      aria-invalid={error ? true : undefined}
      disabled={!canAddMore}
      onChange={(event) => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = "";
        onAddFiles(files);
      }}
    />
  );

  return (
    <section className={`cq-market-photos${error ? " cq-market-photos--invalid" : ""}`} aria-labelledby={`${MARKET_PHOTO_INPUT_ID}-label`}>
      <h3 id={`${MARKET_PHOTO_INPUT_ID}-label`} className="cq-market-photos__title">
        Photos
      </h3>
      <p id={hintId} className="cq-market-photos__hint">
        Add up to {max} photos of your item. The first photo is the cover.
      </p>

      {photos.length === 0 ? (
        <label htmlFor={MARKET_PHOTO_INPUT_ID} className="cq-market-photos__drop">
          {input}
          <ImagePlus className="cq-market-photos__drop-icon" aria-hidden />
          <span className="cq-market-photos__drop-title">Add photos</span>
          <span className="cq-market-photos__drop-sub">Choose from your device</span>
        </label>
      ) : (
        <ul className="cq-market-photos__grid" aria-label={`${photos.length} of ${max} photos selected`}>
          {photos.map((photo, index) => (
            <li key={photo.id} className="cq-market-photos__item">
              {broken[photo.id] ? (
                <span className="cq-market-photos__fallback">
                  <ImagePlus className="h-5 w-5" aria-hidden />
                  <span>Photo {index + 1}</span>
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- local blob previews
                <img
                  src={photo.url}
                  alt={index === 0 ? "Cover photo" : `Photo ${index + 1}`}
                  className="cq-market-photos__img"
                  onError={() => setBroken((prev) => ({ ...prev, [photo.id]: true }))}
                />
              )}
              {index === 0 ? <span className="cq-market-photos__cover">Cover</span> : null}
              <button
                type="button"
                className="cq-market-photos__remove"
                aria-label={index === 0 ? "Remove cover photo" : `Remove photo ${index + 1}`}
                onClick={() => onRemove(photo.id)}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
          {canAddMore ? (
            <li className="cq-market-photos__item">
              <label htmlFor={MARKET_PHOTO_INPUT_ID} className="cq-market-photos__add">
                {input}
                <Plus className="h-5 w-5" aria-hidden />
                <span>Add</span>
              </label>
            </li>
          ) : null}
        </ul>
      )}

      {!canAddMore ? <p className="cq-market-photos__hint">You&apos;ve added the maximum of {max} photos.</p> : null}
      {notice ? (
        <p className="cq-market-photos__notice" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="cq-market-photos__error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
});
