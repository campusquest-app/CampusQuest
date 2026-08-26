"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ApiRequestError, fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import { AdminPanel, AdminSectionIntro, AdminTabBar } from "@/components/admin/AdminUi";
import { IDENTITY_TYPE_LABELS, VERIFICATION_STATUS_LABELS, businessVerificationCategoryLabel } from "@/lib/identity/policy";
import { organizationRequestCategoryLabel } from "@/lib/organizationRequestCategories";
import type { VerificationRequestDetail, VerificationStatus } from "@/lib/identity/types";

type Tab = "pending_review" | "needs_info" | "approved" | "rejected";

export function AdminVerificationSection({ initialRequestId }: { initialRequestId?: string }) {
  const [tab, setTab] = useState<Tab>("pending_review");
  const [requests, setRequests] = useState<VerificationRequestDetail[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialRequestId ?? null);
  const [detail, setDetail] = useState<VerificationRequestDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [internalNotes, setInternalNotes] = useState("");
  const [applicantMessage, setApplicantMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAuthed<{ requests: VerificationRequestDetail[]; pendingCount: number }>(
        `/api/internal/admin/verification-requests?status=${tab}`,
      );
      setRequests(data.requests ?? []);
      setPendingCount(data.pendingCount ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load verification requests.");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    void fetchAuthed<{ request: VerificationRequestDetail }>(`/api/internal/admin/verification-requests/${selectedId}`)
      .then((data) => {
        if (!cancelled) {
          setDetail(data.request);
          setApplicantMessage(data.request.applicantStatusMessage ?? "");
          setInternalNotes(data.request.adminInternalNotes ?? "");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load this request.");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function review(action: "approve" | "reject" | "needs_info") {
    if (!selectedId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await postAuthed(`/api/internal/admin/verification-requests/${selectedId}/review`, {
        action,
        adminInternalNotes: internalNotes.trim() || null,
        applicantStatusMessage: applicantMessage.trim() || null,
      });
      setSelectedId(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : err instanceof Error ? err.message : "Review failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <AdminSectionIntro
        title="Verification Requests"
        description="Review Student Business and organization verification applications. Approval creates the identity once."
      />
      <AdminTabBar
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "pending_review", label: "Pending", badge: pendingCount },
          { id: "needs_info", label: "Needs Info" },
          { id: "approved", label: "Approved" },
          { id: "rejected", label: "Rejected" },
        ]}
      />
      {error ? <p className="text-sm text-rose-200">{error}</p> : null}
      {loading ? <p className="text-sm text-white/60">Loading requests…</p> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(280px,22rem)]">
        <AdminPanel>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-white/45">
                <tr>
                  <th className="pb-2 pr-3 font-medium">Applicant</th>
                  <th className="pb-2 pr-3 font-medium">Type</th>
                  <th className="pb-2 pr-3 font-medium">Name</th>
                  <th className="pb-2 pr-3 font-medium">Category</th>
                  <th className="pb-2 font-medium">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request.id}>
                    <td className="py-2 pr-3">
                      <button type="button" className="text-left text-uri-keaney hover:underline" onClick={() => setSelectedId(request.id)}>
                        {request.applicant.displayName || "Student"}
                        <span className="block text-[11px] text-white/45">@{request.applicant.username || "unknown"}</span>
                      </button>
                    </td>
                    <td className="py-2 pr-3 text-white/80">{IDENTITY_TYPE_LABELS[request.identityType]}</td>
                    <td className="py-2 pr-3 text-white">{request.name}</td>
                    <td className="py-2 pr-3 text-white/70">
                      {request.identityType === "student_business"
                        ? businessVerificationCategoryLabel(request.category)
                        : organizationRequestCategoryLabel(request.category)}
                    </td>
                    <td className="py-2 text-white/55">
                      {new Date(request.submittedAt ?? request.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && requests.length === 0 ? <p className="py-6 text-sm text-white/50">No requests in this tab.</p> : null}
          </div>
        </AdminPanel>

        {detail ? (
          <AdminPanel>
            <h3 className="font-display text-lg text-white">{detail.name}</h3>
            <p className="text-xs text-white/50">
              {IDENTITY_TYPE_LABELS[detail.identityType]} · {VERIFICATION_STATUS_LABELS[detail.status]}
            </p>
            {detail.logoUrl ? <img src={detail.logoUrl} alt="" className="mt-3 h-20 w-20 rounded-xl object-cover" /> : null}
            <dl className="mt-3 space-y-2 text-sm text-white/80">
              <div>
                <dt className="text-[11px] uppercase text-white/40">Applicant</dt>
                <dd>
                  {detail.applicant.displayName} (@{detail.applicant.username})
                  <br />
                  {detail.applicant.email || "Email on file"}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase text-white/40">Description</dt>
                <dd>{detail.description}</dd>
              </div>
              {detail.websiteUrl ? (
                <div>
                  <dt className="text-[11px] uppercase text-white/40">Website</dt>
                  <dd>
                    <a className="text-uri-keaney underline" href={detail.websiteUrl} target="_blank" rel="noreferrer">
                      {detail.websiteUrl}
                    </a>
                  </dd>
                </div>
              ) : null}
              {detail.socialUrl ? (
                <div>
                  <dt className="text-[11px] uppercase text-white/40">Social</dt>
                  <dd>
                    <a className="text-uri-keaney underline" href={detail.socialUrl} target="_blank" rel="noreferrer">
                      {detail.socialUrl}
                    </a>
                  </dd>
                </div>
              ) : null}
              {detail.urinvolvedUrl ? (
                <div>
                  <dt className="text-[11px] uppercase text-white/40">URInvolved</dt>
                  <dd>
                    <a className="text-uri-keaney underline" href={detail.urinvolvedUrl} target="_blank" rel="noreferrer">
                      {detail.urinvolvedUrl}
                    </a>
                  </dd>
                </div>
              ) : null}
              {detail.applicantRole ? (
                <div>
                  <dt className="text-[11px] uppercase text-white/40">Applicant role</dt>
                  <dd>{detail.applicantRole}</dd>
                </div>
              ) : null}
              {detail.reasonForAccess ? (
                <div>
                  <dt className="text-[11px] uppercase text-white/40">Reason</dt>
                  <dd>{detail.reasonForAccess}</dd>
                </div>
              ) : null}
            </dl>
            <label className="mt-3 block text-[11px] uppercase text-white/40">User-facing message</label>
            <textarea className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 p-2 text-sm" value={applicantMessage} onChange={(event) => setApplicantMessage(event.target.value)} />
            <label className="mt-3 block text-[11px] uppercase text-white/40">Internal notes</label>
            <textarea className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 p-2 text-sm" value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} />
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="cq-admin-action cq-admin-action--primary" disabled={busy} onClick={() => void review("approve")}>
                Approve
              </button>
              <button type="button" className="cq-admin-action" disabled={busy} onClick={() => void review("needs_info")}>
                Request More Info
              </button>
              <button type="button" className="cq-admin-action cq-admin-action--danger" disabled={busy} onClick={() => void review("reject")}>
                Reject
              </button>
            </div>
            <Link href={`/internal/admin/verification/${selectedId}`} className="mt-3 inline-block text-xs text-white/45">
              Open dedicated review URL
            </Link>
          </AdminPanel>
        ) : null}
      </div>
    </div>
  );
}
