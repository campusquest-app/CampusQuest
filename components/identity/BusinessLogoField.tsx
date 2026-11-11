"use client";

import { useEffect, useState } from "react";
import { businessLogoFileError } from "@/lib/businessLogoFile";

export function BusinessLogoField({
  file,
  onFile,
  onError,
  inputId = "cq-business-logo",
  label = "logo",
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  onError: (message: string | null) => void;
  inputId?: string;
  label?: string;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function choose(next: File | null) {
    if (!next) {
      onFile(null);
      onError(null);
      return;
    }
    const message = businessLogoFileError(next);
    if (message) {
      onFile(null);
      onError(message);
      return;
    }
    onError(null);
    onFile(next);
  }

  return (
    <div className="cq-logo-field">
      <div className="cq-logo-preview" aria-hidden={!previewUrl}>
        {previewUrl ? (
          <img src={previewUrl} alt="" className="cq-logo-preview-img" />
        ) : (
          <span className="cq-logo-preview-empty">{label}</span>
        )}
      </div>
      <div className="cq-logo-field-actions">
        <label className="cq-verify-upload" htmlFor={inputId}>
          <input
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(event) => {
              choose(event.target.files?.[0] ?? null);
              event.target.value = "";
            }}
          />
          {file ? `Replace ${label}` : `Upload ${label}`}
        </label>
        {file ? (
          <button type="button" className="cq-logo-remove" onClick={() => choose(null)}>
            Remove
          </button>
        ) : null}
      </div>
    </div>
  );
}
