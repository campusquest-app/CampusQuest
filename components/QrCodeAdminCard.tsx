"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { QrCodeAdminForm } from "@/components/admin/QrCodeAdminForm";
import { UriGymOfficialQrPanel } from "@/components/UriGymOfficialQrPanel";
import type { AdminQuestRow } from "@/lib/adminQuestTypes";
import { ApiRequestError, fetchAuthed, patchAuthed } from "@/lib/client/dashboardApi";
import { resolveQrPreviewUrl, type QrCodeAdminRow } from "@/lib/client/qrCodeAdminClient";
import { isGymQrDatabaseCode, OFFICIAL_GYM_QR_ASSET_PATH } from "@/lib/gymQr";

type QrScanLogRow = {
  id: string;
  scanned_at: string;
  xp_awarded: number;
  status: string;
  failure_reason: string | null;
  user_id: string;
  qr_codes?: { title?: string; code?: string; type?: string } | null;
};

type QuestApiRow = { quest: AdminQuestRow };

function qrTypeLabel(row: QrCodeAdminRow): string {
  return row.qr_type ?? row.type;
}

export function QrCodeAdminCard() {
  const [codes, setCodes] = useState<QrCodeAdminRow[]>([]);
  const [quests, setQuests] = useState<AdminQuestRow[]>([]);
  const [scans, setScans] = useState<QrScanLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editingRow, setEditingRow] = useState<QrCodeAdminRow | null>(null);
  const [createdScanUrl, setCreatedScanUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [codesRes, scansRes, questsRes] = await Promise.all([
        fetchAuthed<{ codes: QrCodeAdminRow[] }>("/api/internal/admin/qr-codes"),
        fetchAuthed<{ scans: QrScanLogRow[] }>("/api/internal/admin/qr-scans?limit=60"),
        fetchAuthed<{ quests: QuestApiRow[] }>("/api/internal/admin/quests"),
      ]);
      setCodes(codesRes.codes ?? []);
      setScans(scansRes.scans ?? []);
      setQuests((questsRes.quests ?? []).map((row) => row.quest));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load QR admin data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditingRow(null);
    setFormMode("create");
    setCreatedScanUrl(null);
    setError(null);
  }

  function openEdit(row: QrCodeAdminRow) {
    setEditingRow(row);
    setFormMode("edit");
    setError(null);
  }

  function closeForm() {
    setFormMode(null);
    setEditingRow(null);
  }

  async function handleSaved(result: { row: QrCodeAdminRow; scanUrl: string }) {
    setCreatedScanUrl(result.scanUrl);
    closeForm();
    await load();
  }

  async function toggleActive(row: QrCodeAdminRow) {
    setBusy(true);
    try {
      await patchAuthed(`/api/internal/admin/qr-codes/${row.id}`, { isActive: !row.is_active });
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  const showModal = formMode !== null;

  return (
    <section className="card space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-display font-bold text-white">CQ QR Codes</h2>
          <p className="mt-1 text-sm text-white/70">
            Create and manage campus QR codes. Scans use secure tokens (
            <code className="text-cyan-200">/scan?code=YOUR_CODE</code>), not raw quest data.
          </p>
          <Link
            href="/internal/admin/qr/print"
            className="mt-2 inline-block text-sm font-medium text-uri-keaney underline-offset-2 hover:underline"
          >
            Open printable URI Gym sheet →
          </Link>
        </div>
        <button type="button" onClick={openCreate} className="btn-primary px-4 py-2 text-sm">
          New QR code
        </button>
      </div>

      <UriGymOfficialQrPanel />

      {error ? (
        <p className="rounded-xl border border-rose-400/35 bg-rose-950/40 px-3 py-2 text-sm text-rose-100">{error}</p>
      ) : null}

      {createdScanUrl ? (
        <p className="rounded-xl border border-cyan-400/30 bg-cyan-950/30 px-3 py-2 text-sm text-cyan-100">
          Scan URL:{" "}
          <a href={createdScanUrl} className="underline break-all">
            {createdScanUrl}
          </a>
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-white/60">Loading QR codes…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="min-w-full text-left text-sm text-white/90">
            <thead className="bg-white/5 text-xs uppercase tracking-wide text-white/60">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Quest</th>
                <th className="px-3 py-2">XP</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Preview</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((row) => {
                const linkedQuest = quests.find((q) => q.id === row.admin_quest_id);
                const previewUrl = resolveQrPreviewUrl(row);
                return (
                  <tr key={row.id} className="border-t border-white/10">
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.title}</div>
                      <div className="text-xs text-white/50">{row.code}</div>
                      {row.location_name ? (
                        <div className="text-xs text-white/40">{row.location_name}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{qrTypeLabel(row)}</td>
                    <td className="px-3 py-2 text-xs">{linkedQuest?.name ?? "—"}</td>
                    <td className="px-3 py-2">{row.xp_reward}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void toggleActive(row)}
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${row.is_active ? "bg-emerald-500/20 text-emerald-200" : "bg-white/10 text-white/60"}`}
                      >
                        {row.is_active ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <div className="shrink-0 rounded-lg bg-white p-1">
                        {row.code === "GYM" || isGymQrDatabaseCode(row.code) ? (
                          <Image
                            src={OFFICIAL_GYM_QR_ASSET_PATH}
                            alt=""
                            width={56}
                            height={56}
                            className="h-14 w-14"
                            unoptimized
                          />
                        ) : row.image_url || row.qr_png_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={previewUrl} alt="" width={56} height={56} className="h-14 w-14 object-contain" />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/internal/admin/qr-codes/${row.id}/image`}
                            alt=""
                            width={56}
                            height={56}
                            className="h-14 w-14 object-contain"
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1 min-w-[7rem]">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="text-left text-uri-keaney underline-offset-2 hover:underline"
                        >
                          Edit
                        </button>
                        <a
                          href={`/scan?code=${encodeURIComponent(row.code)}`}
                          className="text-xs text-cyan-200/90 underline-offset-2 hover:underline"
                        >
                          Scan link
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <h3 className="text-base font-semibold text-white">Recent scan log</h3>
        <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-white/10">
          <table className="min-w-full text-left text-xs text-white/85">
            <thead className="sticky top-0 bg-uri-navy/95 text-white/55">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">QR</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">XP</th>
                <th className="px-3 py-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {scans.map((s) => (
                <tr key={s.id} className="border-t border-white/10">
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(s.scanned_at).toLocaleString()}</td>
                  <td className="px-3 py-2">{s.qr_codes?.title ?? "—"}</td>
                  <td className="px-3 py-2">{s.status}</td>
                  <td className="px-3 py-2">{s.xp_awarded}</td>
                  <td className="px-3 py-2 text-white/60">{s.failure_reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal ? (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={formMode === "create" ? "Create QR code" : "Edit QR code"}
        >
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/15 bg-uri-navy p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-display font-bold text-white">
                {formMode === "create" ? "Create QR code" : "Edit QR code"}
              </h3>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg border border-white/20 px-3 py-1 text-sm text-white/70 hover:bg-white/10"
              >
                Close
              </button>
            </div>
            <QrCodeAdminForm
              mode={formMode}
              initialRow={editingRow}
              quests={quests}
              busy={busy}
              onBusyChange={setBusy}
              onError={setError}
              onSaved={handleSaved}
              onCancel={closeForm}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
