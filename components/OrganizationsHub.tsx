"use client";

import { FormEvent, useEffect, useState } from "react";
import { fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import { OrganizationAdminPortal } from "@/components/OrganizationAdminPortal";
import {
  ORGANIZATION_REQUEST_CATEGORIES,
  ORGANIZATION_REQUEST_CATEGORY_LABELS,
} from "@/lib/organizationRequestCategories";

type Organization = {
  id: string;
  name: string;
  description: string;
  category: string;
  logoUrl: string | null;
  schoolName: string;
  contactLink: string | null;
  memberCount: number;
  followerCount: number;
  isFollowing: boolean;
  myRole: "owner" | "admin" | "member" | null;
  myMembershipStatus: "pending" | "approved" | "denied" | null;
  requiresApproval: boolean;
  isFrozen: boolean;
  upcomingEvents: Array<{ id: string; title: string; startsAt: string; location: string }>;
};

type MyOrgCreationRequest = {
  id: string;
  schoolName: string;
  requestedName: string;
  requestedCategory: string;
  status: "pending" | "approved" | "denied";
  adminReason: string | null;
  createdOrganizationId: string | null;
  createdAt: string;
};

type RequestForm = {
  name: string;
  description: string;
  category: (typeof ORGANIZATION_REQUEST_CATEGORIES)[number] | "";
  logoUrl: string;
  contactLink: string;
};

const emptyRequestForm: RequestForm = {
  name: "",
  description: "",
  category: "",
  logoUrl: "",
  contactLink: "",
};

export function OrganizationsHub({
  personalization,
}: {
  personalization?: { schoolName?: string; interests?: string[]; discoveryFocus?: string[] } | null;
}) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [myRequests, setMyRequests] = useState<MyOrgCreationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reportingOrgId, setReportingOrgId] = useState<string | null>(null);
  const [form, setForm] = useState<RequestForm>(emptyRequestForm);
  const [activeOrg, setActiveOrg] = useState<Organization | null>(null);
  const [adminPortalOrg, setAdminPortalOrg] = useState<Organization | null>(null);

  async function loadMyRequests() {
    setRequestsLoading(true);
    try {
      const data = await fetchAuthed<{ requests: MyOrgCreationRequest[] }>("/api/organizations/creation-requests");
      setMyRequests(data.requests ?? []);
    } catch {
      setMyRequests([]);
    } finally {
      setRequestsLoading(false);
    }
  }

  useEffect(() => {
    void loadMyRequests();
  }, []);

  async function loadOrganizations(nextQuery = query) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (nextQuery.trim()) params.set("query", nextQuery.trim());
      const data = await fetchAuthed<{ organizations: Organization[] }>(
        `/api/organizations${params.toString() ? `?${params.toString()}` : ""}`,
      );
      setOrganizations(data.organizations ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load organizations.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadOrganizations(query);
    }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function handleSubmitOrganizationRequest(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    if (!form.category) {
      setError("Choose a category.");
      setSubmitting(false);
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        requestedName: form.name.trim(),
        requestedCategory: form.category,
        description: form.description.trim(),
      };
      if (form.logoUrl.trim()) payload.logoUrl = form.logoUrl.trim();
      if (form.contactLink.trim()) payload.contactLink = form.contactLink.trim();
      await postAuthed("/api/organizations/creation-requests", payload);
      setForm(emptyRequestForm);
      await Promise.all([loadOrganizations(query), loadMyRequests()]);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not submit request.");
    } finally {
      setSubmitting(false);
    }
  }

  async function openOrganizationById(organizationId: string) {
    setError(null);
    try {
      const data = await fetchAuthed<{ organization: Organization }>(`/api/organizations/${organizationId}`);
      setActiveOrg(data.organization);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load organization.");
    }
  }

  async function handleFollow(organizationId: string, role: "follower" | "member") {
    setError(null);
    try {
      await postAuthed(`/api/organizations/${organizationId}/follow`, { role });
      await loadOrganizations(query);
      if (activeOrg?.id === organizationId) {
        const updated = organizations.find((org) => org.id === organizationId);
        if (updated) setActiveOrg(updated);
      }
    } catch (followError) {
      setError(followError instanceof Error ? followError.message : "Could not update organization follow.");
    }
  }

  async function handleReportOrganization(organizationId: string) {
    const reasonInput = window.prompt("Reason (unsafe, harassment, scam, inappropriate, spam, other)", "unsafe") ?? "";
    const reason = reasonInput.trim().toLowerCase();
    if (!["unsafe", "harassment", "scam", "inappropriate", "spam", "other"].includes(reason)) {
      setError("Please provide a valid report reason.");
      return;
    }
    const details = window.prompt("Optional details for moderators", "") ?? "";
    setReportingOrgId(organizationId);
    setError(null);
    try {
      await postAuthed(`/api/organizations/${organizationId}/report`, {
        reason,
        details: details.trim() || undefined,
      });
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : "Could not report organization.");
    } finally {
      setReportingOrgId(null);
    }
  }

  const prioritizedOrganizations = [...organizations].sort((a, b) => {
    const interests = new Set((personalization?.interests ?? []).map((value) => value.toLowerCase()));
    const aMatch = interests.has(a.category.toLowerCase()) ? 0 : 1;
    const bMatch = interests.has(b.category.toLowerCase()) ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    return b.memberCount - a.memberCount;
  });

  function requestStatusBlock(r: MyOrgCreationRequest) {
    if (r.status === "pending") {
      return (
        <p className="text-xs text-amber-100/90 mt-1">
          Pending evaluation — CampusQuest will review this organization before it becomes visible.
        </p>
      );
    }
    if (r.status === "approved") {
      return (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-emerald-200/90">Approved — your organization has been created.</p>
          {r.createdOrganizationId ? (
            <button
              type="button"
              onClick={() => void openOrganizationById(r.createdOrganizationId!)}
              className="text-xs font-semibold text-uri-keaney underline"
            >
              Open your organization
            </button>
          ) : null}
        </div>
      );
    }
    return (
      <div className="mt-2 space-y-1">
        <p className="text-xs text-white/70">Not approved — review the feedback and submit again if appropriate.</p>
        {r.adminReason ? (
          <p className="text-xs text-amber-100/90 border border-amber-400/20 rounded-lg p-2 bg-amber-400/5">{r.adminReason}</p>
        ) : null}
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="card p-4 space-y-3">
        <h3 className="font-display font-semibold text-white">Student Organizations</h3>
        <p className="text-xs text-white/55">
          Showing organizations in your verified campus community{personalization?.schoolName ? ` (${personalization.schoolName})` : ""}.
        </p>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name or description"
          className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-sm text-white placeholder-white/50"
        />

        <div className="border-t border-white/10 pt-3 space-y-2">
          <h4 className="text-sm font-semibold text-white">Request New Organization</h4>
          <p className="text-[11px] text-white/50">
            Pilot safety: requests are reviewed before an org appears. You’ll get an in-app notification when your request is decided.
          </p>
          <form onSubmit={handleSubmitOrganizationRequest} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Requested organization name"
              className="rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-sm text-white placeholder-white/50 sm:col-span-2"
              required
            />
            <label className="sm:col-span-2 text-[11px] text-white/50">
              <span className="sr-only">Category</span>
              <select
                value={form.category}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, category: event.target.value as RequestForm["category"] }))
                }
                className="mt-1 w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-sm text-white"
                required
              >
                <option value="">Select category…</option>
                {ORGANIZATION_REQUEST_CATEGORIES.map((c) => (
                  <option key={c} value={c} className="bg-uri-navy">
                    {ORGANIZATION_REQUEST_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
            <input
              value={form.contactLink}
              onChange={(event) => setForm((prev) => ({ ...prev, contactLink: event.target.value }))}
              placeholder="Contact link (optional, URL)"
              className="rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-sm text-white placeholder-white/50 sm:col-span-2"
            />
            <input
              value={form.logoUrl}
              onChange={(event) => setForm((prev) => ({ ...prev, logoUrl: event.target.value }))}
              placeholder="Logo URL (optional)"
              className="rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-sm text-white placeholder-white/50 sm:col-span-2"
            />
            <textarea
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Description"
              rows={3}
              className="rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-sm text-white placeholder-white/50 sm:col-span-2"
              required
            />
            <button
              type="submit"
              disabled={submitting}
              className="sm:col-span-2 rounded-lg bg-uri-keaney text-uri-navy font-semibold py-2.5 text-sm disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Submit Organization Request"}
            </button>
          </form>
        </div>
      </div>

      <div className="card p-4 space-y-2">
        <h4 className="text-sm font-semibold text-white">Your organization requests</h4>
        {requestsLoading ? (
          <p className="text-xs text-white/50">Loading…</p>
        ) : myRequests.length === 0 ? (
          <p className="text-xs text-white/50">No requests yet.</p>
        ) : (
          <ul className="space-y-3">
            {myRequests.map((r) => (
              <li key={r.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="flex justify-between gap-2">
                  <p className="text-sm font-medium text-white">{r.requestedName}</p>
                  <span className="text-[10px] uppercase tracking-wide text-white/45">{r.status}</span>
                </div>
                <p className="text-[11px] text-white/45 mt-0.5">
                  {r.schoolName} · {ORGANIZATION_REQUEST_CATEGORY_LABELS[r.requestedCategory as keyof typeof ORGANIZATION_REQUEST_CATEGORY_LABELS] ?? r.requestedCategory}
                </p>
                <p className="text-[11px] text-white/35">Submitted {new Date(r.createdAt).toLocaleString()}</p>
                {requestStatusBlock(r)}
              </li>
            ))}
          </ul>
        )}
      </div>

      {error ? <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</div> : null}
      {loading ? (
        <div className="space-y-2">
          <div className="h-20 rounded-xl bg-white/10 animate-pulse" />
          <div className="h-20 rounded-xl bg-white/10 animate-pulse" />
        </div>
      ) : null}
      {!loading && organizations.length === 0 ? <p className="text-sm text-white/60">No organizations found yet.</p> : null}

      <div className="space-y-3">
        {prioritizedOrganizations.map((organization) => (
          <article key={organization.id} className="card p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-white font-semibold">{organization.name}</h4>
                <p className="text-xs text-white/60 mt-1">
                  {organization.schoolName} · {organization.category}
                </p>
              </div>
              <span className="text-[11px] rounded-full border border-uri-keaney/35 px-2 py-0.5 text-uri-keaney">
                {organization.memberCount} members · {organization.followerCount} followers
              </span>
            </div>
            <p className="text-sm text-white/75 line-clamp-2">{organization.description}</p>
            {organization.isFrozen ? (
              <p className="text-xs text-amber-200">This organization is temporarily frozen by moderation.</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleFollow(organization.id, "follower")}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
                  organization.isFollowing
                    ? "border-uri-keaney/50 text-uri-keaney bg-uri-keaney/15"
                    : "border-white/20 text-white/80 hover:bg-white/10"
                }`}
              >
                {organization.isFollowing ? "Following" : "Follow"}
              </button>
              <button
                type="button"
                onClick={() => void handleFollow(organization.id, "member")}
                disabled={organization.myMembershipStatus === "pending" || organization.myMembershipStatus === "approved"}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-uri-keaney/35 text-uri-keaney hover:bg-uri-keaney/10"
              >
                {organization.myMembershipStatus === "pending"
                  ? "Join requested"
                  : organization.myMembershipStatus === "approved" && organization.myRole
                    ? organization.myRole === "owner" || organization.myRole === "admin"
                      ? "Org admin"
                      : "Member"
                    : organization.requiresApproval
                      ? "Request to join"
                      : "Join"}
              </button>
              <button
                type="button"
                onClick={() => setActiveOrg(organization)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-white/20 text-white/80 hover:bg-white/10"
              >
                View organization
              </button>
              {organization.myRole === "owner" || organization.myRole === "admin" ? (
                <button
                  type="button"
                  onClick={() => setAdminPortalOrg(organization)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-emerald-400/35 text-emerald-200 hover:bg-emerald-500/10"
                >
                  Open admin portal
                </button>
              ) : null}
              <button
                type="button"
                disabled={reportingOrgId === organization.id}
                onClick={() => void handleReportOrganization(organization.id)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-rose-400/35 text-rose-200 hover:bg-rose-500/10 disabled:opacity-60"
              >
                {reportingOrgId === organization.id ? "Reporting..." : "Report organization"}
              </button>
            </div>
          </article>
        ))}
      </div>

      {activeOrg ? (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/65 p-3">
          <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-uri-navy p-5 space-y-3">
            <div className="flex justify-between gap-3">
              <h4 className="text-white text-lg font-semibold">{activeOrg.name}</h4>
              <button type="button" className="text-white/60 hover:text-white" onClick={() => setActiveOrg(null)}>
                ✕
              </button>
            </div>
            <p className="text-sm text-white/75">{activeOrg.description}</p>
            <p className="text-xs text-white/65">
              {activeOrg.schoolName} · {activeOrg.category} · {activeOrg.memberCount} members · {activeOrg.followerCount} followers
            </p>
            {activeOrg.contactLink ? (
              <a
                href={activeOrg.contactLink}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-xs text-uri-keaney hover:underline"
              >
                Contact / Learn more
              </a>
            ) : null}
            <div className="space-y-1">
              <p className="text-xs text-white/60">Upcoming events</p>
              {activeOrg.upcomingEvents.length === 0 ? (
                <p className="text-xs text-white/50">No upcoming events yet.</p>
              ) : (
                activeOrg.upcomingEvents.slice(0, 5).map((event) => (
                  <div key={event.id} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                    <p className="text-sm text-white">{event.title}</p>
                    <p className="text-xs text-white/60">
                      {new Date(event.startsAt).toLocaleString()} · {event.location}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
      {adminPortalOrg ? (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <p className="text-xs text-white/60">Managing {adminPortalOrg.name}</p>
            <button type="button" onClick={() => setAdminPortalOrg(null)} className="text-xs text-white/65 hover:text-white">
              Close portal
            </button>
          </div>
          <OrganizationAdminPortal organizationId={adminPortalOrg.id} organizationName={adminPortalOrg.name} />
        </div>
      ) : null}
    </section>
  );
}
