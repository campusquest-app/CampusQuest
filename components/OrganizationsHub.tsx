"use client";

import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { fetchAuthed, postAuthed, deleteAuthed } from "@/lib/client/dashboardApi";
import {
  ExternalEventLocationDetail,
  ExternalEventLocationDisplay,
} from "@/components/ExternalEventLocationDisplay";
import { isUpcomingEvent } from "@/lib/client/eventsFeedFilters";
import { OrganizationAdminPortal } from "@/components/OrganizationAdminPortal";
import { ScreenDataState } from "@/components/ui/ScreenDataState";
import { ScreenBackHeader } from "@/components/ui/BackButton";
import {
  ORGANIZATION_REQUEST_CATEGORIES,
  ORGANIZATION_REQUEST_CATEGORY_LABELS,
  organizationRequestCategoryLabel,
} from "@/lib/organizationRequestCategories";
import {
  ORG_BROWSE_FILTERS,
  classifyOrganizationBucket,
  orgBrowseFilterLabel,
  type OrgBrowseFilterId,
} from "@/lib/organizationBrowseFilters";
import { TaggedEntityPostsSection } from "@/components/quad/TaggedEntityPostsSection";

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
  createdAt?: string | null;
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
  createdAt?: string | null;
  imported: true;
};

type ExternalEventItem = {
  id: string;
  title: string;
  description: string;
  category: string;
  location: string | null;
  venueName: string | null;
  address: string | null;
  startsAt: string | null;
  endsAt: string | null;
  organizationName: string | null;
  imageUrl: string | null;
  eventUrl: string | null;
  tags: string[];
  imported: true;
};

function externalEventMatchesOrganization(eventOrgName: string | null, orgName: string): boolean {
  const normalizedOrg = orgName.trim().toLowerCase();
  if (!normalizedOrg) return false;
  const raw = (eventOrgName ?? "").trim().toLowerCase();
  if (!raw) return false;
  if (raw === normalizedOrg) return true;
  return raw.split(",").some((part) => part.trim() === normalizedOrg);
}

function formatExternalEventDateTime(startsAt: string | null): { date: string; time: string } {
  if (!startsAt) return { date: "Date TBA", time: "" };
  const start = new Date(startsAt);
  return {
    date: start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
    time: start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
  };
}

function OrgHubModalOverlay({
  open,
  onClose,
  ariaLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="cq-org-hub-overlay fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/75 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close dialog"
      />
      {children}
    </div>,
    document.body,
  );
}

function OrgHubModalPanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="cq-org-hub-modal relative z-10 flex w-full max-w-lg max-h-[min(88vh,720px)] flex-col overflow-hidden rounded-2xl border border-white/12 bg-[#0a0a0a] shadow-[0_24px_80px_rgba(0,0,0,0.72)]"
      onClick={(event) => event.stopPropagation()}
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-4 py-3.5 sm:px-5">
        <h4 className="min-w-0 pr-2 text-base font-semibold leading-snug text-white sm:text-lg">{title}</h4>
        <button
          type="button"
          onClick={onClose}
          className="cq-org-hub-modal-close flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
          aria-label="Close"
        >
          <X className="h-5 w-5" strokeWidth={1.75} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 sm:px-5" data-cq-scroll-root>{children}</div>
    </div>
  );
}

type HubOrganization =
  | { kind: "campus"; organization: Organization; bucket: OrgBrowseFilterId }
  | { kind: "external"; organization: ExternalOrganization; bucket: OrgBrowseFilterId };

type OrgSortMode = "az" | "za" | "recent" | "active";

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
  onBack,
}: {
  personalization?: { schoolName?: string; interests?: string[]; discoveryFocus?: string[] } | null;
  onBack?: () => void;
}) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [externalOrganizations, setExternalOrganizations] = useState<ExternalOrganization[]>([]);
  const [externalEvents, setExternalEvents] = useState<ExternalEventItem[]>([]);
  const [activeExternalOrg, setActiveExternalOrg] = useState<ExternalOrganization | null>(null);
  const [activeExternalEvent, setActiveExternalEvent] = useState<ExternalEventItem | null>(null);
  const [myRequests, setMyRequests] = useState<MyOrgCreationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filterBucket, setFilterBucket] = useState<OrgBrowseFilterId>("all");
  const [sortMode, setSortMode] = useState<OrgSortMode>("az");
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
      // Load everything once — search/filter/sort run client-side for instant response.
      const [campusResult, externalResult, externalEventsResult] = await Promise.allSettled([
        fetchAuthed<{ organizations: Organization[] }>("/api/organizations"),
        fetchAuthed<{ organizations: ExternalOrganization[] }>("/api/external/organizations"),
        fetchAuthed<{ events: ExternalEventItem[] }>("/api/external/events"),
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

      if (externalEventsResult.status === "fulfilled") {
        setExternalEvents(externalEventsResult.value.events ?? []);
      } else {
        setExternalEvents([]);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load organizations.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrganizations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loading) return;
    let orgId: string | null = null;
    try {
      orgId = window.sessionStorage.getItem("cq_open_org_id");
      if (orgId) window.sessionStorage.removeItem("cq_open_org_id");
    } catch {
      return;
    }
    if (!orgId) return;
    void openOrganizationById(orgId);
    // openOrganizationById is stable enough for one-shot deep link after load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, organizations]);

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

  // Campus + URInvolved orgs merged, classified into URInvolved-style buckets.
  const mergedOrganizations = useMemo<HubOrganization[]>(
    () => [
      ...organizations.map((organization) => ({
        kind: "campus" as const,
        organization,
        bucket: classifyOrganizationBucket({
          campusCategorySlug: organization.category,
          category: organizationRequestCategoryLabel(organization.category),
          name: organization.name,
        }),
      })),
      ...externalOrganizations.map((organization) => ({
        kind: "external" as const,
        organization,
        bucket: classifyOrganizationBucket({
          category: organization.category,
          tags: organization.tags,
          name: organization.name,
        }),
      })),
    ],
    [organizations, externalOrganizations],
  );

  const activeExternalOrgEvents = useMemo(() => {
    if (!activeExternalOrg) return [];
    return externalEvents
      .filter(
        (event) =>
          isUpcomingEvent(event.startsAt) &&
          externalEventMatchesOrganization(event.organizationName, activeExternalOrg.name),
      )
      .sort((a, b) => {
        const aTime = a.startsAt ? new Date(a.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.startsAt ? new Date(b.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      });
  }, [activeExternalOrg, externalEvents]);

  function closeExternalOrgModal() {
    setActiveExternalOrg(null);
    setActiveExternalEvent(null);
  }

  function openExternalOrgEvents(organization: ExternalOrganization) {
    setActiveExternalEvent(null);
    setActiveExternalOrg(organization);
  }

  const hasActivityData = useMemo(
    () => organizations.some((org) => org.memberCount + org.followerCount > 0),
    [organizations],
  );
  const hasRecencyData = useMemo(
    () => mergedOrganizations.some((item) => Boolean(item.organization.createdAt)),
    [mergedOrganizations],
  );

  // Instant client-side search + filter + sort.
  const allOrganizations = useMemo<HubOrganization[]>(() => {
    const q = query.trim().toLowerCase();
    const matchesSearch = (item: HubOrganization): boolean => {
      if (!q) return true;
      const org = item.organization;
      const rawCategory =
        item.kind === "campus" ? organizationRequestCategoryLabel(org.category ?? "") : org.category ?? "";
      const tags = item.kind === "external" ? item.organization.tags : [];
      const haystack = [org.name, rawCategory, orgBrowseFilterLabel(item.bucket), org.description, ...tags]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    };

    const filtered = mergedOrganizations.filter(
      (item) => matchesSearch(item) && (filterBucket === "all" || item.bucket === filterBucket),
    );

    const byName = (a: HubOrganization, b: HubOrganization) =>
      a.organization.name.localeCompare(b.organization.name);

    return filtered.sort((a, b) => {
      if (sortMode === "za") return byName(b, a);
      if (sortMode === "recent") {
        const aTime = a.organization.createdAt ? new Date(a.organization.createdAt).getTime() : 0;
        const bTime = b.organization.createdAt ? new Date(b.organization.createdAt).getTime() : 0;
        if (aTime !== bTime) return bTime - aTime;
        return byName(a, b);
      }
      if (sortMode === "active") {
        const activity = (item: HubOrganization) =>
          item.kind === "campus" ? item.organization.memberCount + item.organization.followerCount : -1;
        const diff = activity(b) - activity(a);
        if (diff !== 0) return diff;
        return byName(a, b);
      }
      return byName(a, b);
    });
  }, [mergedOrganizations, query, filterBucket, sortMode]);

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
      {onBack ? <ScreenBackHeader title="Organizations" onBack={onBack} /> : null}
      <div className="card p-4 space-y-3">
        <h3 className="font-display font-semibold text-white">Student Organizations</h3>
        <p className="text-xs text-white/55">
          Showing organizations in your verified campus community{personalization?.schoolName ? ` (${personalization.schoolName})` : ""}.
        </p>
        <div className="space-y-2">
          <label htmlFor="org-hub-search" className="sr-only">
            Search organizations
          </label>
          <input
            id="org-hub-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, category, description, or tags"
            className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2.5 text-sm text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-uri-keaney/40"
          />

          <div className="-mx-4 overflow-x-auto px-4 cq-org-filter-scroll" role="tablist" aria-label="Organization categories" data-cq-gesture-block="swipe-tab">
            <div className="flex w-max gap-1.5 pb-1">
              {ORG_BROWSE_FILTERS.map((filter) => {
                const selected = filterBucket === filter.id;
                return (
                  <button
                    key={filter.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setFilterBucket(filter.id)}
                    className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors touch-manipulation ${
                      selected
                        ? "border-uri-keaney/60 bg-uri-keaney/20 text-uri-keaney"
                        : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-white/45">
              {loading ? "Loading…" : `${allOrganizations.length} organization${allOrganizations.length === 1 ? "" : "s"}`}
            </p>
            <div className="relative w-40">
              <label htmlFor="org-hub-sort" className="sr-only">
                Sort organizations
              </label>
              <select
                id="org-hub-sort"
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as OrgSortMode)}
                className="w-full appearance-none rounded-lg border border-white/20 bg-black/25 px-3 py-1.5 pr-8 text-xs text-white focus:outline-none focus:ring-2 focus:ring-uri-keaney/40"
              >
                <option value="az" className="bg-uri-navy text-white">A–Z</option>
                <option value="za" className="bg-uri-navy text-white">Z–A</option>
                {hasRecencyData ? (
                  <option value="recent" className="bg-uri-navy text-white">Recently Added</option>
                ) : null}
                {hasActivityData ? (
                  <option value="active" className="bg-uri-navy text-white">Most Active</option>
                ) : null}
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
              Safety: requests are reviewed before an org appears. You’ll get an in-app notification when your request is
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

      {error ? (
        <ScreenDataState
          variant="error"
          message="Could not load organizations."
          detail={error}
          onRetry={() => void loadOrganizations()}
          compact
        />
      ) : null}
      {loading ? (
        <div className="space-y-2">
          <div className="h-20 rounded-xl bg-white/10 animate-pulse" />
          <div className="h-20 rounded-xl bg-white/10 animate-pulse" />
        </div>
      ) : null}
      {!loading && !error && allOrganizations.length === 0 ? (
        <ScreenDataState
          variant="empty"
          message="No organizations found."
          detail="Try changing your search or filter, or submit a new organization request."
          compact
        />
      ) : null}

      <div className="space-y-3">
        {allOrganizations.map((item) =>
          item.kind === "external" ? (
            <article key={`ext-${item.organization.id}`} className="card p-4 space-y-2 border border-cyan-400/15">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-white font-semibold">{item.organization.name}</h4>
                  <p className="text-xs text-white/60 mt-1">
                    {item.organization.category ?? orgBrowseFilterLabel(item.bucket)}
                  </p>
                </div>
                <span className="text-[10px] text-cyan-200/80 flex-shrink-0">Source: URInvolved</span>
              </div>
              {item.organization.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.organization.logoUrl} alt="" className="h-12 w-12 rounded-lg object-cover border border-white/10" />
              ) : null}
              <p className="text-sm text-white/75 line-clamp-3">{item.organization.description}</p>
              {item.organization.tags.length > 0 ? (
                <p className="text-xs text-white/50">{item.organization.tags.join(" · ")}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openExternalOrgEvents(item.organization)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-uri-keaney/35 text-uri-keaney hover:bg-uri-keaney/10"
                >
                  View Events
                </button>
              </div>
            </article>
          ) : (
            <article key={item.organization.id} className="card p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-white font-semibold">{item.organization.name}</h4>
                  <p className="text-xs text-white/60 mt-1">
                    {item.organization.schoolName} · {organizationRequestCategoryLabel(item.organization.category)}
                  </p>
                </div>
                <span className="text-[11px] rounded-full border border-uri-keaney/35 px-2 py-0.5 text-uri-keaney">
                  {item.organization.memberCount} members · {item.organization.followerCount} followers
                </span>
              </div>
              <p className="text-sm text-white/75 line-clamp-2">{item.organization.description}</p>
              {item.organization.isFrozen ? (
                <p className="text-xs text-amber-200">This organization is temporarily frozen by moderation.</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {item.organization.myMembershipStatus === "approved" && item.organization.myMembershipKind === "member" ? null : (
                  <button
                    type="button"
                    onClick={() =>
                      item.organization.myMembershipKind === "follower"
                        ? void handleUnfollow(item.organization.id)
                        : void handleFollow(item.organization.id, "follower")
                    }
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
                      item.organization.myMembershipKind === "follower"
                        ? "border-white/25 text-white/90 hover:bg-white/10"
                        : "border-white/20 text-white/80 hover:bg-white/10"
                    }`}
                  >
                    {item.organization.myMembershipKind === "follower" ? "Unfollow" : "Follow"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleFollow(item.organization.id, "member")}
                  disabled={item.organization.myMembershipStatus === "pending" || item.organization.myMembershipStatus === "approved"}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-uri-keaney/35 text-uri-keaney hover:bg-uri-keaney/10"
                >
                  {item.organization.myMembershipStatus === "pending"
                    ? "Join requested"
                    : item.organization.myMembershipStatus === "approved" && item.organization.myRole
                      ? item.organization.myRole === "owner" || item.organization.myRole === "admin"
                        ? "Org admin"
                        : "Member"
                      : item.organization.requiresApproval
                        ? "Request to join"
                        : "Join"}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveOrg(item.organization)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-white/20 text-white/80 hover:bg-white/10"
                >
                  View organization
                </button>
                {item.organization.myRole === "owner" || item.organization.myRole === "admin" ? (
                  <button
                    type="button"
                    onClick={() => setAdminPortalOrg(item.organization)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-emerald-400/35 text-emerald-200 hover:bg-emerald-500/10"
                  >
                    Open admin portal
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={reportingOrgId === item.organization.id}
                  onClick={() => void handleReportOrganization(item.organization.id)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-rose-400/35 text-rose-200 hover:bg-rose-500/10 disabled:opacity-60"
                >
                  {reportingOrgId === item.organization.id ? "Reporting..." : "Report organization"}
                </button>
              </div>
            </article>
          ),
        )}
      </div>

      <p className="text-[11px] text-white/40 leading-relaxed pt-2">
        Organization information sourced from URInvolved, URI&apos;s official student involvement platform.
        CampusQuest helps students discover opportunities and sends them back to URInvolved as the official source.
      </p>

      {activeOrg ? (
        <OrgHubModalOverlay open onClose={() => setActiveOrg(null)} ariaLabel={`${activeOrg.name} organization`}>
          <OrgHubModalPanel title={activeOrg.name} onClose={() => setActiveOrg(null)}>
            <div className="space-y-3">
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
              <div className="space-y-1 border-t border-white/10 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Upcoming events</p>
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
              <TaggedEntityPostsSection
                entityType="organization"
                entityId={activeOrg.id}
                title="Community posts"
              />
            </div>
          </OrgHubModalPanel>
        </OrgHubModalOverlay>
      ) : null}
      {activeExternalOrg ? (
        <OrgHubModalOverlay open onClose={closeExternalOrgModal} ariaLabel={`${activeExternalOrg.name} events`}>
          <OrgHubModalPanel
            title={activeExternalEvent ? activeExternalEvent.title : activeExternalOrg.name}
            onClose={closeExternalOrgModal}
          >
            {activeExternalEvent ? (
              <div className="space-y-3">
                <button
                  type="button"
                  className="text-xs font-medium text-white/65 transition hover:text-white"
                  onClick={() => setActiveExternalEvent(null)}
                >
                  ← Back to events
                </button>
                {activeExternalEvent.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={activeExternalEvent.imageUrl}
                    alt=""
                    className="w-full max-h-48 rounded-lg border border-white/10 object-cover"
                  />
                ) : null}
                {(() => {
                  const { date, time } = formatExternalEventDateTime(activeExternalEvent.startsAt);
                  return (
                    <p className="text-xs text-white/65">
                      {date}
                      {time ? ` · ${time}` : ""}
                    </p>
                  );
                })()}
                <ExternalEventLocationDetail
                  venueName={activeExternalEvent.venueName}
                  address={activeExternalEvent.address}
                  location={activeExternalEvent.location}
                />
                <p className="text-sm text-white/75">{activeExternalEvent.description}</p>
                {activeExternalEvent.category ? (
                  <p className="text-xs text-white/55">Category: {activeExternalEvent.category}</p>
                ) : null}
                <p className="text-xs text-cyan-200/80">Source: URInvolved</p>
                {activeExternalEvent.eventUrl ? (
                  <a
                    href={activeExternalEvent.eventUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex rounded-lg border border-cyan-400/35 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/10"
                  >
                    View on URInvolved
                  </a>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3">
                {activeExternalOrg.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={activeExternalOrg.logoUrl}
                    alt=""
                    className="h-16 w-16 rounded-lg border border-white/10 object-cover"
                  />
                ) : null}
                <p className="text-sm text-white/75">{activeExternalOrg.description}</p>
                {activeExternalOrg.category ? (
                  <p className="text-xs text-white/65">{activeExternalOrg.category}</p>
                ) : null}
                {activeExternalOrg.tags.length > 0 ? (
                  <p className="text-xs text-white/50">{activeExternalOrg.tags.join(" · ")}</p>
                ) : null}
                <p className="text-xs text-cyan-200/80">Source: URInvolved</p>

                <div className="space-y-2 border-t border-white/10 pt-3">
                  <h5 className="text-sm font-semibold text-white">Upcoming Events</h5>
                  {activeExternalOrgEvents.length === 0 ? (
                    <p className="text-xs text-white/50">No upcoming events currently scheduled.</p>
                  ) : (
                    <ul className="space-y-2">
                      {activeExternalOrgEvents.map((event) => {
                        const { date, time } = formatExternalEventDateTime(event.startsAt);
                        return (
                          <li key={event.id}>
                            <button
                              type="button"
                              onClick={() => setActiveExternalEvent(event)}
                              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-left transition-colors hover:bg-white/10"
                            >
                              <p className="text-sm font-medium text-white">{event.title}</p>
                              <p className="mt-0.5 text-xs text-white/60">
                                {date}
                                {time ? ` · ${time}` : ""}
                              </p>
                              <ExternalEventLocationDisplay
                                venueName={event.venueName}
                                address={event.address}
                                location={event.location}
                                className="mt-1"
                              />
                              {event.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={event.imageUrl}
                                  alt=""
                                  className="mt-2 max-h-28 w-full rounded-md border border-white/10 object-cover"
                                />
                              ) : null}
                              {event.description ? (
                                <p className="mt-1.5 line-clamp-2 text-xs text-white/55">{event.description}</p>
                              ) : null}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {activeExternalOrg.organizationUrl ? (
                  <a
                    href={activeExternalOrg.organizationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block pt-1 text-[11px] text-white/40 hover:text-white/60 hover:underline"
                  >
                    View Organization on URInvolved
                  </a>
                ) : null}
              </div>
            )}
          </OrgHubModalPanel>
        </OrgHubModalOverlay>
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
