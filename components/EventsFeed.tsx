"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ApiRequestError, fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";

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

type ExternalEventItem = {
  id: string;
  source: string;
  title: string;
  description: string;
  category: string;
  location: string | null;
  startsAt: string | null;
  endsAt: string | null;
  organizationName: string | null;
  imageUrl: string | null;
  eventUrl: string | null;
  imported: true;
};

type FeedEvent =
  | { kind: "campus"; event: EventItem }
  | { kind: "external"; event: ExternalEventItem };

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
  ticketPrice: string;
  hostMode: "self" | "organization";
  hostOrganizationId: string;
};

type CreateEventFieldErrorKey =
  | "title"
  | "description"
  | "category"
  | "locationName"
  | "startsAt"
  | "endsAt"
  | "host"
  | "ticketPrice";

const EVENT_CATEGORY_OPTIONS = [
  "Meeting",
  "Networking",
  "Campus Event",
  "Workshop",
  "Social",
  "Study Group",
] as const;

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
  const [externalEvents, setExternalEvents] = useState<ExternalEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(() => ({
    ...initialFilters,
    category: personalization?.interests?.[0] ?? "",
    timeframe: personalization?.discoveryFocus?.includes("events") ? "this_week" : "all",
  }));
  const [activeDetail, setActiveDetail] = useState<FeedEvent | null>(null);
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
    ticketPrice: "",
    hostMode: "self",
    hostOrganizationId: "",
  });
  const [createFieldErrors, setCreateFieldErrors] = useState<Partial<Record<CreateEventFieldErrorKey, string>>>({});

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
      const externalParams = new URLSearchParams();
      if (nextFilters.category) externalParams.set("category", nextFilters.category);
      if (nextFilters.location) externalParams.set("location", nextFilters.location);
      if (nextFilters.timeframe !== "all") externalParams.set("timeframe", nextFilters.timeframe);
      const externalQuery = externalParams.toString();

      const [campusResult, externalResult] = await Promise.allSettled([
        fetchAuthed<{ events: EventItem[] }>(`/api/events${query ? `?${query}` : ""}`),
        fetchAuthed<{ events: ExternalEventItem[] }>(
          `/api/external/events${externalQuery ? `?${externalQuery}` : ""}`,
        ),
      ]);

      if (campusResult.status === "fulfilled") {
        setEvents(campusResult.value.events ?? []);
      } else {
        setEvents([]);
        setError(
          campusResult.reason instanceof Error ? campusResult.reason.message : "Could not load events.",
        );
      }

      if (externalResult.status === "fulfilled") {
        setExternalEvents(externalResult.value.events ?? []);
      } else {
        setExternalEvents([]);
      }
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

  const categories = useMemo(
    () =>
      Array.from(new Set([...events, ...externalEvents].map((event) => event.category).filter(Boolean))).sort(),
    [events, externalEvents],
  );
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

  const allFeedEvents = useMemo<FeedEvent[]>(() => {
    const campus = events.map((event) => ({ kind: "campus" as const, event }));
    const external =
      filters.isPaid === "paid"
        ? []
        : externalEvents.map((event) => ({ kind: "external" as const, event }));
    return [...campus, ...external];
  }, [events, externalEvents, filters.isPaid]);

  const prioritizedEvents = useMemo(() => {
    const interests = new Set((personalization?.interests ?? []).map((value) => value.toLowerCase()));
    return [...allFeedEvents].sort((a, b) => {
      const aCategory = a.event.category.toLowerCase();
      const bCategory = b.event.category.toLowerCase();
      const aMatch = interests.has(aCategory) ? 0 : 1;
      const bMatch = interests.has(bCategory) ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      const aTime = a.event.startsAt ? new Date(a.event.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.event.startsAt ? new Date(b.event.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
  }, [allFeedEvents, personalization?.interests]);

  async function handleRsvp(eventId: string, status: "going" | "interested" | "not_going") {
    setRsvping(eventId);
    setError(null);
    try {
      await postAuthed(`/api/events/${eventId}/rsvp`, { status });
      await loadEvents(filters);
      if (activeDetail?.kind === "campus" && activeDetail.event.id === eventId) {
        const updated = events.find((event) => event.id === eventId);
        if (updated) setActiveDetail({ kind: "campus", event: updated });
      }
    } catch (rsvpError) {
      setError(rsvpError instanceof Error ? rsvpError.message : "Could not save RSVP.");
    } finally {
      setRsvping(null);
    }
  }

  async function handleCreateEvent(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Partial<Record<CreateEventFieldErrorKey, string>> = {};
    const startsAtDate = createForm.startsAt ? new Date(createForm.startsAt) : null;
    const endsAtDate = createForm.endsAt ? new Date(createForm.endsAt) : null;

    if (!createForm.title.trim()) nextErrors.title = "Title is required.";
    if (!createForm.category.trim()) nextErrors.category = "Category is required.";
    if (!createForm.locationName.trim()) nextErrors.locationName = "Location is required.";
    if (!createForm.description.trim()) nextErrors.description = "Description is required.";
    if (!createForm.startsAt.trim() || !startsAtDate || Number.isNaN(startsAtDate.getTime())) {
      nextErrors.startsAt = "Start time is required.";
    }
    if (createForm.endsAt.trim() && (!endsAtDate || Number.isNaN(endsAtDate.getTime()))) {
      nextErrors.endsAt = "End time is invalid.";
    }
    if (startsAtDate && endsAtDate && endsAtDate.getTime() <= startsAtDate.getTime()) {
      nextErrors.endsAt = "End time must be after start time.";
    }
    if (createForm.hostMode === "organization" && !createForm.hostOrganizationId.trim()) {
      nextErrors.host = "Select an organization you manage to host under.";
    }
    if (createForm.isPaid) {
      const cents = Math.round(Number(createForm.ticketPrice) * 100);
      if (!Number.isFinite(cents) || cents <= 0) {
        nextErrors.ticketPrice = "Enter a valid price for a paid event.";
      }
    }

    setCreateFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setError("Please fix the highlighted event fields.");
      return;
    }
    setCreating(true);
    setError(null);
    setCreateFieldErrors({});
    try {
      const hostOrganizationId =
        createForm.hostMode === "organization" && createForm.hostOrganizationId
          ? createForm.hostOrganizationId
          : undefined;
      const ticketPriceCents = createForm.isPaid ? Math.round(Number(createForm.ticketPrice) * 100) : undefined;
      await postAuthed("/api/events", {
        title: createForm.title.trim(),
        description: createForm.description.trim(),
        category: createForm.category.trim(),
        locationName: createForm.locationName.trim(),
        startsAt: new Date(createForm.startsAt).toISOString(),
        endsAt: createForm.endsAt ? new Date(createForm.endsAt).toISOString() : undefined,
        isPaid: createForm.isPaid,
        ticketPriceCents,
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
        ticketPrice: "",
        hostMode: "self",
        hostOrganizationId: "",
      });
      await loadEvents(filters);
    } catch (createError) {
      if (createError instanceof ApiRequestError && createError.code === "VALIDATION_ERROR") {
        const details = Array.isArray(createError.details)
          ? (createError.details as Array<{ path?: string; message?: string }>)
          : [];
        const mappedErrors: Partial<Record<CreateEventFieldErrorKey, string>> = {};
        for (const detail of details) {
          const path = String(detail.path ?? "");
          const message = detail.message ?? "Invalid field.";
          if (path === "title" && !mappedErrors.title) mappedErrors.title = message;
          else if (path === "description" && !mappedErrors.description) mappedErrors.description = message;
          else if (path === "category" && !mappedErrors.category) mappedErrors.category = message;
          else if (path === "locationName" && !mappedErrors.locationName) mappedErrors.locationName = message;
          else if (path === "startsAt" && !mappedErrors.startsAt) mappedErrors.startsAt = message;
          else if (path === "endsAt" && !mappedErrors.endsAt) mappedErrors.endsAt = message;
          else if (path === "hostOrganizationId" && !mappedErrors.host) mappedErrors.host = message;
          else if (path === "ticketPriceCents" && !mappedErrors.ticketPrice) mappedErrors.ticketPrice = message;
        }
        if (Object.keys(mappedErrors).length > 0) {
          setCreateFieldErrors(mappedErrors);
          setError("Please fix the highlighted event fields.");
          if (process.env.NODE_ENV !== "production") {
            console.info("[cq] events:create validation-ui", {
              status: createError.status,
              code: createError.code,
              details: createError.details,
            });
          }
          return;
        }
      }
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
            onChange={(event) => {
              setCreateForm((prev) => ({ ...prev, title: event.target.value }));
              setCreateFieldErrors((prev) => ({ ...prev, title: undefined }));
            }}
            placeholder="Create event title"
            className="rounded-lg bg-white/10 border border-white/20 px-2 py-2 text-xs text-white placeholder-white/50"
          />
          {createFieldErrors.title ? <p className="text-[11px] text-rose-300 sm:col-span-2">{createFieldErrors.title}</p> : null}
          <select
            value={createForm.category}
            onChange={(event) => {
              setCreateForm((prev) => ({ ...prev, category: event.target.value }));
              setCreateFieldErrors((prev) => ({ ...prev, category: undefined }));
            }}
            className="rounded-lg bg-white/10 border border-white/20 px-2 py-2 text-xs text-white placeholder-white/50"
          >
            <option value="">Category</option>
            {EVENT_CATEGORY_OPTIONS.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          {createFieldErrors.category ? <p className="text-[11px] text-rose-300 sm:col-span-2">{createFieldErrors.category}</p> : null}
          <input
            value={createForm.locationName}
            onChange={(event) => {
              setCreateForm((prev) => ({ ...prev, locationName: event.target.value }));
              setCreateFieldErrors((prev) => ({ ...prev, locationName: undefined }));
            }}
            placeholder="Location"
            className="rounded-lg bg-white/10 border border-white/20 px-2 py-2 text-xs text-white placeholder-white/50"
          />
          {createFieldErrors.locationName ? (
            <p className="text-[11px] text-rose-300 sm:col-span-2">{createFieldErrors.locationName}</p>
          ) : null}
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
                onChange={() => {
                  setCreateForm((prev) => ({ ...prev, hostMode: "organization" }));
                  setCreateFieldErrors((prev) => ({ ...prev, host: undefined }));
                }}
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
                onChange={(event) => {
                  setCreateForm((prev) => ({ ...prev, hostOrganizationId: event.target.value }));
                  setCreateFieldErrors((prev) => ({ ...prev, host: undefined }));
                }}
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
            {createFieldErrors.host ? <p className="text-[11px] text-rose-300">{createFieldErrors.host}</p> : null}
          </fieldset>
          <input
            type="datetime-local"
            value={createForm.startsAt}
            onChange={(event) => {
              setCreateForm((prev) => ({ ...prev, startsAt: event.target.value }));
              setCreateFieldErrors((prev) => ({ ...prev, startsAt: undefined }));
            }}
            className="rounded-lg bg-white/10 border border-white/20 px-2 py-2 text-xs text-white"
          />
          {createFieldErrors.startsAt ? <p className="text-[11px] text-rose-300 sm:col-span-2">{createFieldErrors.startsAt}</p> : null}
          <input
            type="datetime-local"
            value={createForm.endsAt}
            onChange={(event) => {
              setCreateForm((prev) => ({ ...prev, endsAt: event.target.value }));
              setCreateFieldErrors((prev) => ({ ...prev, endsAt: undefined }));
            }}
            className="rounded-lg bg-white/10 border border-white/20 px-2 py-2 text-xs text-white"
          />
          {createFieldErrors.endsAt ? <p className="text-[11px] text-rose-300 sm:col-span-2">{createFieldErrors.endsAt}</p> : null}
          <textarea
            value={createForm.description}
            onChange={(event) => {
              setCreateForm((prev) => ({ ...prev, description: event.target.value }));
              setCreateFieldErrors((prev) => ({ ...prev, description: undefined }));
            }}
            rows={2}
            placeholder="Short description"
            className="rounded-lg bg-white/10 border border-white/20 px-2 py-2 text-xs text-white placeholder-white/50 sm:col-span-2"
          />
          {createFieldErrors.description ? (
            <p className="text-[11px] text-rose-300 sm:col-span-2">{createFieldErrors.description}</p>
          ) : null}
          <label className="flex items-center gap-2 text-xs text-white/75">
            <input
              type="checkbox"
              checked={createForm.isPaid}
              onChange={(event) =>
                setCreateForm((prev) => ({
                  ...prev,
                  isPaid: event.target.checked,
                  ticketPrice: event.target.checked ? prev.ticketPrice : "",
                }))
              }
            />
            Paid event
          </label>
          {createForm.isPaid ? (
            <input
              value={createForm.ticketPrice}
              onChange={(event) => {
                setCreateForm((prev) => ({ ...prev, ticketPrice: event.target.value }));
                setCreateFieldErrors((prev) => ({ ...prev, ticketPrice: undefined }));
              }}
              placeholder="Price (USD)"
              className="rounded-lg bg-white/10 border border-white/20 px-2 py-2 text-xs text-white placeholder-white/50"
            />
          ) : (
            <div className="text-[11px] text-white/55 self-center">Free event · price set to 0</div>
          )}
          {createFieldErrors.ticketPrice ? (
            <p className="text-[11px] text-rose-300 sm:col-span-2">{createFieldErrors.ticketPrice}</p>
          ) : null}
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
      {!loading && prioritizedEvents.length === 0 ? (
        <p className="text-sm text-white/60">No events yet. Be the first to create one.</p>
      ) : null}

      <div className="space-y-3">
        {prioritizedEvents.map((item) =>
          item.kind === "external" ? (
            <article key={`ext-${item.event.id}`} className="card p-4 space-y-2 border border-cyan-400/15">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-white font-semibold">{item.event.title}</h4>
                  <p className="text-xs text-white/65 mt-1">
                    {item.event.startsAt ? new Date(item.event.startsAt).toLocaleString() : "Date TBA"}
                    {item.event.location ? ` · ${item.event.location}` : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-[11px] rounded-full border border-uri-keaney/35 px-2 py-0.5 text-uri-keaney">
                    {item.event.category}
                  </span>
                  <span className="text-[10px] text-cyan-200/80">Source: URInvolved</span>
                </div>
              </div>
              {item.event.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.event.imageUrl} alt="" className="w-full max-h-40 object-cover rounded-lg border border-white/10" />
              ) : null}
              <p className="text-sm text-white/75 line-clamp-3">{item.event.description}</p>
              {item.event.organizationName ? (
                <p className="text-xs text-white/55">Organization: {item.event.organizationName}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveDetail(item)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-white/25 text-white/85 hover:bg-white/10"
                >
                  View details
                </button>
                {item.event.eventUrl ? (
                  <a
                    href={item.event.eventUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-cyan-400/35 text-cyan-200 hover:bg-cyan-500/10"
                  >
                    View on URInvolved
                  </a>
                ) : null}
              </div>
            </article>
          ) : (
            <article key={item.event.id} className="card p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-white font-semibold">{item.event.title}</h4>
                  <p className="text-xs text-white/65 mt-1">
                    {new Date(item.event.startsAt).toLocaleString()} · {item.event.location}
                  </p>
                </div>
                <span className="text-[11px] rounded-full border border-uri-keaney/35 px-2 py-0.5 text-uri-keaney">
                  {item.event.category}
                </span>
              </div>
              <p className="text-sm text-white/75 line-clamp-2">{item.event.description}</p>
              <p className="text-xs text-white/55">
                Host: {eventHostLabel(item.event)} · {item.event.isPaid ? "Paid" : "Free"} · RSVP {item.event.rsvpCount}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveDetail(item)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-white/25 text-white/85 hover:bg-white/10"
                >
                  View details
                </button>
                <button
                  type="button"
                  disabled={reporting === item.event.id}
                  onClick={() => void handleReportEvent(item.event.id)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-rose-400/35 text-rose-200 hover:bg-rose-500/10 disabled:opacity-60"
                >
                  {reporting === item.event.id ? "Reporting..." : "Report event"}
                </button>
                {(["going", "interested", "not_going"] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={rsvping === item.event.id}
                    onClick={() => void handleRsvp(item.event.id, status)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
                      item.event.myRsvpStatus === status
                        ? "border-uri-keaney/50 text-uri-keaney bg-uri-keaney/15"
                        : "border-white/20 text-white/80 hover:bg-white/10"
                    }`}
                  >
                    {status.replace("_", " ")}
                  </button>
                ))}
              </div>
            </article>
          ),
        )}
      </div>

      <p className="text-[11px] text-white/40 leading-relaxed pt-2">
        Event information sourced from URInvolved, URI&apos;s official student involvement platform. CampusQuest
        helps students discover opportunities and sends them back to URInvolved as the official source.
      </p>

      {activeDetail ? (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/65 p-3">
          <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-uri-navy p-5 space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between gap-3">
              <h4 className="text-white text-lg font-semibold">{activeDetail.event.title}</h4>
              <button type="button" className="text-white/60 hover:text-white" onClick={() => setActiveDetail(null)}>
                ✕
              </button>
            </div>
            {activeDetail.kind === "external" && activeDetail.event.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={activeDetail.event.imageUrl} alt="" className="w-full max-h-48 object-cover rounded-lg border border-white/10" />
            ) : null}
            <p className="text-sm text-white/75">{activeDetail.event.description}</p>
            <p className="text-xs text-white/65">
              {activeDetail.event.startsAt ? new Date(activeDetail.event.startsAt).toLocaleString() : "Date TBA"}
              {"location" in activeDetail.event && activeDetail.event.location ? ` · ${activeDetail.event.location}` : ""}
            </p>
            {activeDetail.kind === "external" ? (
              <>
                {activeDetail.event.organizationName ? (
                  <p className="text-xs text-white/55">Organization: {activeDetail.event.organizationName}</p>
                ) : null}
                <p className="text-xs text-cyan-200/80">Source: URInvolved</p>
                {activeDetail.event.eventUrl ? (
                  <a
                    href={activeDetail.event.eventUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex px-3 py-2 rounded-lg text-xs font-semibold border border-cyan-400/35 text-cyan-200 hover:bg-cyan-500/10"
                  >
                    View on URInvolved
                  </a>
                ) : null}
              </>
            ) : (
              <>
                <p className="text-xs text-white/55">
                  Hosted by {eventHostLabel(activeDetail.event)} · RSVP {activeDetail.event.rsvpCount}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {(["going", "interested", "not_going"] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      disabled={rsvping === activeDetail.event.id}
                      onClick={() => void handleRsvp(activeDetail.event.id, status)}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold border ${
                        activeDetail.event.myRsvpStatus === status
                          ? "border-uri-keaney/50 text-uri-keaney bg-uri-keaney/15"
                          : "border-white/20 text-white/80 hover:bg-white/10"
                      }`}
                    >
                      {status.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
