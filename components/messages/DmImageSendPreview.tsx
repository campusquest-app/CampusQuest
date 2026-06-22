"use client";

import { Loader2 } from "lucide-react";

export function DmImageSendPreview({
  imageUrl,
  caption,
  onCaptionChange,
  onCancel,
  onSend,
  sending,
  uploadProgress,
}: {
  imageUrl: string;
  caption: string;
  onCaptionChange: (value: string) => void;
  onCancel: () => void;
  onSend: () => void;
  sending: boolean;
  uploadProgress: number;
}) {
  return (
    <div className="mb-3 overflow-hidden rounded-2xl bg-[#121212]">
      <div className="relative aspect-[4/5] max-h-[min(52vh,420px)] w-full bg-black/40">
        <img src={imageUrl} alt="Photo preview" className="h-full w-full object-contain" />
        {sending ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/45">
            <Loader2 className="h-8 w-8 animate-spin text-uri-keaney" aria-hidden />
            <span className="text-sm font-medium text-white/90">Uploading…</span>
          </div>
        ) : null}
      </div>
      {sending ? (
        <div className="px-3 pt-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-uri-keaney transition-[width] duration-300 ease-out"
              style={{ width: `${Math.max(8, Math.min(100, uploadProgress))}%` }}
              role="progressbar"
              aria-valuenow={uploadProgress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>
      ) : null}
      <div className="space-y-2 p-3">
        <input
          type="text"
          value={caption}
          onChange={(e) => onCaptionChange(e.target.value.slice(0, 2000))}
          placeholder="Add a caption…"
          maxLength={2000}
          disabled={sending}
          className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-uri-keaney/40 disabled:opacity-60"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={sending}
            className="flex-1 rounded-xl border border-white/20 py-2.5 text-sm font-semibold text-white/85 hover:bg-white/10 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSend}
            disabled={sending}
            className="flex-1 rounded-xl bg-[#0095f6] py-2.5 text-sm font-semibold text-white hover:bg-[#0086e0] disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
