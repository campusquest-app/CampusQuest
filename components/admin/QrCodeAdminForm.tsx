"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CampusLocationFields } from "@/components/admin/CampusLocationFields";
import type { AdminQuestRow } from "@/lib/adminQuestTypes";
import { getAccessToken } from "@/lib/client/apiSession";
import { postAuthed, patchAuthed } from "@/lib/client/dashboardApi";
import {
  applyQuestAutofill,
  buildQrAdminPayload,
  EMPTY_QR_ADMIN_FORM,
  formatQrCreationError,
  QR_TYPE_OPTIONS,
  qrRowToFormState,
  regenerateQrCodePng,
  resolveQrPreviewUrl,
  uploadQrCodeImage,
  type QrAdminFormState,
  type QrCodeAdminRow,
} from "@/lib/client/qrCodeAdminClient";
import { isGymQrDatabaseCode, OFFICIAL_GYM_QR_ASSET_PATH } from "@/lib/gymQr";

type QrCodeAdminFormProps = {
  mode: "create" | "edit";
  initialRow?: QrCodeAdminRow | null;
  quests: AdminQuestRow[];
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onError: (message: string | null) => void;
  onSaved: (result: { row: QrCodeAdminRow; scanUrl: string }) => void;
  onCancel?: () => void;
};

function questIsActive(quest: AdminQuestRow): boolean {
  if (quest.deleted_at) return false;
  if (quest.visibility_status !== "active") return false;
  if (quest.ends_at && new Date(quest.ends_at) <= new Date()) return false;
  return true;
}

function questStatusLabel(quest: AdminQuestRow): string {
  if (quest.deleted_at) return "deleted";
  if (quest.visibility_status === "draft") return "draft";
  if (quest.visibility_status === "hidden") return "inactive";
  if (quest.ends_at && new Date(quest.ends_at) <= new Date()) return "expired";
  return quest.visibility_status;
}

function AuthenticatedQrPreview({
  qrId,
  publicUrl,
  code,
  alt,
  className,
}: {
  qrId: string;
  publicUrl?: string | null;
  code: string;
  alt: string;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(publicUrl?.trim() || null);

  useEffect(() => {
    if (publicUrl?.trim()) {
      setSrc(publicUrl.trim());
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    async function load() {
      const token = getAccessToken();
      const res = await fetch(`/api/internal/admin/qr-codes/${qrId}/image`, {
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
  }, [qrId, publicUrl]);

  if (code === "GYM" || isGymQrDatabaseCode(code)) {
    return (
      <Image
        src={OFFICIAL_GYM_QR_ASSET_PATH}
        alt={alt}
        width={160}
        height={160}
        className={className}
        unoptimized
      />
    );
  }

  if (!src) {
    return <div className={`animate-pulse rounded-lg bg-white/10 ${className ?? "h-40 w-40"}`} />;
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className ?? "h-40 w-40 object-contain"} />;
}

export function QrCodeAdminForm({
  mode,
  initialRow,
  quests,
  busy,
  onBusyChange,
  onError,
  onSaved,
  onCancel,
}: QrCodeAdminFormProps) {
  const [form, setForm] = useState<QrAdminFormState>(() =>
    initialRow ? qrRowToFormState(initialRow) : { ...EMPTY_QR_ADMIN_FORM },
  );
  const [showInactiveQuests, setShowInactiveQuests] = useState(false);
  const [previewRow, setPreviewRow] = useState<QrCodeAdminRow | null>(initialRow ?? null);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm(initialRow ? qrRowToFormState(initialRow) : { ...EMPTY_QR_ADMIN_FORM });
    setPreviewRow(initialRow ?? null);
    setPendingImage(null);
    setPendingPreviewUrl(null);
  }, [initialRow, mode]);

  useEffect(() => {
    if (!pendingImage) {
      setPendingPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingImage);
    setPendingPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingImage]);

  const questOptions = useMemo(() => {
    const filtered = showInactiveQuests ? quests.filter((q) => !q.deleted_at) : quests.filter(questIsActive);
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [quests, showInactiveQuests]);

  const selectedQuest = useMemo(
    () => quests.find((q) => q.id === form.adminQuestId) ?? null,
    [quests, form.adminQuestId],
  );

  const handleQuestChange = useCallback(
    (questId: string) => {
      if (!questId) {
        setForm((f) => ({ ...f, adminQuestId: "" }));
        return;
      }
      const quest = quests.find((q) => q.id === questId);
      if (!quest) {
        setForm((f) => ({ ...f, adminQuestId: questId }));
        return;
      }
      setForm((f) => applyQuestAutofill(f, quest));
    },
    [quests],
  );

  async function handleImageUpload(qrId: string, file: File) {
    const imageUrl = await uploadQrCodeImage(qrId, file);
    setPreviewRow((row) => (row ? { ...row, image_url: imageUrl } : row));
    setPendingImage(null);
  }

  async function handleRegeneratePng() {
    if (!previewRow?.id) return;
    onBusyChange(true);
    onError(null);
    try {
      const result = await regenerateQrCodePng(previewRow.id);
      setPreviewRow((row) =>
        row ? { ...row, qr_png_url: result.qrPngUrl, metadata: { ...row.metadata, scan_url: result.scanUrl } } : row,
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not regenerate QR PNG.");
    } finally {
      onBusyChange(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onBusyChange(true);
    onError(null);
    try {
      const payload = buildQrAdminPayload(form, { isUpdate: mode === "edit" });
      let result: { row: QrCodeAdminRow; scanUrl: string };

      if (mode === "create") {
        result = await postAuthed<{ row: QrCodeAdminRow; scanUrl: string }, Record<string, unknown>>(
          "/api/internal/admin/qr-codes",
          payload,
        );
      } else if (previewRow?.id) {
        result = await patchAuthed<{ row: QrCodeAdminRow; scanUrl: string }, Record<string, unknown>>(
          `/api/internal/admin/qr-codes/${previewRow.id}`,
          payload,
        );
      } else {
        throw new Error("Missing QR code to update.");
      }

      let savedRow = result.row;
      if (pendingImage) {
        const imageUrl = await uploadQrCodeImage(savedRow.id, pendingImage);
        savedRow = { ...savedRow, image_url: imageUrl };
        setPreviewRow(savedRow);
        setPendingImage(null);
      }

      onSaved({ row: savedRow, scanUrl: result.scanUrl });
    } catch (err) {
      onError(formatQrCreationError(err));
    } finally {
      onBusyChange(false);
    }
  }

  const previewPublicUrl = pendingPreviewUrl ?? (previewRow ? resolveQrPreviewUrl(previewRow) : null);
  const downloadHref =
    previewRow && (previewRow.image_url || previewRow.qr_png_url)
      ? (previewRow.image_url ?? previewRow.qr_png_url ?? "")
      : previewRow
        ? `/api/internal/admin/qr-codes/${previewRow.id}/image`
        : null;

  const inputClass = "mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white";
  const labelClass = "block text-sm text-white/80";

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
      <label className={labelClass}>
        QR name
        <input
          required
          className={inputClass}
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />
      </label>

      <label className={labelClass}>
        QR code token (optional)
        <input
          className={`${inputClass} uppercase`}
          placeholder="Auto-generated"
          value={form.code}
          onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
          disabled={mode === "edit"}
        />
      </label>

      <label className={`${labelClass} sm:col-span-2`}>
        Description
        <textarea
          rows={2}
          className={inputClass}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </label>

      <label className={labelClass}>
        QR type
        <select
          className={inputClass}
          value={form.qrType}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              qrType: e.target.value as QrAdminFormState["qrType"],
              isActive: f.isActive,
            }))
          }
        >
          {QR_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className={labelClass}>
        Activity name (optional)
        <input
          className={inputClass}
          value={form.activityName}
          onChange={(e) => setForm((f) => ({ ...f, activityName: e.target.value }))}
        />
      </label>

      <div className={`${labelClass} sm:col-span-2 space-y-2`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>Linked quest</span>
          <label className="flex items-center gap-2 text-xs text-white/60">
            <input
              type="checkbox"
              checked={showInactiveQuests}
              onChange={(e) => setShowInactiveQuests(e.target.checked)}
            />
            Show inactive quests
          </label>
        </div>
        <select
          className={inputClass}
          value={form.adminQuestId}
          onChange={(e) => handleQuestChange(e.target.value)}
        >
          <option value="">No linked quest</option>
          {questOptions.map((quest) => (
            <option key={quest.id} value={quest.id}>
              {quest.name} ({questStatusLabel(quest)})
            </option>
          ))}
        </select>
        {selectedQuest ? (
          <p className="text-xs text-white/50">
            Quest XP: {selectedQuest.xp_reward} · {selectedQuest.completion_method}
            {selectedQuest.qr_code_id && previewRow?.id && selectedQuest.qr_code_id !== previewRow.id
              ? " · linked to another QR"
              : ""}
          </p>
        ) : null}
      </div>

      <div className="sm:col-span-2">
        <CampusLocationFields
          value={form.campusLocation}
          onChange={(campusLocation) => setForm((f) => ({ ...f, campusLocation }))}
          labelClassName="text-white/80 text-sm"
          inputClassName={inputClass}
        />
      </div>

      <label className={labelClass}>
        XP reward
        <input
          type="number"
          min={0}
          max={10000}
          className={inputClass}
          value={form.xpReward}
          onChange={(e) => setForm((f) => ({ ...f, xpReward: Number(e.target.value) }))}
        />
      </label>

      <label className={labelClass}>
        Max uses (per day)
        <input
          type="number"
          min={0}
          max={999}
          className={inputClass}
          value={form.maxUses}
          onChange={(e) => setForm((f) => ({ ...f, maxUses: Number(e.target.value) }))}
        />
      </label>

      <label className={labelClass}>
        Cooldown (hours)
        <input
          type="number"
          min={0}
          className={inputClass}
          value={form.cooldownHours}
          onChange={(e) => setForm((f) => ({ ...f, cooldownHours: Number(e.target.value) }))}
        />
      </label>

      <label className={`${labelClass} flex items-center gap-2 pt-6`}>
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
        />
        Active
      </label>

      <label className={labelClass}>
        Start date/time
        <input
          type="datetime-local"
          className={inputClass}
          value={form.startsAt}
          onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
        />
      </label>

      <label className={labelClass}>
        End date/time
        <input
          type="datetime-local"
          className={inputClass}
          value={form.expiresAt}
          onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
        />
      </label>

      <div className="sm:col-span-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <h4 className="text-sm font-semibold text-white">QR image</h4>
        <p className="mt-1 text-xs text-white/55">
          Upload a custom image or regenerate the PNG from the scan URL. Custom uploads override generated PNGs in
          previews.
        </p>

        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="shrink-0 rounded-lg bg-white p-2">
            {pendingPreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pendingPreviewUrl} alt="Pending upload preview" className="h-40 w-40 object-contain" />
            ) : previewRow ? (
              <AuthenticatedQrPreview
                qrId={previewRow.id}
                publicUrl={previewRow.image_url ?? previewRow.qr_png_url}
                code={previewRow.code}
                alt={`QR preview for ${previewRow.title}`}
                className="h-40 w-40 object-contain"
              />
            ) : (
              <div className="flex h-40 w-40 items-center justify-center text-xs text-black/50">Save to preview</div>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setPendingImage(file);
                e.target.value = "";
              }}
            />
            <input
              ref={replaceInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (previewRow?.id) {
                  onBusyChange(true);
                  onError(null);
                  void handleImageUpload(previewRow.id, file).catch((err) =>
                    onError(err instanceof Error ? err.message : "Upload failed."),
                  ).finally(() => onBusyChange(false));
                } else {
                  setPendingImage(file);
                }
                e.target.value = "";
              }}
            />

            <button
              type="button"
              className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-white hover:bg-white/10"
              onClick={() => fileInputRef.current?.click()}
            >
              {mode === "create" && !previewRow ? "Upload image" : "Choose image"}
            </button>

            {previewRow ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:opacity-50"
                  onClick={() => void handleRegeneratePng()}
                >
                  Regenerate QR PNG
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-white hover:bg-white/10"
                  onClick={() => replaceInputRef.current?.click()}
                >
                  Replace image
                </button>
                {downloadHref ? (
                  <a
                    href={downloadHref}
                    download={previewRow.code ? `campusquest-qr-${previewRow.code}.png` : undefined}
                    className="rounded-lg border border-uri-keaney/50 px-3 py-1.5 text-sm text-uri-keaney hover:bg-uri-keaney/10"
                  >
                    Download PNG
                  </a>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" disabled={busy} className="btn-primary px-4 py-2 text-sm disabled:opacity-60">
          {busy ? "Saving…" : mode === "create" ? "Create QR code" : "Save changes"}
        </button>
        {onCancel ? (
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/80 hover:bg-white/10 disabled:opacity-60"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
