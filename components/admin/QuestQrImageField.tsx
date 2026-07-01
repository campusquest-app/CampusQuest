"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getAccessToken } from "@/lib/client/apiSession";
import type { AdminQuestLinkedQr } from "@/lib/adminQuestTypes";
import {
  downloadCanvasPng,
  downloadQuestQrPosterPdf,
  renderQuestQrPosterCanvas,
  slugifyPosterFilename,
  type QuestQrPosterData,
} from "@/lib/client/questQrPosterExport";
import {
  regenerateQrCodePng,
  regenerateQrToken,
  resolveQrPreviewUrl,
  resolveQuestQrScanUrl,
  uploadQrCodeImage,
} from "@/lib/client/qrCodeAdminClient";

type QuestQrImageFieldProps = {
  linkedQr: AdminQuestLinkedQr | null;
  questName: string;
  xpReward: number;
  locationName: string | null;
  editingQuestId: string | null;
  pendingFile: File | null;
  onPendingFileChange: (file: File | null) => void;
  onLinkedQrChange: (qr: AdminQuestLinkedQr) => void;
  onGenerateQr: () => Promise<void>;
  onError: (message: string | null) => void;
  disabled?: boolean;
};

function QuestQrPreview({
  linkedQr,
  pendingPreviewUrl,
  alt,
}: {
  linkedQr: AdminQuestLinkedQr | null;
  pendingPreviewUrl: string | null;
  alt: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (pendingPreviewUrl) {
      setSrc(pendingPreviewUrl);
      return;
    }
    if (!linkedQr) {
      setSrc(null);
      return;
    }

    const publicUrl = resolveQrPreviewUrl(linkedQr);
    if (publicUrl.startsWith("http")) {
      setSrc(publicUrl);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    async function load() {
      const token = getAccessToken();
      const res = await fetch(`/api/internal/admin/qr-codes/${linkedQr!.id}/image`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      if (!res.ok || cancelled) return;
      const blob = await res.blob();
      objectUrl = URL.createObjectURL(blob);
      if (!cancelled) setSrc(objectUrl);
    }

    void load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [linkedQr, pendingPreviewUrl]);

  if (!src) {
    return <div className="flex h-36 w-36 items-center justify-center text-[10px] text-black/45">No image yet</div>;
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className="h-36 w-36 object-contain" />;
}

export function QuestQrImageField({
  linkedQr,
  questName,
  xpReward,
  locationName,
  editingQuestId,
  pendingFile,
  onPendingFileChange,
  onLinkedQrChange,
  onGenerateQr,
  onError,
  disabled = false,
}: QuestQrImageFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const scanUrl = useMemo(() => resolveQuestQrScanUrl(linkedQr), [linkedQr]);

  const posterData = useMemo<QuestQrPosterData | null>(() => {
    if (!scanUrl) return null;
    return {
      questName: questName.trim() || "Campus Quest",
      locationName,
      xpReward,
      scanUrl,
    };
  }, [scanUrl, questName, locationName, xpReward]);

  useEffect(() => {
    if (!pendingFile) {
      setPendingPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setPendingPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  async function handleFileSelected(file: File) {
    onError(null);
    if (linkedQr?.id) {
      setUploading(true);
      try {
        const imageUrl = await uploadQrCodeImage(linkedQr.id, file);
        onLinkedQrChange({ ...linkedQr, image_url: imageUrl });
        onPendingFileChange(null);
      } catch (err) {
        onError(err instanceof Error ? err.message : "QR image upload failed.");
      } finally {
        setUploading(false);
      }
      return;
    }
    onPendingFileChange(file);
  }

  async function runPosterAction(action: "png" | "pdf") {
    if (!posterData) {
      onError("Generate a QR code before downloading the poster.");
      return;
    }
    setBusyAction(action);
    onError(null);
    try {
      const canvas = await renderQuestQrPosterCanvas(posterData, 2);
      const base = `campusquest-qr-${slugifyPosterFilename(posterData.questName)}`;
      if (action === "png") {
        downloadCanvasPng(canvas, `${base}.png`);
      } else {
        await downloadQuestQrPosterPdf(canvas, `${base}.pdf`);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not export QR poster.");
    } finally {
      setBusyAction(null);
    }
  }

  function openPrintView() {
    if (!editingQuestId) {
      onError("Save the quest before printing the QR poster.");
      return;
    }
    window.open(`/internal/admin/quests/qr-print?questId=${encodeURIComponent(editingQuestId)}`, "_blank", "noopener,noreferrer");
  }

  async function handleRegenerateToken() {
    if (!linkedQr?.id) return;
    const confirmed = window.confirm(
      "Regenerate QR token? The old printed QR code will stop working immediately. This cannot be undone.",
    );
    if (!confirmed) return;
    setBusyAction("regenerate");
    onError(null);
    try {
      const result = await regenerateQrToken(linkedQr.id);
      onLinkedQrChange({
        ...result.row,
        id: linkedQr.id,
        code: result.newCode,
        image_url: result.row.image_url ?? null,
        qr_png_url: result.row.qr_png_url ?? null,
        metadata: { ...(result.row.metadata ?? {}), scan_url: result.scanUrl },
      });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not regenerate QR token.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRegeneratePng() {
    if (!linkedQr?.id) return;
    setBusyAction("png-regen");
    onError(null);
    try {
      const result = await regenerateQrCodePng(linkedQr.id);
      onLinkedQrChange({
        ...linkedQr,
        qr_png_url: result.qrPngUrl,
        metadata: { ...(linkedQr.metadata ?? {}), scan_url: result.scanUrl },
      });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not regenerate QR PNG.");
    } finally {
      setBusyAction(null);
    }
  }

  const actionDisabled = disabled || uploading || Boolean(busyAction);

  return (
    <div className="sm:col-span-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <h4 className="text-sm font-semibold text-white">QR code</h4>
      <p className="mt-1 text-xs text-white/55">
        Secure scan tokens encode a backend URL — never plain quest text. Upload a custom PNG/JPG for printing, or use
        the generated poster below.
      </p>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="shrink-0 rounded-lg bg-white p-2">
          <QuestQrPreview
            linkedQr={linkedQr}
            pendingPreviewUrl={pendingPreviewUrl}
            alt={linkedQr?.code ? `QR code ${linkedQr.code}` : "Quest QR preview"}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {linkedQr?.code ? (
            <p className="text-[11px] text-white/55">
              Token: <code className="text-cyan-100">{linkedQr.code}</code>
            </p>
          ) : null}
          {scanUrl ? (
            <p className="text-[11px] text-uri-keaney break-all">
              Scan URL:{" "}
              <a href={scanUrl} className="underline" target="_blank" rel="noreferrer">
                {scanUrl}
              </a>
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {!linkedQr ? (
              <button
                type="button"
                disabled={actionDisabled || !editingQuestId}
                onClick={() => void onGenerateQr().catch((err) => onError(err instanceof Error ? err.message : "Could not generate QR."))}
                className="rounded-lg bg-uri-keaney px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busyAction === "generate" ? "Generating…" : "Generate QR code"}
              </button>
            ) : null}
            {!editingQuestId && !linkedQr ? (
              <p className="text-[11px] text-white/45 self-center">Save the quest first, then generate or upload a QR.</p>
            ) : null}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              className="hidden"
              disabled={actionDisabled}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileSelected(file);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={actionDisabled}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:opacity-50"
            >
              {uploading ? "Uploading…" : linkedQr?.image_url || pendingFile ? "Replace image" : "Upload image"}
            </button>

            {linkedQr ? (
              <>
                <button
                  type="button"
                  disabled={actionDisabled || !posterData}
                  onClick={() => void runPosterAction("png")}
                  className="rounded-lg border border-uri-keaney/50 px-3 py-1.5 text-sm text-uri-keaney hover:bg-uri-keaney/10 disabled:opacity-50"
                >
                  {busyAction === "png" ? "Exporting…" : "Download PNG"}
                </button>
                <button
                  type="button"
                  disabled={actionDisabled || !posterData}
                  onClick={() => void runPosterAction("pdf")}
                  className="rounded-lg border border-uri-keaney/50 px-3 py-1.5 text-sm text-uri-keaney hover:bg-uri-keaney/10 disabled:opacity-50"
                >
                  {busyAction === "pdf" ? "Exporting…" : "Download PDF"}
                </button>
                <button
                  type="button"
                  disabled={actionDisabled || !editingQuestId}
                  onClick={openPrintView}
                  className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:opacity-50"
                >
                  Print QR
                </button>
                <button
                  type="button"
                  disabled={actionDisabled}
                  onClick={() => void handleRegeneratePng()}
                  className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:opacity-50"
                >
                  {busyAction === "png-regen" ? "Regenerating…" : "Refresh PNG"}
                </button>
                <button
                  type="button"
                  disabled={actionDisabled}
                  onClick={() => void handleRegenerateToken()}
                  className="rounded-lg border border-amber-400/40 px-3 py-1.5 text-sm text-amber-200 hover:bg-amber-500/10 disabled:opacity-50"
                >
                  {busyAction === "regenerate" ? "Regenerating…" : "Regenerate QR"}
                </button>
              </>
            ) : null}
          </div>

          {pendingFile && !linkedQr ? (
            <p className="text-[11px] text-white/45">Image will upload after the quest is saved.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
