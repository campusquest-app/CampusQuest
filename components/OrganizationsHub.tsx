"use client";

import { FormEvent, useEffect, useState } from "react";
import { fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import { OrganizationAdminPortal } from "@/components/OrganizationAdminPortal";

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

type CreateForm = {
  name: string;
  description: string;
  category: string;
  logoUrl: string;
  schoolName: string;
  contactLink: string;
};

const initialForm: CreateForm = {
  name: "",
  description: "",
  category: "",
  logoUrl: "",
  schoolName: "",
  contactLink: "",
};

export function OrganizationsHub({
  personalization,
}: {
  personalization?: { schoolName?: string; interests?: string[]; discoveryFocus?: string[] } | null;
}) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reportingOrgId, setReportingOrgId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateForm>(initialForm);
  const [activeOrg, setActiveOrg] = useState<Organization | null>(null);
  const [adminPortalOrg, setAdminPortalOrg] = useState<Organization | null>(null);

  useEffect(() => {
    if (!personalization?.schoolName) return;
    setForm((prev) => ({ ...prev, schoolName: prev.schoolName || personalization.schoolName! }));
  }, [personalization?.schoolName]);

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

  async function handleCreateOrganization(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await postAuthed("/api/organizations", {
        name: form.name,
        description: form.description,
        category: form.category,
        logoUrl: form.logoUrl || undefined,
        schoolName: form.schoolName,
        contactLink: form.contactLink || undefined,
      });
      setForm(initialForm);
      await loadOrganizations(query);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create organization.");
    } finally {
      setSubmitting(false);
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
        <form onSubmit={handleCreateOrganization} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Organization name"
            className="rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-sm text-white placeholder-white/50"
          />
          <input
            value={form.category}
            onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
            placeholder="Category"
            className="rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-sm text-white placeholder-white/50"
          />
          <input
            value={form.schoolName}
            onChange={(event) => setForm((prev) => ({ ...prev, schoolName: event.target.value }))}
            placeholder="School/University"
            readOnly={Boolean(personalization?.schoolName)}
            className="rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-sm text-white placeholder-white/50"
          />
          <input
            value={form.contactLink}
            onChange={(event) => setForm((prev) => ({ ...prev, contactLink: event.target.value }))}
            placeholder="Contact link (optional)"
            className="rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-sm text-white placeholder-white/50"
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
          />
          <button
            type="submit"
            disabled={submitting}
            className="sm:col-span-2 rounded-lg bg-uri-keaney text-uri-navy font-semibold py-2.5 text-sm disabled:opacity-60"
          >
            {submitting ? "Creating..." : "Create organization"}
          </button>
        </form>
      </div>

      {error ? <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</div> : null}
      {loading ? (
        <div className="space-y-2">
          <div className="h-20 rounded-xl bg-white/10 animate-pulse" />
          <div className="h-20 rounded-xl bg-white/10 animate-pulse" />
        </div>
      ) : null}
      {!loading && organizations.length === 0 ? <p className="text-sm text-white/60">No organizations found. Start a student group.</p> : null}

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
            <button
              type="button"
              onClick={() => setAdminPortalOrg(null)}
              className="text-xs text-white/65 hover:text-white"
            >
              Close portal
            </button>
          </div>
          <OrganizationAdminPortal organizationId={adminPortalOrg.id} organizationName={adminPortalOrg.name} />
        </div>
      ) : null}
    </section>
  );
}
