"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAuthed } from "@/lib/client/dashboardApi";
import { AdminSectionIntro } from "@/components/admin/AdminUi";
import { PilotAnalyticsCard } from "@/components/PilotAnalyticsCard";

type EngagementRangePreset = "7d" | "30d" | "semester" | "custom";

type CohortRow = {
  key: string;
  label: string;
  uniqueStudents: number | null;
  totalEvents: number | null;
  suppressed: boolean;
  displayLabel: string;
  percentOfActivePosters?: number | null;
};

type EngagementSnapshot = {
  range: { preset: string; startIso: string; endIso: string };
  notes: Record<string, string>;
  metrics: {
    activeStudents: number;
    studentsPosting: number;
    postsCreated: number;
    eventRsvps: number;
    uniqueEventRsvpers: number;
    verifiedEventAttendees: number | null;
    onboardingCompletionRate: number;
    totalStudents: number;
    onboardedStudents: number;
  };
  studentMakeup: {
    byGraduationYear: CohortRow[];
    byClassStanding: CohortRow[];
    byCommunity: CohortRow[];
    byInterest: CohortRow[];
  };
  posting: {
    byClassStanding: CohortRow[];
    byGraduationYear: CohortRow[];
    byCommunity: CohortRow[];
    byInterest: CohortRow[];
  };
  rsvpEngagement: {
    byClassStanding: CohortRow[];
    byGraduationYear: CohortRow[];
    byCommunity: CohortRow[];
    byInterest: CohortRow[];
  };
  events: Array<{
    eventId: string;
    title: string;
    startsAt: string | null;
    uniqueViewers: number | null;
    totalRsvps: number;
    uniqueRsvps: number;
    verifiedAttendees: number | null;
    insight: string | null;
  }>;
  hasVerifiedAttendanceSignal: boolean;
};

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="cq-admin-panel p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/45">{label}</p>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function CohortTable({ title, rows, eventLabel = "Events" }: { title: string; rows: CohortRow[]; eventLabel?: string }) {
  return (
    <div className="cq-admin-panel p-4">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-1 text-[11px] text-white/40">Cohorts with &lt;5 unique students are suppressed.</p>
      <ul className="mt-3 divide-y divide-white/10">
        {rows.length === 0 ? <li className="py-2 text-sm text-white/50">No data in range.</li> : null}
        {rows.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="text-white/85">{row.suppressed ? row.displayLabel : row.label}</span>
            <span className="text-right text-xs text-white/55">
              {row.suppressed ? (
                "—"
              ) : (
                <>
                  {row.uniqueStudents} unique
                  {row.totalEvents != null ? ` · ${row.totalEvents} ${eventLabel}` : ""}
                  {row.percentOfActivePosters != null ? ` · ${row.percentOfActivePosters}%` : ""}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AdminAnalyticsSection() {
  const [tab, setTab] = useState<"pilot" | "engagement">("pilot");
  const [preset, setPreset] = useState<EngagementRangePreset>("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [snapshot, setSnapshot] = useState<EngagementSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEngagement = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ preset });
      if (preset === "custom") {
        params.set("start", customStart);
        params.set("end", customEnd);
      }
      const data = await fetchAuthed<EngagementSnapshot>(`/api/internal/admin/student-engagement?${params}`);
      setSnapshot(data);
    } catch (err) {
      setSnapshot(null);
      setError(err instanceof Error ? err.message : "Could not load engagement analytics.");
    } finally {
      setLoading(false);
    }
  }, [preset, customStart, customEnd]);

  useEffect(() => {
    if (tab !== "engagement") return;
    if (preset === "custom" && (!customStart || !customEnd)) return;
    void loadEngagement();
  }, [tab, preset, customStart, customEnd, loadEngagement]);

  return (
    <div className="space-y-4">
      <AdminSectionIntro
        title="Analytics"
        description="Pilot growth metrics and aggregated student engagement for university leadership."
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("pilot")}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
            tab === "pilot" ? "bg-uri-keaney text-white" : "border border-white/15 text-white/70"
          }`}
        >
          Pilot Analytics
        </button>
        <button
          type="button"
          onClick={() => setTab("engagement")}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
            tab === "engagement" ? "bg-uri-keaney text-white" : "border border-white/15 text-white/70"
          }`}
        >
          Student Engagement
        </button>
      </div>

      {tab === "pilot" ? (
        <>
          <PilotAnalyticsCard />
          <div className="grid gap-3 md:grid-cols-3">
            <div className="cq-admin-panel p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/45">Engagement</p>
              <p className="mt-2 text-sm text-white/70">
                Open Student Engagement for cohort posting and RSVP breakdowns.
              </p>
            </div>
            <div className="cq-admin-panel p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/45">Growth</p>
              <p className="mt-2 text-sm text-white/70">User and organization counts reflect verified pilot campus adoption.</p>
            </div>
            <div className="cq-admin-panel p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/45">Safety</p>
              <p className="mt-2 text-sm text-white/70">Report volume helps prioritize moderation workload.</p>
            </div>
          </div>
        </>
      ) : null}

      {tab === "engagement" ? (
        <div className="space-y-4">
          <div className="cq-admin-panel flex flex-wrap items-end gap-3 p-4">
            {(
              [
                ["7d", "Last 7 days"],
                ["30d", "Last 30 days"],
                ["semester", "Semester"],
                ["custom", "Custom range"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPreset(id)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                  preset === id ? "bg-uri-keaney text-white" : "border border-white/15 text-white/70"
                }`}
              >
                {label}
              </button>
            ))}
            {preset === "custom" ? (
              <>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="rounded-lg border border-white/15 bg-black/20 px-3 py-1.5 text-sm text-white"
                />
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="rounded-lg border border-white/15 bg-black/20 px-3 py-1.5 text-sm text-white"
                />
              </>
            ) : null}
            <button
              type="button"
              onClick={() => void loadEngagement()}
              className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-white"
            >
              Refresh
            </button>
          </div>

          {loading ? <p className="text-sm text-white/60">Loading engagement…</p> : null}
          {error ? <p className="text-sm text-amber-300">{error}</p> : null}

          {snapshot ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Metric label="Active Students" value={snapshot.metrics.activeStudents} />
                <Metric label="Students Posting" value={snapshot.metrics.studentsPosting} />
                <Metric label="Posts Created" value={snapshot.metrics.postsCreated} />
                <Metric label="Event RSVPs" value={snapshot.metrics.eventRsvps} />
                <Metric
                  label={snapshot.hasVerifiedAttendanceSignal ? "Verified Event Attendees" : "RSVP Engagement (unique)"}
                  value={
                    snapshot.hasVerifiedAttendanceSignal
                      ? (snapshot.metrics.verifiedEventAttendees ?? 0)
                      : snapshot.metrics.uniqueEventRsvpers
                  }
                />
                <Metric label="Onboarding Completion Rate" value={`${snapshot.metrics.onboardingCompletionRate}%`} />
              </div>

              <p className="text-xs text-white/45">{snapshot.notes.cohortOverlap}</p>
              <p className="text-xs text-white/45">{snapshot.notes.attendance}</p>

              <h3 className="text-base font-semibold text-white">Student makeup</h3>
              <div className="grid gap-3 lg:grid-cols-2">
                <CohortTable title="Graduation year" rows={snapshot.studentMakeup.byGraduationYear} eventLabel="students" />
                <CohortTable title="Class standing" rows={snapshot.studentMakeup.byClassStanding} eventLabel="students" />
                <CohortTable title="Communities" rows={snapshot.studentMakeup.byCommunity} eventLabel="students" />
                <CohortTable title="Interests" rows={snapshot.studentMakeup.byInterest} eventLabel="students" />
              </div>

              <h3 className="text-base font-semibold text-white">
                Students Posting — {preset === "30d" ? "Last 30 Days" : preset}
              </h3>
              <div className="grid gap-3 lg:grid-cols-2">
                <CohortTable title="By class standing" rows={snapshot.posting.byClassStanding} eventLabel="posts" />
                <CohortTable title="By graduation year" rows={snapshot.posting.byGraduationYear} eventLabel="posts" />
                <CohortTable title="By community (may overlap)" rows={snapshot.posting.byCommunity} eventLabel="posts" />
                <CohortTable title="By interest (may overlap)" rows={snapshot.posting.byInterest} eventLabel="posts" />
              </div>

              <h3 className="text-base font-semibold text-white">Event RSVP engagement</h3>
              <div className="grid gap-3 lg:grid-cols-2">
                <CohortTable title="RSVPs by class standing" rows={snapshot.rsvpEngagement.byClassStanding} eventLabel="RSVPs" />
                <CohortTable title="RSVPs by community" rows={snapshot.rsvpEngagement.byCommunity} eventLabel="RSVPs" />
              </div>

              <h3 className="text-base font-semibold text-white">Events</h3>
              <div className="space-y-3">
                {snapshot.events.length === 0 ? (
                  <p className="text-sm text-white/50">No RSVP or verified attendance activity in this range.</p>
                ) : (
                  snapshot.events.map((ev) => (
                    <div key={ev.eventId} className="cq-admin-panel p-4">
                      <p className="font-semibold text-white">{ev.title}</p>
                      <p className="text-xs text-white/45">
                        {ev.startsAt ? new Date(ev.startsAt).toLocaleString() : "Date TBD"}
                      </p>
                      <div className="mt-2 grid gap-2 text-sm text-white/75 sm:grid-cols-3">
                        <span>RSVPs: {ev.uniqueRsvps} unique ({ev.totalRsvps} total)</span>
                        <span>
                          {ev.verifiedAttendees == null
                            ? "Verified attendees: n/a"
                            : `Verified attendees: ${ev.verifiedAttendees}`}
                        </span>
                        <span>Viewers: {ev.uniqueViewers == null ? "n/a" : ev.uniqueViewers}</span>
                      </div>
                      {ev.insight ? <p className="mt-2 text-sm text-uri-keaney/90">{ev.insight}</p> : null}
                    </div>
                  ))
                )}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
