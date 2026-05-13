"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiRequestError, fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import { organizationRequestCategoryLabel } from "@/lib/organizationRequestCategories";

type OrgCreationRequest = {
  id: string;
  requesterId: string;
  schoolName: string;
  schoolDomain: string;
  requestedName: string;
  requestedCategory: string;
  contactLink: string | null;
  logoUrl: string | null;
  description: string;
  status: "pending" | "approved" | "denied";
  adminReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdOrganizationId: string | null;
  createdAt: string;
  updatedAt: string;
  requesterUsername: string | null;
  requesterDisplayName: string | null;
};

export function OrganizationCreationRequestsAdminCard() {
  const [requests, setRequests] = useState<OrgCreationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAuthed<{ requests: OrgCreationRequest[] }>("/api/internal/admin/organization-creation-requests");
      setRequests(data.requests ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load organization requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await postAuthed(`/api/internal/admin/organization-creation-requests/${id}/approve`, {});
      await load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : e instanceof Error ? e.message : "Approve failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function deny(id: string, adminReason: string) {
    setBusyId(id);
    setError(null);
    try {
      const denyBody: Record<string, unknown> = {};
      if (adminReason.trim()) denyBody.adminReason = adminReason.trim();
      await postAuthed(`/api/internal/admin/organization-creation-requests/${id}/deny`, denyBody);
      await load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : e instanceof Error ? e.message : "Deny failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display font-semibold text-white">Organization Creation Requests</h2>
          <p className="text-xs text-white/55 mt-1">
            Approve pilot student orgs or deny with feedback. Approved requests create the org and assign the owner.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-uri-keaney/40 text-uri-keaney hover:bg-uri-keaney/10 disabled:opacity-50"
        >
          {loading ? "…" : "Refresh"}
        </button>
      </div>
      {error ? <p className="text-xs text-rose-200">{error}</p> : null}
      {loading && requests.length === 0 ? (
        <p className="text-sm text-white/55">Loading…</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-white/55">No organization requests yet.</p>
      ) : (
        <ul className="space-y-4 max-h-[min(70vh,32rem)] overflow-y-auto divide-y divide-white/10">
          {requests.map((r) => (
            <li key={r.id} className="pt-4 first:pt-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-white">{r.requestedName}</p>
                  <p className="text-[11px] text-white/50">
                    @{r.requesterUsername ?? "?"} · {r.requesterDisplayName ?? "—"}
                  </p>
                </div>
                <span
                  className={`text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md border ${
                    r.status === "pending"
                      ? "border-amber-400/40 text-amber-200 bg-amber-400/10"
                      : r.status === "approved"
                        ? "border-emerald-400/35 text-emerald-200 bg-emerald-500/10"
                        : "border-white/15 text-white/60"
                  }`}
                >
                  {r.status}
                </span>
              </div>
              <p className="text-xs text-white/70">
                <span className="text-white/45">School:</span> {r.schoolName}{" "}
                <span className="text-white/40">({r.schoolDomain})</span>
              </p>
              <p className="text-xs text-white/70">
                <span className="text-white/45">Category:</span> {organizationRequestCategoryLabel(r.requestedCategory)}
              </p>
              <p className="text-xs text-white/75">{r.description}</p>
              {r.contactLink ? (
                <a href={r.contactLink} target="_blank" rel="noopener noreferrer" className="text-xs text-uri-keaney underline">
                  Contact link
                </a>
              ) : (
                <p className="text-[11px] text-white/40">No contact link</p>
              )}
              <p className="text-[11px] text-white/40">
                Submitted {new Date(r.createdAt).toLocaleString()}
                {r.reviewedAt ? ` · Reviewed ${new Date(r.reviewedAt).toLocaleString()}` : null}
              </p>
              {r.status !== "pending" && r.createdOrganizationId ? (
                <p className="text-[11px] text-emerald-200/90">Organization id: {r.createdOrganizationId}</p>
              ) : null}
              {r.status === "denied" && r.adminReason ? (
                <p className="text-xs text-amber-100/90 border border-amber-400/25 rounded-lg p-2 bg-amber-400/5">
                  Denial reason: {r.adminReason}
                </p>
              ) : null}
              {r.status === "pending" ? (
                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => void approve(r.id)}
                    className="px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-100 border border-emerald-400/40 hover:bg-emerald-500/30 disabled:opacity-50"
                  >
                    {busyId === r.id ? "Working…" : "Approve and create org"}
                  </button>
                  <DenyInline onDeny={(reason) => void deny(r.id, reason)} disabled={busyId === r.id} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DenyInline({ onDeny, disabled }: { onDeny: (reason: string) => void; disabled: boolean }) {
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="px-3 py-2 rounded-lg text-xs font-semibold border border-rose-400/40 text-rose-200 hover:bg-rose-500/10 disabled:opacity-50"
      >
        Deny with reason
      </button>
    );
  }
  return (
    <div className="flex-1 flex flex-col gap-2 min-w-0">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Optional reason shown to the student"
        rows={2}
        className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-xs text-white placeholder-white/40"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            onDeny(reason);
            setOpen(false);
            setReason("");
          }}
          className="px-3 py-2 rounded-lg text-xs font-semibold bg-rose-500/20 text-rose-100 border border-rose-400/40 disabled:opacity-50"
        >
          Confirm deny
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(false)}
          className="px-3 py-2 rounded-lg text-xs text-white/70 border border-white/15"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
