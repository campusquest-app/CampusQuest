"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

export function DmImageMessage({
  imageUrl,
  alt = "Shared photo",
  pending = false,
  uploadProgress,
}: {
  imageUrl: string;
  alt?: string;
  pending?: boolean;
  uploadProgress?: number;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div className="relative inline-block max-w-[240px]">
        <button
          type="button"
          onClick={() => !pending && setExpanded(true)}
          disabled={pending}
          className="block overflow-hidden rounded-2xl disabled:cursor-default"
        >
          <img src={imageUrl} alt={alt} className="max-h-72 w-full max-w-[240px] object-cover" loading="lazy" />
        </button>
        {pending ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-black/50">
            <Loader2 className="h-6 w-6 animate-spin text-uri-keaney" aria-hidden />
            {uploadProgress != null && uploadProgress > 0 ? (
              <span className="text-[10px] font-medium text-white/90">{Math.round(uploadProgress)}%</span>
            ) : null}
          </div>
        ) : null}
      </div>
      {expanded ? (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/85 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Photo preview"
          onClick={() => setExpanded(false)}
        >
          <img
            src={imageUrl}
            alt={alt}
            className="max-h-[90vh] max-w-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}
