"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiRequestError, fetchAuthed, patchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import { UriGymOfficialQrPanel } from "@/components/UriGymOfficialQrPanel";
import { isGymQrDatabaseCode, OFFICIAL_GYM_QR_ASSET_PATH } from "@/lib/gymQr";

type QrCodeRow = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  type: string;
  xp_reward: number;
  is_active: boolean;
  is_permanent: boolean;
  cooldown_hours: number;
  max_scans_per_day: number;
  expires_at: string | null;
  location_name: string | null;
  activity_name: string | null;
};

type QrScanLogRow = {
  id: string;
  scanned_at: string;
  xp_awarded: number;
  status: string;
  failure_reason: string | null;
  user_id: string;
  qr_codes?: { title?: string; code?: string; type?: string } | null;
};

const TYPE_OPTIONS = [
  { value: "permanent_location", label: "Permanent location" },
  { value: "event", label: "Event" },
  { value: "quest", label: "Quest" },
  { value: "tutoring", label: "Tutoring" },
  { value: "advising", label: "Advising" },
] as const;

export function QrCodeAdminCard() {
  const [codes, setCodes] = useState<QrCodeRow[]>([]);
  const [scans, setScans] = useState<QrScanLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [createdScanUrl, setCreatedScanUrl] = useState<string | null>(null);

  const [form, setForm] = useState({
    code: "",
    title: "",
    description: "",
    type: "permanent_location" as (typeof TYPE_OPTIONS)[number]["value"],
    locationName: "",
    activityName: "",
    xpReward: 10,
    isPermanent: true,
    cooldownHours: 24,
    maxScansPerDay: 1,
    expiresAt: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [codesRes, scansRes] = await Promise.all([
        fetchAuthed<{ codes: QrCodeRow[] }>("/api/internal/admin/qr-codes"),
        fetchAuthed<{ scans: QrScanLogRow[] }>("/api/internal/admin/qr-scans?limit=60"),
      ]);
      setCodes(codesRes.codes ?? []);
      setScans(scansRes.scans ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load QR admin data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setCreatedScanUrl(null);
    try {
      const created = await postAuthed<{ row: QrCodeRow; scanUrl: string }, Record<string, unknown>>(
        "/api/internal/admin/qr-codes",
        {
          code: form.code.trim() || undefined,
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          type: form.type,
          locationName: form.locationName.trim() || undefined,
          activityName: form.activityName.trim() || undefined,
          xpReward: form.xpReward,
          isPermanent: form.isPermanent,
          cooldownHours: form.cooldownHours,
          maxScansPerDay: form.maxScansPerDay,
          expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        },
      );
      setCreatedScanUrl(created.scanUrl);
      setForm((f) => ({ ...f, code: "", title: "", description: "", locationName: "", activityName: "" }));
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not create QR code.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row: QrCodeRow) {
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

  function qrImageUrl(id: string) {
    return `/api/internal/admin/qr-codes/${id}/image`;
  }

  return (
    <section className="card space-y-5 p-5">
      <div>
        <h2 className="text-lg font-display font-bold text-white">CQ QR Codes</h2>
        <p className="mt-1 text-sm text-white/70">
          URI Gym uses the official branded QR image below. Other codes get generated PNGs from database scan URLs (
          <code className="text-cyan-200">/scan?code=YOUR_CODE</code>).
        </p>
        <Link
          href="/internal/admin/qr/print"
          className="mt-2 inline-block text-sm font-medium text-uri-keaney underline-offset-2 hover:underline"
        >
          Open printable URI Gym sheet →
        </Link>
      </div>

      <UriGymOfficialQrPanel />

      {error ? (
        <p className="rounded-xl border border-rose-400/35 bg-rose-950/40 px-3 py-2 text-sm text-rose-100">{error}</p>
      ) : null}

      <form onSubmit={handleCreate} className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-white/80">Code (e.g. GYM)</span>
          <input
            className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 uppercase text-white"
            placeholder="GYM"
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
          />
        </label>
        <label className="block text-sm">
          <span className="text-white/80">Activity name</span>
          <input
            className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
            placeholder="Hitting the Gym"
            value={form.activityName}
            onChange={(e) => setForm((f) => ({ ...f, activityName: e.target.value }))}
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-white/80">Title</span>
          <input
            required
            className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-white/80">Description</span>
          <input
            className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </label>
        <label className="block text-sm">
          <span className="text-white/80">Type</span>
          <select
            className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
            value={form.type}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                type: e.target.value as (typeof TYPE_OPTIONS)[number]["value"],
                isPermanent: e.target.value === "permanent_location",
              }))
            }
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-white/80">Location name</span>
          <input
            className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
            value={form.locationName}
            onChange={(e) => setForm((f) => ({ ...f, locationName: e.target.value }))}
          />
        </label>
        <label className="block text-sm">
          <span className="text-white/80">XP reward</span>
          <input
            type="number"
            min={0}
            max={500}
            className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
            value={form.xpReward}
            onChange={(e) => setForm((f) => ({ ...f, xpReward: Number(e.target.value) }))}
          />
        </label>
        <label className="block text-sm">
          <span className="text-white/80">Cooldown (hours)</span>
          <input
            type="number"
            min={0}
            className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
            value={form.cooldownHours}
            onChange={(e) => setForm((f) => ({ ...f, cooldownHours: Number(e.target.value) }))}
          />
        </label>
        <label className="block text-sm">
          <span className="text-white/80">Max scans / day</span>
          <input
            type="number"
            min={0}
            className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
            value={form.maxScansPerDay}
            onChange={(e) => setForm((f) => ({ ...f, maxScansPerDay: Number(e.target.value) }))}
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-white/80">Expires at (optional)</span>
          <input
            type="datetime-local"
            className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
            value={form.expiresAt}
            onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
          />
        </label>
        <div className="sm:col-span-2">
          <button type="submit" disabled={busy} className="btn-primary px-4 py-2 text-sm disabled:opacity-60">
            {busy ? "Creating…" : "Create QR code"}
          </button>
        </div>
        {createdScanUrl ? (
          <p className="sm:col-span-2 text-sm text-cyan-200/95">
            Scan URL:{" "}
            <a href={createdScanUrl} className="underline break-all">
              {createdScanUrl}
            </a>
          </p>
        ) : null}
      </form>

      {loading ? (
        <p className="text-sm text-white/60">Loading QR codes…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="min-w-full text-left text-sm text-white/90">
            <thead className="bg-white/5 text-xs uppercase tracking-wide text-white/60">
              <tr>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">XP</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Preview / download</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((row) => (
                <tr key={row.id} className="border-t border-white/10">
                  <td className="px-3 py-2">
                    <div className="font-medium">{row.title}</div>
                    <div className="text-xs text-white/50">{row.code}</div>
                  </td>
                  <td className="px-3 py-2">{row.type}</td>
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
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                      <div className="shrink-0 rounded-lg bg-white p-1">
                        {row.code === "GYM" ? (
                          <Image
                            src={OFFICIAL_GYM_QR_ASSET_PATH}
                            alt="Official URI Gym QR (GYM)"
                            width={72}
                            height={72}
                            className="h-[72px] w-[72px]"
                            unoptimized
                          />
                        ) : isGymQrDatabaseCode(row.code) ? (
                          <Image
                            src={OFFICIAL_GYM_QR_ASSET_PATH}
                            alt={`Gym QR (${row.code})`}
                            width={72}
                            height={72}
                            className="h-[72px] w-[72px]"
                            unoptimized
                          />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={qrImageUrl(row.id)}
                            alt=""
                            width={72}
                            height={72}
                            className="h-[72px] w-[72px] object-contain"
                          />
                        )}
                      </div>
                      <div className="space-y-1 min-w-0">
                        <a
                          href={`/scan?code=${encodeURIComponent(row.code)}`}
                          className="block text-xs text-cyan-200/90 underline-offset-2 hover:underline"
                        >
                          /scan?code={row.code}
                        </a>
                        <a
                          href={isGymQrDatabaseCode(row.code) ? OFFICIAL_GYM_QR_ASSET_PATH : qrImageUrl(row.id)}
                          download={row.code === "GYM" ? "gym_qr.png" : undefined}
                          className="block text-uri-keaney underline-offset-2 hover:underline"
                        >
                          {row.code === "GYM" ? "Download gym_qr.png" : isGymQrDatabaseCode(row.code) ? "Download gym_qr.png" : "Download PNG"}
                        </a>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
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
    </section>
  );
}
