"use client";

import { FormEvent, useEffect, useState } from "react";
import { fetchAuthed, postAuthed, deleteAuthed } from "@/lib/client/dashboardApi";
import { OrganizationAdminPortal } from "@/components/OrganizationAdminPortal";
import {
  ORGANIZATION_REQUEST_CATEGORIES,
  ORGANIZATION_REQUEST_CATEGORY_LABELS,
  organizationRequestCategoryLabel,
  type OrganizationRequestCategory,
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
  myMembershipKind: "follower" | "member" | null;
  myRole: "owner" | "admin" | "member" | null;
  myMembershipStatus: "pending" | "approved" | "denied" | null;
  requiresApproval: boolean;
  isFrozen: boolean;
  upcomingEvents: Array<{ id: string; title: string; startsAt: string; location: string }>;
};

type ExternalOrganization = {
  id: string;
  name: string;
  description: string;
  category: string | null;
  logoUrl: string | null;
  organizationUrl: string | null;
  tags: string[];
  imported: true;
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
  /** UI only: when `url`, show URL field */
  contactLinkMode: "none" | "url";
  logoUrlMode: "none" | "url";
};

const emptyRequestForm: RequestForm = {
  name: "",
  description: "",
  category: "",
  logoUrl: "",
  contactLink: "",
  contactLinkMode: "none",
  logoUrlMode: "none",
};

/** Shared field chrome so selects, URL fields, and text areas match the org category dropdown. */
const ORG_REQ_SELECT_CLASS =
  "w-full appearance-none rounded-lg border border-white/20 bg-black/25 px-3 py-2.5 pr-10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-uri-keaney/40";
const ORG_REQ_INPUT_CLASS =
  "w-full rounded-lg border border-white/20 bg-black/25 px-3 py-2.5 text-sm text-white placeholder:text-white/45 focus:outline-none focus:ring-2 focus:ring-uri-keaney/40";
const ORG_REQ_TEXTAREA_CLASS = `${ORG_REQ_INPUT_CLASS} min-h-[5.5rem] resize-y`;

function ChevronDownIcon() {
  return (
    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/45" aria-hidden>
      ▾
    </span>
  );
}

export function OrganizationsHub({
  personalization,
}: {
  personalization?: { schoolName?: string; interests?: string[]; discoveryFocus?: string[] } | null;
}) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [externalOrganizations, setExternalOrganizations] = useState<ExternalOrganization[]>([]);
  const [activeExternalOrg, setActiveExternalOrg] = useState<ExternalOrganization | null>(null);
  const [myRequests, setMyRequests] = useState<MyOrgCreationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"" | OrganizationRequestCategory>("");
  const [submitting, setSubmitting] = useState(false);
  const [reportingOrgId, setReportingOrgId] = useState<string | null>(null);
  const [form, setForm] = useState<RequestForm>(emptyRequestForm);
  const [requestNewOrgOpen, setRequestNewOrgOpen] = useState(false);
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

  async function loadOrganizations() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("query", query.trim());
      if (categoryFilter) params.set("category", categoryFilter);
      const externalParams = new URLSearchParams();
      if (query.trim()) externalParams.set("query", query.trim());
      if (categoryFilter) externalParams.set("category", categoryFilter);

      const [campusResult, externalResult] = await Promise.allSettled([
        fetchAuthed<{ organizations: Organization[] }>(
          `/api/organizations${params.toString() ? `?${params.toString()}` : ""}`,
        ),
        fetchAuthed<{ organizations: ExternalOrganization[] }>(
          `/api/external/organizations${externalParams.toString() ? `?${externalParams.toString()}` : ""}`,
        ),
      ]);

      if (campusResult.status === "fulfilled") {
        setOrganizations(campusResult.value.organizations ?? []);
      } else {
        setOrganizations([]);
        setError(
          campusResult.reason instanceof Error ? campusResult.reason.message : "Could not load organizations.",
        );
      }

      if (externalResult.status === "fulfilled") {
        setExternalOrganizations(externalResult.value.organizations ?? []);
      } else {
        setExternalOrganizations([]);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load organizations.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadOrganizations();
    }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, categoryFilter]);

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
      if (form.logoUrlMode === "url" && form.logoUrl.trim()) payload.logoUrl = form.logoUrl.trim();
      if (form.contactLinkMode === "url" && form.contactLink.trim()) payload.contactLink = form.contactLink.trim();
      await postAuthed("/api/organizations/creation-requests", payload);
      setForm(emptyRequestForm);
      setRequestNewOrgOpen(false);
      await Promise.all([loadOrganizations(), loadMyRequests()]);
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

  async function syncModalOrgIfOpen(organizationId: string) {
    try {
      const data = await fetchAuthed<{ organization: Organization }>(`/api/organizations/${organizationId}`);
      setActiveOrg((prev) => (prev?.id === organizationId ? data.organization : prev));
    } catch {
      /* modal state stays on previous snapshot */
    }
  }

  async function handleFollow(organizationId: string, role: "follower" | "member") {
    setError(null);
    try {
      await postAuthed(`/api/organizations/${organizationId}/follow`, { role });
      await loadOrganizations();
      await syncModalOrgIfOpen(organizationId);
    } catch (followError) {
      setError(followError instanceof Error ? followError.message : "Could not update organization follow.");
    }
  }

  async function handleUnfollow(organizationId: string) {
    setError(null);
    try {
      await deleteAuthed(`/api/organizations/${organizationId}/follow`);
      await loadOrganizations();
      await syncModalOrgIfOpen(organizationId);
    } catch (unfollowError) {
      setError(unfollowError instanceof Error ? unfollowError.message : "Could not unfollow organization.");
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

  const prioritizedExternalOrganizations = [...externalOrganizations].sort((a, b) => {
    const interests = new Set((personalization?.interests ?? []).map((value) => value.toLowerCase()));
    const aCategory = (a.category ?? "").toLowerCase();
    const bCategory = (b.category ?? "").toLowerCase();
    const aMatch = interests.has(aCategory) ? 0 : 1;
    const bMatch = interests.has(bCategory) ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    return a.name.localeCompare(b.name);
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <label htmlFor="org-hub-search" className="text-[11px] text-white/50">
              Search
            </label>
            <input
              id="org-hub-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name or description"
              className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-sm text-white placeholder-white/50"
            />
          </div>
          <div className="shrink-0 space-y-1 sm:w-52">
            <label htmlFor="org-hub-category" className="text-[11px] text-white/50">
              Category
            </label>
            <div className="relative">
              <select
                id="org-hub-category"
                value={categoryFilter}
                onChange={(event) =>
                  setCategoryFilter(event.target.value as "" | OrganizationRequestCategory)
                }
                className={ORG_REQ_SELECT_CLASS}
              >
                <option value="" className="bg-uri-navy text-white">
                  All categories
                </option>
                {ORGANIZATION_REQUEST_CATEGORIES.map((c) => (
                  <option key={c} value={c} className="bg-uri-navy text-white">
                    {ORGANIZATION_REQUEST_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
              <ChevronDownIcon />
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 pt-3">
          <button
            type="button"
            id="request-new-org-trigger"
            aria-expanded={requestNewOrgOpen}
            aria-controls="request-new-org-panel"
            onClick={() => setRequestNewOrgOpen((open) => !open)}
            className={`flex w-full items-center justify-between gap-2 rounded-lg border border-white/20 bg-black/25 px-3 py-2.5 text-left transition-colors hover:border-uri-keaney/35 hover:bg-black/35 focus:outline-none focus:ring-2 focus:ring-uri-keaney/40 ${requestNewOrgOpen ? "border-uri-keaney/40" : ""}`}
          >
            <span className="text-sm font-semibold text-white">Request New Organization</span>
            <span
              className={`shrink-0 text-xs text-white/50 transition-transform ${requestNewOrgOpen ? "-rotate-180" : ""}`}
              aria-hidden
            >
              ▾
            </span>
          </button>

          <div
            id="request-new-org-panel"
            role="region"
            aria-labelledby="request-new-org-trigger"
            hidden={!requestNewOrgOpen}
            className="mt-3 space-y-2"
          >
            <p className="text-[11px] text-white/50">
              Pilot safety: requests are reviewed before an org appears. You’ll get an in-app notification when your request is
              decided.
            </p>
          <form onSubmit={handleSubmitOrganizationRequest} className="flex flex-col gap-3">
            <div className="space-y-1">
              <label htmlFor="org-req-name" className="text-[11px] text-white/50">
                Organization name
              </label>
              <input
                id="org-req-name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="e.g. URI Chess Club"
                className={ORG_REQ_INPUT_CLASS}
                required
                autoComplete="organization"
              />
            </div>

            <div className="space-y-1">
              <span id="org-req-category-label" className="text-[11px] text-white/50">
                Category
              </span>
              <div className="relative">
                <select
                  id="org-req-category"
                  aria-labelledby="org-req-category-label"
                  value={form.category}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, category: event.target.value as RequestForm["category"] }))
                  }
                  className={ORG_REQ_SELECT_CLASS}
                  required
                >
                  <option value="">Select category…</option>
                  {ORGANIZATION_REQUEST_CATEGORIES.map((c) => (
                    <option key={c} value={c} className="bg-uri-navy text-white">
                      {ORGANIZATION_REQUEST_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
                <ChevronDownIcon />
              </div>
            </div>

            <div className="space-y-1">
              <span id="org-req-contact-label" className="text-[11px] text-white/50">
                Contact link
              </span>
              <div className="relative">
                <select
                  id="org-req-contact-mode"
                  aria-labelledby="org-req-contact-label"
                  value={form.contactLinkMode}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      contactLinkMode: event.target.value as RequestForm["contactLinkMode"],
                      ...(event.target.value === "none" ? { contactLink: "" } : {}),
                    }))
                  }
                  className={ORG_REQ_SELECT_CLASS}
                >
                  <option value="none">No contact link</option>
                  <option value="url">Add a website or social URL…</option>
                </select>
                <ChevronDownIcon />
              </div>
              {form.contactLinkMode === "url" ? (
                <input
                  value={form.contactLink}
                  onChange={(event) => setForm((prev) => ({ ...prev, contactLink: event.target.value }))}
                  placeholder="https://…"
                  type="url"
                  className={ORG_REQ_INPUT_CLASS}
                  inputMode="url"
                />
              ) : null}
            </div>

            <div className="space-y-1">
              <span id="org-req-logo-label" className="text-[11px] text-white/50">
                Logo
              </span>
              <div className="relative">
                <select
                  id="org-req-logo-mode"
                  aria-labelledby="org-req-logo-label"
                  value={form.logoUrlMode}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      logoUrlMode: event.target.value as RequestForm["logoUrlMode"],
                      ...(event.target.value === "none" ? { logoUrl: "" } : {}),
                    }))
                  }
                  className={ORG_REQ_SELECT_CLASS}
                >
                  <option value="none">No logo</option>
                  <option value="url">Add logo image URL…</option>
                </select>
                <ChevronDownIcon />
              </div>
              {form.logoUrlMode === "url" ? (
                <input
                  value={form.logoUrl}
                  onChange={(event) => setForm((prev) => ({ ...prev, logoUrl: event.target.value }))}
                  placeholder="https://… (image URL)"
                  type="url"
                  className={ORG_REQ_INPUT_CLASS}
                  inputMode="url"
                />
              ) : null}
            </div>

            <div className="space-y-1">
              <label htmlFor="org-req-description" className="text-[11px] text-white/50">
                Description
              </label>
              <textarea
                id="org-req-description"
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="What does this organization do? Who is it for?"
                rows={4}
                className={ORG_REQ_TEXTAREA_CLASS}
                required
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-uri-keaney text-uri-navy font-semibold py-2.5 text-sm disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Submit Organization Request"}
            </button>
          </form>

            <div className="border-t border-white/15 pt-4 mt-4 space-y-2">
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
                        {r.schoolName} · {organizationRequestCategoryLabel(r.requestedCategory)}
                      </p>
                      <p className="text-[11px] text-white/35">Submitted {new Date(r.createdAt).toLocaleString()}</p>
                      {requestStatusBlock(r)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</div> : null}
      {loading ? (
        <div className="space-y-2">
          <div className="h-20 rounded-xl bg-white/10 animate-pulse" />
          <div className="h-20 rounded-xl bg-white/10 animate-pulse" />
        </div>
      ) : null}
      {!loading && organizations.length === 0 && externalOrganizations.length === 0 ? (
        <p className="text-sm text-white/60">
          {query.trim() || categoryFilter
            ? "No organizations match your search or category."
            : "No organizations found yet."}
        </p>
      ) : null}

      <div className="space-y-3">
        {prioritizedOrganizations.map((organization) => (
          <article key={organization.id} className="card p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-white font-semibold">{organization.name}</h4>
                <p className="text-xs text-white/60 mt-1">
                  {organization.schoolName} · {organizationRequestCategoryLabel(organization.category)}
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
              {organization.myMembershipStatus === "approved" && organization.myMembershipKind === "member" ? null : (
                <button
                  type="button"
                  onClick={() =>
                    organization.myMembershipKind === "follower"
                      ? void handleUnfollow(organization.id)
                      : void handleFollow(organization.id, "follower")
                  }
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
                    organization.myMembershipKind === "follower"
                      ? "border-white/25 text-white/90 hover:bg-white/10"
                      : "border-white/20 text-white/80 hover:bg-white/10"
                  }`}
                >
                  {organization.myMembershipKind === "follower" ? "Unfollow" : "Follow"}
                </button>
              )}
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
        {prioritizedExternalOrganizations.map((organization) => (
          <article key={`ext-${organization.id}`} className="card p-4 space-y-2 border border-cyan-400/15">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="text-white font-semibold">{organization.name}</h4>
                <p className="text-xs text-white/60 mt-1">
                  {organization.category ? organization.category : "URI organization"}
                </p>
              </div>
              <span className="text-[10px] text-cyan-200/80 flex-shrink-0">Source: URInvolved</span>
            </div>
            {organization.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={organization.logoUrl} alt="" className="h-12 w-12 rounded-lg object-cover border border-white/10" />
            ) : null}
            <p className="text-sm text-white/75 line-clamp-3">{organization.description}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveExternalOrg(organization)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-white/20 text-white/80 hover:bg-white/10"
              >
                View organization
              </button>
              {organization.organizationUrl ? (
                <a
                  href={organization.organizationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-cyan-400/35 text-cyan-200 hover:bg-cyan-500/10"
                >
                  View on URInvolved
                </a>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      <p className="text-[11px] text-white/40 leading-relaxed pt-2">
        Organization information sourced from URInvolved, URI&apos;s official student involvement platform.
        CampusQuest helps students discover opportunities and sends them back to URInvolved as the official source.
      </p>

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
              {activeOrg.schoolName} · {organizationRequestCategoryLabel(activeOrg.category)} · {activeOrg.memberCount} members · {activeOrg.followerCount} followers
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
      {activeExternalOrg ? (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/65 p-3">
          <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-uri-navy p-5 space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between gap-3">
              <h4 className="text-white text-lg font-semibold">{activeExternalOrg.name}</h4>
              <button type="button" className="text-white/60 hover:text-white" onClick={() => setActiveExternalOrg(null)}>
                ✕
              </button>
            </div>
            {activeExternalOrg.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={activeExternalOrg.logoUrl} alt="" className="h-16 w-16 rounded-lg object-cover border border-white/10" />
            ) : null}
            <p className="text-sm text-white/75">{activeExternalOrg.description}</p>
            {activeExternalOrg.category ? (
              <p className="text-xs text-white/65">{activeExternalOrg.category}</p>
            ) : null}
            {activeExternalOrg.tags.length > 0 ? (
              <p className="text-xs text-white/50">{activeExternalOrg.tags.join(" · ")}</p>
            ) : null}
            <p className="text-xs text-cyan-200/80">Source: URInvolved</p>
            {activeExternalOrg.organizationUrl ? (
              <a
                href={activeExternalOrg.organizationUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex px-3 py-2 rounded-lg text-xs font-semibold border border-cyan-400/35 text-cyan-200 hover:bg-cyan-500/10"
              >
                View on URInvolved
              </a>
            ) : null}
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
