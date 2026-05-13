"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";

type EventItem = {
  id: string;
  title: string;
  description: string;
  category: string;
  location: string;
  startsAt: string;
  endsAt: string | null;
  isPaid: boolean;
  hostType?: "user" | "organization";
  hostOrganization: { id: string; name: string; logo_url: string | null } | null;
  hostProfile?: { id: string; username: string; displayName: string } | null;
  rsvpCount: number;
  myRsvpStatus: "going" | "interested" | "not_going" | null;
  isCancelled: boolean;
};

type Filters = {
  category: string;
  organizationId: string;
  isPaid: "all" | "free" | "paid";
  location: string;
  timeframe: "all" | "today" | "this_week";
};

type CreateEventForm = {
  title: string;
  description: string;
  category: string;
  locationName: string;
  startsAt: string;
  endsAt: string;
  isPaid: boolean;
  hostMode: "self" | "organization";
  hostOrganizationId: string;
};

function eventHostLabel(event: EventItem): string {
  if (event.hostOrganization) return event.hostOrganization.name;
  if (event.hostProfile?.displayName?.trim()) return event.hostProfile.displayName.trim();
  if (event.hostProfile?.username) return event.hostProfile.username;
  return "CampusQuest community";
}

const initialFilters: Filters = {
  category: "",
  organizationId: "",
  isPaid: "all",
  location: "",
  timeframe: "all",
};

export function EventsFeed({
  personalization,
}: {
  personalization?: { schoolName?: string; interests?: string[]; discoveryFocus?: string[] } | null;
}) {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(() => ({
    ...initialFilters,
    category: personalization?.interests?.[0] ?? "",
    timeframe: personalization?.discoveryFocus?.includes("events") ? "this_week" : "all",
  }));
  const [activeDetail, setActiveDetail] = useState<EventItem | null>(null);
  const [rsvping, setRsvping] = useState<string | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [manageableOrganizations, setManageableOrganizations] = useState<Array<{ id: string; name: string }>>([]);
  const [createForm, setCreateForm] = useState<CreateEventForm>({
    title: "",
    description: "",
    category: "",
    locationName: "",
    startsAt: "",
    endsAt: "",
    isPaid: false,
    hostMode: "self",
    hostOrganizationId: "",
  });

  const canHostAsOrganization = manageableOrganizations.length > 0;

  async function loadEvents(nextFilters = filters) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (nextFilters.category) params.set("category", nextFilters.category);
      if (nextFilters.organizationId) params.set("organizationId", nextFilters.organizationId);
      if (nextFilters.isPaid === "free") params.set("isPaid", "false");
      if (nextFilters.isPaid === "paid") params.set("isPaid", "true");
      if (nextFilters.location) params.set("location", nextFilters.location);
      if (nextFilters.timeframe !== "all") params.set("timeframe", nextFilters.timeframe);
      const query = params.toString();
      const data = await fetchAuthed<{ events: EventItem[] }>(`/api/events${query ? `?${query}` : ""}`);
      setEvents(data.events ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load events.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEvents(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.category, filters.organizationId, filters.isPaid, filters.location, filters.timeframe]);

  useEffect(() => {
    if (manageableOrganizations.length === 0) {
      setCreateForm((prev) =>
        prev.hostMode === "organization" ? { ...prev, hostMode: "self", hostOrganizationId: "" } : prev,
      );
    }
  }, [manageableOrganizations.length]);

  useEffect(() => {
    async function loadManageableOrganizations() {
      try {
        const data = await fetchAuthed<{ organizations: Array<{ id: string; name: string }> }>(
          "/api/organizations?eligibleEventHostsOnly=1",
        );
        setManageableOrganizations((data.organizations ?? []).map((org) => ({ id: org.id, name: org.name })));
      } catch {
        setManageableOrganizations([]);
      }
    }
    void loadManageableOrganizations();
  }, []);

  const categories = useMemo(() => Array.from(new Set(events.map((event) => event.category))).sort(), [events]);
  const organizations = useMemo(
    () =>
      Array.from(
        new Map(
          events
            .filter((event) => event.hostOrganization)
            .map((event) => [event.hostOrganization!.id, event.hostOrganization!]),
        ).values(),
      ),
    [events],
  );

  const prioritizedEvents = useMemo(() => {
    const interests = new Set((personalization?.interests ?? []).map((value) => value.toLowerCase()));
    return [...events].sort((a, b) => {
      const aMatch = interests.has(a.category.toLowerCase()) ? 0 : 1;
      const bMatch = interests.has(b.category.toLowerCase()) ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
    });
  }, [events, personalization?.interests]);

  async function handleRsvp(eventId: string, status: "going" | "interested" | "not_going") {
    setRsvping(eventId);
    setError(null);
    try {
      await postAuthed(`/api/events/${eventId}/rsvp`, { status });
      await loadEvents(filters);
      if (activeDetail?.id === eventId) {
        const updated = events.find((event) => event.id === eventId);
        if (updated) setActiveDetail(updated);
      }
    } catch (rsvpError) {
      setError(rsvpError instanceof Error ? rsvpError.message : "Could not save RSVP.");
    } finally {
      setRsvping(null);
    }
  }

  async function handleCreateEvent(event: FormEvent) {
    event.preventDefault();
    if (createForm.hostMode === "organization") {
      if (!createForm.hostOrganizationId.trim()) {
        setError("Select an organization you manage to host under.");
        return;
      }
    }
    setCreating(true);
    setError(null);
    try {
      const hostOrganizationId =
        createForm.hostMode === "organization" && createForm.hostOrganizationId
          ? createForm.hostOrganizationId
          : undefined;
      await postAuthed("/api/events", {
        title: createForm.title,
        description: createForm.description,
        category: createForm.category,
        locationName: createForm.locationName,
        startsAt: new Date(createForm.startsAt).toISOString(),
        endsAt: createForm.endsAt ? new Date(createForm.endsAt).toISOString() : undefined,
        isPaid: createForm.isPaid,
        ...(hostOrganizationId ? { hostOrganizationId } : {}),
      });
      setCreateForm({
        title: "",
        description: "",
        category: "",
        locationName: "",
        startsAt: "",
        endsAt: "",
        isPaid: false,
        hostMode: "self",
        hostOrganizationId: "",
      });
      await loadEvents(filters);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create event.");
    } finally {
      setCreating(false);
    }
  }

  async function handleReportEvent(eventId: string) {
    const reasonInput = window.prompt("Reason (unsafe, harassment, scam, inappropriate, spam, other)", "unsafe") ?? "";
    const reason = reasonInput.trim().toLowerCase();
    if (!["unsafe", "harassment", "scam", "inappropriate", "spam", "other"].includes(reason)) {
      setError("Please provide a valid report reason.");
      return;
    }
    const details = window.prompt("Optional details for moderators", "") ?? "";
    setReporting(eventId);
    setError(null);
    try {
      await postAuthed(`/api/events/${eventId}/report`, {
        reason,
        details: details.trim() || undefined,
      });
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : "Could not report event.");
    } finally {
      setReporting(null);
    }
  }

  return (
    <section className="space-y-4">
      <div className="card p-4 space-y-3">
        <h3 className="font-display font-semibold text-white">Event Discovery</h3>
        <p className="text-xs text-white/55">
          Showing events in your verified campus community{personalization?.schoolName ? ` (${personalization.schoolName})` : ""}.
        </p>
        <form onSubmit={handleCreateEvent} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            value={createForm.title}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="Create event title"
            className="rounded-lg bg-white/10 border border-white/20 px-2 py-2 text-xs text-white placeholder-white/50"
          />
          <input
            value={createForm.category}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, category: event.target.value }))}
            placeholder="Category"
            className="rounded-lg bg-white/10 border border-white/20 px-2 py-2 text-xs text-white placeholder-white/50"
          />
          <input
            value={createForm.locationName}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, locationName: event.target.value }))}
            placeholder="Location"
            className="rounded-lg bg-white/10 border border-white/20 px-2 py-2 text-xs text-white placeholder-white/50"
          />
          <fieldset className="rounded-lg border border-white/15 px-2 py-2 space-y-1.5 sm:col-span-2">
            <legend className="text-[11px] text-white/55 px-1">Event host</legend>
            <label className="flex items-center gap-2 text-xs text-white/85">
              <input
                type="radio"
                name="eventHostMode"
                checked={createForm.hostMode === "self"}
                onChange={() =>
                  setCreateForm((prev) => ({ ...prev, hostMode: "self", hostOrganizationId: "" }))
                }
              />
              Host as myself
            </label>
            <label
              className={`flex items-start gap-2 text-xs ${canHostAsOrganization ? "text-white/85" : "text-white/35"}`}
            >
              <input
                type="radio"
                name="eventHostMode"
                disabled={!canHostAsOrganization}
                checked={createForm.hostMode === "organization"}
                onChange={() => setCreateForm((prev) => ({ ...prev, hostMode: "organization" }))}
              />
              <span>
                Host as an organization you manage
                {!canHostAsOrganization ? (
                  <span className="block text-[10px] text-white/40 mt-0.5">
                    You do not manage any approved organizations for your campus yet.
                  </span>
                ) : null}
              </span>
            </label>
            {createForm.hostMode === "organization" && canHostAsOrganization ? (
              <select
                value={createForm.hostOrganizationId}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, hostOrganizationId: event.target.value }))}
                required
                className="w-full rounded-lg bg-white/10 border border-white/20 px-2 py-2 text-xs text-white"
              >
                <option value="">Select organization…</option>
                {manageableOrganizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
            ) : null}
          </fieldset>
          <input
            type="datetime-local"
            value={createForm.startsAt}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, startsAt: event.target.value }))}
            className="rounded-lg bg-white/10 border border-white/20 px-2 py-2 text-xs text-white"
          />
          <input
            type="datetime-local"
            value={createForm.endsAt}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, endsAt: event.target.value }))}
            className="rounded-lg bg-white/10 border border-white/20 px-2 py-2 text-xs text-white"
          />
          <textarea
            value={createForm.description}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, description: event.target.value }))}
            rows={2}
            placeholder="Short description"
            className="rounded-lg bg-white/10 border border-white/20 px-2 py-2 text-xs text-white placeholder-white/50 sm:col-span-2"
          />
          <label className="flex items-center gap-2 text-xs text-white/75">
            <input
              type="checkbox"
              checked={createForm.isPaid}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, isPaid: event.target.checked }))}
            />
            Paid event
          </label>
          <button
            type="submit"
            disabled={creating}
            className="sm:col-span-2 rounded-lg bg-uri-keaney text-uri-navy text-xs font-semibold py-2 disabled:opacity-60"
          >
            {creating ? "Creating event..." : "Create event"}
          </button>
        </form>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <select
            value={filters.category}
            onChange={(event) => setFilters((prev) => ({ ...prev, category: event.target.value }))}
            className="rounded-lg bg-white/10 border border-white/20 px-2 py-2 text-xs text-white"
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <select
            value={filters.organizationId}
            onChange={(event) => setFilters((prev) => ({ ...prev, organizationId: event.target.value }))}
            className="rounded-lg bg-white/10 border border-white/20 px-2 py-2 text-xs text-white"
          >
            <option value="">All orgs</option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
          <select
            value={filters.isPaid}
            onChange={(event) => setFilters((prev) => ({ ...prev, isPaid: event.target.value as Filters["isPaid"] }))}
            className="rounded-lg bg-white/10 border border-white/20 px-2 py-2 text-xs text-white"
          >
            <option value="all">Free + Paid</option>
            <option value="free">Free only</option>
            <option value="paid">Paid only</option>
          </select>
          <input
            value={filters.location}
            onChange={(event) => setFilters((prev) => ({ ...prev, location: event.target.value }))}
            placeholder="Location"
            className="rounded-lg bg-white/10 border border-white/20 px-2 py-2 text-xs text-white placeholder-white/50"
          />
          <select
            value={filters.timeframe}
            onChange={(event) => setFilters((prev) => ({ ...prev, timeframe: event.target.value as Filters["timeframe"] }))}
            className="rounded-lg bg-white/10 border border-white/20 px-2 py-2 text-xs text-white"
          >
            <option value="all">Any time</option>
            <option value="today">Today</option>
            <option value="this_week">This week</option>
          </select>
        </div>
      </div>

      {error ? <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</div> : null}
      {loading ? (
        <div className="space-y-2">
          <div className="h-20 rounded-xl bg-white/10 animate-pulse" />
          <div className="h-20 rounded-xl bg-white/10 animate-pulse" />
        </div>
      ) : null}
      {!loading && events.length === 0 ? <p className="text-sm text-white/60">No events yet. Be the first to create one.</p> : null}

      <div className="space-y-3">
        {prioritizedEvents.map((event) => (
          <article key={event.id} className="card p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-white font-semibold">{event.title}</h4>
                <p className="text-xs text-white/65 mt-1">
                  {new Date(event.startsAt).toLocaleString()} · {event.location}
                </p>
              </div>
              <span className="text-[11px] rounded-full border border-uri-keaney/35 px-2 py-0.5 text-uri-keaney">
                {event.category}
              </span>
            </div>
            <p className="text-sm text-white/75 line-clamp-2">{event.description}</p>
            <p className="text-xs text-white/55">
              Host: {eventHostLabel(event)} · {event.isPaid ? "Paid" : "Free"} · RSVP {event.rsvpCount}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveDetail(event)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-white/25 text-white/85 hover:bg-white/10"
              >
                View details
              </button>
              <button
                type="button"
                disabled={reporting === event.id}
                onClick={() => void handleReportEvent(event.id)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-rose-400/35 text-rose-200 hover:bg-rose-500/10 disabled:opacity-60"
              >
                {reporting === event.id ? "Reporting..." : "Report event"}
              </button>
              {(["going", "interested", "not_going"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={rsvping === event.id}
                  onClick={() => void handleRsvp(event.id, status)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
                    event.myRsvpStatus === status
                      ? "border-uri-keaney/50 text-uri-keaney bg-uri-keaney/15"
                      : "border-white/20 text-white/80 hover:bg-white/10"
                  }`}
                >
                  {status.replace("_", " ")}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>

      {activeDetail ? (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/65 p-3">
          <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-uri-navy p-5 space-y-3">
            <div className="flex justify-between gap-3">
              <h4 className="text-white text-lg font-semibold">{activeDetail.title}</h4>
              <button type="button" className="text-white/60 hover:text-white" onClick={() => setActiveDetail(null)}>
                ✕
              </button>
            </div>
            <p className="text-sm text-white/75">{activeDetail.description}</p>
            <p className="text-xs text-white/65">
              {new Date(activeDetail.startsAt).toLocaleString()} · {activeDetail.location}
            </p>
            <p className="text-xs text-white/55">
              Hosted by {eventHostLabel(activeDetail)} · RSVP {activeDetail.rsvpCount}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {(["going", "interested", "not_going"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={rsvping === activeDetail.id}
                  onClick={() => void handleRsvp(activeDetail.id, status)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border ${
                    activeDetail.myRsvpStatus === status
                      ? "border-uri-keaney/50 text-uri-keaney bg-uri-keaney/15"
                      : "border-white/20 text-white/80 hover:bg-white/10"
                  }`}
                >
                  {status.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
