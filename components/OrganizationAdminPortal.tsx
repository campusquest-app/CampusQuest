"use client";

import { useEffect, useMemo, useState } from "react";
import { deleteAuthed, fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";

type DashboardPayload = {
  organization: {
    id: string;
    name: string;
    description: string;
    category: string;
    logoUrl: string | null;
    schoolName: string;
    contactLink: string | null;
    requireJoinApproval: boolean;
    isFrozen: boolean;
    frozenReason: string | null;
    isRemovedByModeration: boolean;
  };
  myRole: "owner" | "admin" | "member";
  members: Array<{
    id: string;
    userId: string;
    role: "owner" | "admin" | "member";
    membershipKind: "member" | "follower";
    status: "pending" | "approved" | "denied";
    createdAt: string;
    profile: { id: string; username: string; display_name: string } | null;
  }>;
  joinRequests: Array<{
    id: string;
    requesterId: string;
    status: "pending" | "approved" | "denied";
    createdAt: string;
    profile: { id: string; username: string; display_name: string } | null;
  }>;
  events: Array<{ id: string; title: string; startsAt: string; isCancelled: boolean; attendance: number }>;
  announcements: Array<{ id: string; title: string; message: string; createdAt: string }>;
  analytics: { followerCount: number; memberCount: number; eventAttendance: number; engagementActivity: number };
};

type Tab = "profile" | "members" | "events" | "announcements" | "analytics";

export function OrganizationAdminPortal({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const [tab, setTab] = useState<Tab>("profile");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [newEvent, setNewEvent] = useState({
    title: "",
    description: "",
    category: "",
    locationName: "",
    startsAt: "",
  });
  const [announcement, setAnnouncement] = useState({ title: "", message: "" });
  const [attendeesByEvent, setAttendeesByEvent] = useState<Record<string, Array<{ userId: string; status: string; profile: any }>>>({});

  async function loadDashboard() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAuthed<{ dashboard: DashboardPayload }>(`/api/organizations/${organizationId}/admin/dashboard`);
      setDashboard(data.dashboard);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load organization portal.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const approvedMembers = useMemo(
    () => (dashboard?.members ?? []).filter((member) => member.status === "approved" && member.membershipKind === "member"),
    [dashboard?.members],
  );

  async function saveProfile() {
    if (!dashboard) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await postAuthed(`/api/organizations/${organizationId}/admin/settings`, {
        name: dashboard.organization.name,
        description: dashboard.organization.description,
        category: dashboard.organization.category,
        contactLink: dashboard.organization.contactLink,
        requireJoinApproval: dashboard.organization.requireJoinApproval,
      });
      setNotice("Organization profile updated.");
      await loadDashboard();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save profile.");
    } finally {
      setSubmitting(false);
    }
  }

  async function moderateMember(payload: Record<string, unknown>) {
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await postAuthed(`/api/organizations/${organizationId}/admin/members`, payload as any);
      setNotice("Member update saved.");
      await loadDashboard();
    } catch (memberError) {
      setError(memberError instanceof Error ? memberError.message : "Could not update membership.");
    } finally {
      setSubmitting(false);
    }
  }

  async function createEvent() {
    if (!newEvent.title || !newEvent.description || !newEvent.category || !newEvent.locationName || !newEvent.startsAt) {
      setError("Complete all event fields.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await postAuthed(`/api/organizations/${organizationId}/admin/events`, {
        ...newEvent,
        startsAt: new Date(newEvent.startsAt).toISOString(),
      } as any);
      setNewEvent({ title: "", description: "", category: "", locationName: "", startsAt: "" });
      setNotice("Organization event created.");
      await loadDashboard();
    } catch (eventError) {
      setError(eventError instanceof Error ? eventError.message : "Could not create event.");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteEvent(eventId: string) {
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await deleteAuthed(`/api/organizations/${organizationId}/admin/events/${eventId}`);
      setNotice("Event deleted.");
      await loadDashboard();
    } catch (eventError) {
      setError(eventError instanceof Error ? eventError.message : "Could not delete event.");
    } finally {
      setSubmitting(false);
    }
  }

  async function quickEditEvent(eventId: string, currentTitle: string) {
    const nextTitle = window.prompt("Edit event title", currentTitle) ?? "";
    if (!nextTitle.trim() || nextTitle.trim() === currentTitle) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await postAuthed(`/api/organizations/${organizationId}/admin/events/${eventId}`, {
        title: nextTitle.trim(),
      } as any);
      setNotice("Event updated.");
      await loadDashboard();
    } catch (eventError) {
      setError(eventError instanceof Error ? eventError.message : "Could not update event.");
    } finally {
      setSubmitting(false);
    }
  }

  async function loadAttendees(eventId: string) {
    try {
      const data = await fetchAuthed<{ attendees: Array<{ userId: string; status: string; profile: any }> }>(
        `/api/organizations/${organizationId}/admin/events/${eventId}/attendees`,
      );
      setAttendeesByEvent((prev) => ({ ...prev, [eventId]: data.attendees ?? [] }));
    } catch (attendeeError) {
      setError(attendeeError instanceof Error ? attendeeError.message : "Could not load attendees.");
    }
  }

  async function postAnnouncement() {
    if (!announcement.title.trim() || !announcement.message.trim()) {
      setError("Announcement title and message are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await postAuthed(`/api/organizations/${organizationId}/admin/announcements`, {
        title: announcement.title,
        message: announcement.message,
      } as any);
      setAnnouncement({ title: "", message: "" });
      setNotice("Announcement sent.");
      await loadDashboard();
    } catch (announcementError) {
      setError(announcementError instanceof Error ? announcementError.message : "Could not send announcement.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="card p-4 text-sm text-white/70">Loading organization admin portal...</div>;
  if (!dashboard) return <div className="card p-4 text-sm text-rose-200">{error ?? "Organization dashboard unavailable."}</div>;

  return (
    <section className="card p-4 space-y-4">
      <div>
        <h4 className="text-white font-semibold">Organization Admin Portal · {organizationName}</h4>
        <p className="text-xs text-white/55 mt-1">Role: {dashboard.myRole.toUpperCase()}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {(["profile", "members", "events", "announcements", "analytics"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
              tab === item ? "border-uri-keaney/50 text-uri-keaney bg-uri-keaney/15" : "border-white/20 text-white/75 hover:bg-white/10"
            }`}
          >
            {item}
          </button>
        ))}
      </div>
      {notice ? <p className="text-xs text-emerald-200">{notice}</p> : null}
      {error ? <p className="text-xs text-rose-200">{error}</p> : null}

      {tab === "profile" ? (
        <div className="space-y-2">
          <input
            value={dashboard.organization.name}
            onChange={(event) =>
              setDashboard((prev) =>
                prev
                  ? { ...prev, organization: { ...prev.organization, name: event.target.value } }
                  : prev,
              )
            }
            className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-sm text-white"
          />
          <textarea
            value={dashboard.organization.description}
            onChange={(event) =>
              setDashboard((prev) =>
                prev
                  ? { ...prev, organization: { ...prev.organization, description: event.target.value } }
                  : prev,
              )
            }
            rows={3}
            className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-sm text-white"
          />
          <label className="flex items-center gap-2 text-xs text-white/75">
            <input
              type="checkbox"
              checked={dashboard.organization.requireJoinApproval}
              onChange={(event) =>
                setDashboard((prev) =>
                  prev
                    ? { ...prev, organization: { ...prev.organization, requireJoinApproval: event.target.checked } }
                    : prev,
                )
              }
            />
            Require approval for join requests
          </label>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void saveProfile()}
            className="rounded-lg bg-uri-keaney text-uri-navy text-xs font-semibold px-3 py-2 disabled:opacity-60"
          >
            Save profile
          </button>
        </div>
      ) : null}

      {tab === "members" ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <p className="text-xs text-white/60">Pending join requests</p>
            {dashboard.joinRequests.length === 0 ? <p className="text-xs text-white/50">No pending requests.</p> : null}
            {dashboard.joinRequests.map((request) => (
              <div key={request.id} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 flex items-center justify-between gap-2">
                <p className="text-xs text-white/80">
                  {request.profile?.display_name ?? "Student"} @{request.profile?.username ?? "unknown"}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void moderateMember({ action: "approve_join", requestId: request.id })}
                    className="px-2 py-1 rounded text-[11px] border border-emerald-400/35 text-emerald-200"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void moderateMember({ action: "deny_join", requestId: request.id })}
                    className="px-2 py-1 rounded text-[11px] border border-white/20 text-white/75"
                  >
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-xs text-white/60">Approved members</p>
            {approvedMembers.length === 0 ? <p className="text-xs text-white/50">No approved members yet.</p> : null}
            {approvedMembers.map((member) => (
              <div key={member.id} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 flex items-center justify-between gap-2">
                <p className="text-xs text-white/80">
                  {member.profile?.display_name ?? "Student"} @{member.profile?.username ?? "unknown"} · {member.role}
                </p>
                <div className="flex gap-2">
                  {dashboard.myRole === "owner" ? (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() =>
                        void moderateMember({
                          action: "set_role",
                          memberUserId: member.userId,
                          role: member.role === "admin" ? "member" : "admin",
                        })
                      }
                      className="px-2 py-1 rounded text-[11px] border border-uri-keaney/40 text-uri-keaney"
                    >
                      {member.role === "admin" ? "Set member" : "Set admin"}
                    </button>
                  ) : null}
                  {member.role !== "owner" ? (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => void moderateMember({ action: "remove_member", memberUserId: member.userId })}
                      className="px-2 py-1 rounded text-[11px] border border-rose-400/35 text-rose-200"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "events" ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              value={newEvent.title}
              onChange={(event) => setNewEvent((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="Event title"
              className="rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-xs text-white"
            />
            <input
              value={newEvent.category}
              onChange={(event) => setNewEvent((prev) => ({ ...prev, category: event.target.value }))}
              placeholder="Category"
              className="rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-xs text-white"
            />
            <input
              value={newEvent.locationName}
              onChange={(event) => setNewEvent((prev) => ({ ...prev, locationName: event.target.value }))}
              placeholder="Location"
              className="rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-xs text-white"
            />
            <input
              type="datetime-local"
              value={newEvent.startsAt}
              onChange={(event) => setNewEvent((prev) => ({ ...prev, startsAt: event.target.value }))}
              className="rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-xs text-white"
            />
            <textarea
              value={newEvent.description}
              onChange={(event) => setNewEvent((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Description"
              rows={2}
              className="rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-xs text-white sm:col-span-2"
            />
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void createEvent()}
            className="rounded-lg bg-uri-keaney text-uri-navy text-xs font-semibold px-3 py-2 disabled:opacity-60"
          >
            Create event
          </button>
          <div className="space-y-2">
            {dashboard.events.length === 0 ? <p className="text-xs text-white/50">No organization events yet.</p> : null}
            {dashboard.events.map((event) => (
              <div key={event.id} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-white/80">
                    {event.title} · Attendance {event.attendance}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => void quickEditEvent(event.id, event.title)}
                      className="px-2 py-1 rounded text-[11px] border border-uri-keaney/40 text-uri-keaney"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => void deleteEvent(event.id)}
                      className="px-2 py-1 rounded text-[11px] border border-rose-400/35 text-rose-200"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void loadAttendees(event.id)}
                    className="px-2 py-1 rounded text-[11px] border border-white/20 text-white/75"
                  >
                    View RSVP list
                  </button>
                </div>
                {attendeesByEvent[event.id]?.length ? (
                  <div className="space-y-1">
                    {attendeesByEvent[event.id].slice(0, 10).map((attendee) => (
                      <p key={`${event.id}-${attendee.userId}`} className="text-[11px] text-white/65">
                        {attendee.profile?.display_name ?? "Student"} @{attendee.profile?.username ?? "unknown"} · {attendee.status}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "announcements" ? (
        <div className="space-y-3">
          <input
            value={announcement.title}
            onChange={(event) => setAnnouncement((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="Announcement title"
            className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-sm text-white"
          />
          <textarea
            value={announcement.message}
            onChange={(event) => setAnnouncement((prev) => ({ ...prev, message: event.target.value }))}
            rows={3}
            placeholder="Announcement message"
            className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-sm text-white"
          />
          <button
            type="button"
            disabled={submitting}
            onClick={() => void postAnnouncement()}
            className="rounded-lg bg-uri-keaney text-uri-navy text-xs font-semibold px-3 py-2 disabled:opacity-60"
          >
            Send announcement
          </button>
          <div className="space-y-2">
            {dashboard.announcements.length === 0 ? <p className="text-xs text-white/50">No announcements posted yet.</p> : null}
            {dashboard.announcements.map((item) => (
              <div key={item.id} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <p className="text-xs text-white">{item.title}</p>
                <p className="text-xs text-white/70 mt-1">{item.message}</p>
                <p className="text-[11px] text-white/45 mt-1">{new Date(item.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "analytics" ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Metric label="Followers" value={dashboard.analytics.followerCount} />
          <Metric label="Members" value={dashboard.analytics.memberCount} />
          <Metric label="Attendance" value={dashboard.analytics.eventAttendance} />
          <Metric label="Engagement" value={dashboard.analytics.engagementActivity} />
        </div>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
      <p className="text-[11px] text-white/55">{label}</p>
      <p className="text-lg font-semibold text-white">{value.toLocaleString()}</p>
    </div>
  );
}
