"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAuthed } from "@/lib/client/dashboardApi";
import { AdminSectionIntro } from "@/components/admin/AdminUi";
import { COMMUNITY_OPTIONS, INTEREST_OPTIONS } from "@/lib/onboarding/taxonomy";
import { classStandingLabel, type ClassStandingId } from "@/lib/onboarding/graduationYear";

type StudentRow = {
  id: string;
  username: string | null;
  displayName: string | null;
  email: string | null;
  accountStatus: string;
  emailVerified: boolean;
  role: string;
  graduationYear: number | null;
  classStanding: ClassStandingId;
  classStandingLabel: string;
  interests: string[];
  communities: string[];
  onboardingCompleted: boolean;
  onboardingVersion: number | null;
  signupDate: string | null;
  lastActiveAt: string | null;
};

type DirectoryResponse = {
  students: StudentRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

const STANDINGS: ClassStandingId[] = ["freshman", "sophomore", "junior", "senior", "graduate", "other"];

export function AdminStudentDirectorySection() {
  const [query, setQuery] = useState("");
  const [graduationYear, setGraduationYear] = useState("");
  const [classStanding, setClassStanding] = useState("");
  const [interest, setInterest] = useState("");
  const [community, setCommunity] = useState("");
  const [role, setRole] = useState("");
  const [verified, setVerified] = useState("");
  const [onboardingComplete, setOnboardingComplete] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<DirectoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", "25");
      if (query.trim()) params.set("query", query.trim());
      if (graduationYear) params.set("graduationYear", graduationYear);
      if (classStanding) params.set("classStanding", classStanding);
      if (interest) params.set("interest", interest);
      if (community) params.set("community", community);
      if (role) params.set("role", role);
      if (verified) params.set("verified", verified);
      if (onboardingComplete) params.set("onboardingComplete", onboardingComplete);
      const res = await fetchAuthed<DirectoryResponse>(`/api/internal/admin/student-directory?${params}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load directory.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [
    page,
    query,
    graduationYear,
    classStanding,
    interest,
    community,
    role,
    verified,
    onboardingComplete,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <AdminSectionIntro
        title="Student Directory"
        description="Authorized CampusQuest admins only. Demographic fields come from explicit onboarding answers."
      />

      <div className="cq-admin-panel space-y-3 p-4">
        <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-4">
          <input
            value={query}
            onChange={(e) => {
              setPage(1);
              setQuery(e.target.value);
            }}
            placeholder="Search name / email"
            className="rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-white/35"
          />
          <input
            value={graduationYear}
            onChange={(e) => {
              setPage(1);
              setGraduationYear(e.target.value);
            }}
            placeholder="Graduation year"
            className="rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-white/35"
          />
          <select
            value={classStanding}
            onChange={(e) => {
              setPage(1);
              setClassStanding(e.target.value);
            }}
            className="rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white"
          >
            <option value="">Class standing</option>
            {STANDINGS.map((s) => (
              <option key={s} value={s}>
                {classStandingLabel(s)}
              </option>
            ))}
          </select>
          <select
            value={interest}
            onChange={(e) => {
              setPage(1);
              setInterest(e.target.value);
            }}
            className="rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white"
          >
            <option value="">Interest</option>
            {INTEREST_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={community}
            onChange={(e) => {
              setPage(1);
              setCommunity(e.target.value);
            }}
            className="rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white"
          >
            <option value="">Community</option>
            {COMMUNITY_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={role}
            onChange={(e) => {
              setPage(1);
              setRole(e.target.value);
            }}
            className="rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white"
          >
            <option value="">Role</option>
            <option value="student">Student</option>
            <option value="faculty_staff">Faculty / Staff</option>
          </select>
          <select
            value={verified}
            onChange={(e) => {
              setPage(1);
              setVerified(e.target.value);
            }}
            className="rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white"
          >
            <option value="">Verified</option>
            <option value="yes">Verified</option>
            <option value="no">Unverified</option>
          </select>
          <select
            value={onboardingComplete}
            onChange={(e) => {
              setPage(1);
              setOnboardingComplete(e.target.value);
            }}
            className="rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white"
          >
            <option value="">Onboarding</option>
            <option value="yes">Complete</option>
            <option value="no">Incomplete</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-uri-keaney px-4 py-2 text-sm font-semibold text-white"
        >
          Refresh
        </button>
      </div>

      {loading ? <p className="text-sm text-white/60">Loading students…</p> : null}
      {error ? <p className="text-sm text-amber-300">{error}</p> : null}

      {data ? (
        <>
          <p className="text-xs text-white/45">
            {data.pagination.total} students · page {data.pagination.page} of {data.pagination.totalPages}
          </p>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="min-w-full text-left text-sm text-white/90">
              <thead className="bg-white/5 text-xs uppercase tracking-wide text-white/50">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Year</th>
                  <th className="px-3 py-2">Interests</th>
                  <th className="px-3 py-2">Communities</th>
                  <th className="px-3 py-2">Onboarding</th>
                  <th className="px-3 py-2">Signup</th>
                  <th className="px-3 py-2">Last active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {data.students.map((s) => (
                  <tr key={s.id} className="align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium">{s.displayName ?? s.username ?? "—"}</div>
                      <div className="text-xs text-white/45">@{s.username ?? "—"}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">{s.email ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      {s.accountStatus}
                      <div>{s.emailVerified ? "Verified" : "Unverified"}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">{s.role}</td>
                    <td className="px-3 py-2 text-xs">
                      {s.graduationYear ?? "—"}
                      <div className="text-white/45">{s.classStandingLabel}</div>
                    </td>
                    <td className="px-3 py-2 text-xs max-w-[10rem]">{s.interests.join(", ") || "—"}</td>
                    <td className="px-3 py-2 text-xs max-w-[10rem]">{s.communities.join(", ") || "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      {s.onboardingCompleted ? "Complete" : "Incomplete"}
                      {s.onboardingVersion != null ? ` · v${s.onboardingVersion}` : ""}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {s.signupDate ? new Date(s.signupDate).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {s.lastActiveAt ? new Date(s.lastActiveAt).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!data || page >= data.pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
