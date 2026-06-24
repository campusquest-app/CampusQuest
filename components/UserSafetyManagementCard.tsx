"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiRequestError, deleteAuthed, fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";

type AdminUser = {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  safety: {
    status: "active" | "suspended" | "banned";
    reason: string | null;
    suspendedUntil: string | null;
  };
};

type AdminMilestoneStatus = {
  key: string;
  threshold: number;
  title: string;
  unlocked: boolean;
  unlockedAt: string | null;
  popupShownAt: string | null;
};

type AdminMilestoneSnapshot = {
  totalXp: number;
  milestones: AdminMilestoneStatus[];
  pendingPopups: AdminMilestoneStatus[];
};

export function UserSafetyManagementCard({ initialQuery }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [milestoneDebugUserId, setMilestoneDebugUserId] = useState<string | null>(null);
  const [milestoneDebug, setMilestoneDebug] = useState<AdminMilestoneSnapshot | null>(null);
  const [milestoneDebugLoading, setMilestoneDebugLoading] = useState(false);

  async function searchUsers(currentQuery: string) {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const encoded = encodeURIComponent(currentQuery.trim());
      const data = await fetchAuthed<{ users: AdminUser[] }>(`/api/internal/admin/users?query=${encoded}&limit=30`);
      setUsers(data.users ?? []);
      setForbidden(false);
      setSessionExpired(false);
    } catch (searchError) {
      if (searchError instanceof ApiRequestError && searchError.status === 403) {
        setForbidden(true);
        return;
      }
      if (searchError instanceof ApiRequestError && searchError.status === 401) {
        setSessionExpired(true);
        return;
      }
      const message = searchError instanceof Error ? searchError.message : "Could not search users.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialQuery) setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setUsers([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchUsers(query);
    }, 250);
    return () => {
      window.clearTimeout(timer);
    };
  }, [query]);

  const canSearch = useMemo(() => query.trim().length >= 2, [query]);

  async function loadMilestoneDebug(user: AdminUser) {
    if (milestoneDebugUserId === user.id) {
      setMilestoneDebugUserId(null);
      setMilestoneDebug(null);
      return;
    }

    setMilestoneDebugUserId(user.id);
    setMilestoneDebug(null);
    setMilestoneDebugLoading(true);
    setError(null);
    try {
      const data = await fetchAuthed<AdminMilestoneSnapshot & { userId: string }>(
        `/api/internal/admin/users/${encodeURIComponent(user.id)}/milestones`,
      );
      setMilestoneDebug({
        totalXp: data.totalXp,
        milestones: data.milestones,
        pendingPopups: data.pendingPopups,
      });
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Could not load milestone status.";
      setError(message);
      setMilestoneDebugUserId(null);
    } finally {
      setMilestoneDebugLoading(false);
    }
  }

  async function deleteUserAccount(user: AdminUser) {
    const confirmed = window.confirm(
      `Permanently delete ${user.displayName} (${user.email ?? user.id})?\n\nThis removes their auth account, profile, and app data. This cannot be undone.`,
    );
    if (!confirmed) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await deleteAuthed(`/api/internal/admin/users/${encodeURIComponent(user.id)}`);
      setSuccess(`Deleted ${user.displayName}.`);
      await searchUsers(query);
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Could not delete user.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(user: AdminUser, status: "active" | "suspended" | "banned") {
    let reason: string | undefined;
    let suspendedUntil: string | undefined;
    if (status === "suspended") {
      reason = (window.prompt("Suspension reason:", user.safety.reason ?? "") ?? "").trim() || undefined;
      suspendedUntil =
        (window.prompt("Optional suspension expiration (ISO):", user.safety.suspendedUntil ?? "") ?? "").trim() || undefined;
    } else if (status === "banned") {
      reason = (window.prompt("Ban reason:", user.safety.reason ?? "") ?? "").trim() || undefined;
    } else {
      reason = (window.prompt("Optional reactivation note:", "") ?? "").trim() || undefined;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await postAuthed("/api/internal/admin/moderation/users/status", {
        userId: user.id,
        status,
        reason,
        suspendedUntil,
      });
      setSuccess(`Updated ${user.displayName} to ${status}.`);
      await searchUsers(query);
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : "Could not update user safety status.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (forbidden) return null;

  return (
    <section className="card p-4 sm:p-5 space-y-4">
      <div>
        <h3 className="font-display font-semibold text-white flex items-center gap-2">
          <span aria-hidden>🧑‍⚖️</span> User Safety Management
        </h3>
        <p className="text-xs text-white/55 mt-1">Search and manage account safety status for students.</p>
      </div>

      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search username, name, or email..."
        className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2.5 text-sm text-white placeholder-white/35 focus:outline-none focus:ring-2 focus:ring-uri-keaney/50"
      />

      {sessionExpired ? (
        <p className="rounded-lg border border-amber-300/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Session expired. Please sign in again to manage users.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>
      ) : null}
      {success ? (
        <p className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">{success}</p>
      ) : null}

      <div className="space-y-3 max-h-[24rem] overflow-y-auto">
        {!canSearch ? <p className="text-xs text-white/50">Type at least 2 characters to search.</p> : null}
        {loading ? <p className="text-sm text-white/60">Searching...</p> : null}
        {canSearch && !loading && users.length === 0 ? <p className="text-sm text-white/60">No matching users found.</p> : null}
        {users.map((user) => (
          <article key={user.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-3 space-y-2">
            <p className="text-sm text-white font-semibold">
              {user.displayName} <span className="text-white/60">@{user.username}</span>
            </p>
            <p className="text-xs text-white/60">{user.email ?? "No email available"}</p>
            <p className="text-xs text-white/70">
              Status: <span className="uppercase font-semibold">{user.safety.status}</span>
              {user.safety.suspendedUntil ? ` · Until ${new Date(user.safety.suspendedUntil).toLocaleString()}` : ""}
            </p>
            {user.safety.reason ? <p className="text-xs text-white/55">Reason: {user.safety.reason}</p> : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={milestoneDebugLoading}
                onClick={() => void loadMilestoneDebug(user)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-uri-keaney/35 text-uri-keaney bg-uri-keaney/10 disabled:opacity-50"
              >
                {milestoneDebugUserId === user.id ? "Hide milestones" : "Milestones"}
              </button>
              <button
                type="button"
                disabled={submitting || user.safety.status === "suspended"}
                onClick={() => void updateStatus(user, "suspended")}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-amber-400/35 text-amber-200 bg-amber-500/10 disabled:opacity-50"
              >
                Suspend
              </button>
              <button
                type="button"
                disabled={submitting || user.safety.status === "banned"}
                onClick={() => void updateStatus(user, "banned")}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-rose-400/35 text-rose-200 bg-rose-500/10 disabled:opacity-50"
              >
                Ban
              </button>
              <button
                type="button"
                disabled={submitting || user.safety.status === "active"}
                onClick={() => void updateStatus(user, "active")}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-emerald-400/35 text-emerald-200 bg-emerald-500/10 disabled:opacity-50"
              >
                Reactivate
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void deleteUserAccount(user)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-rose-500/45 text-rose-200 bg-rose-500/10 disabled:opacity-50"
              >
                Delete user
              </button>
            </div>
            {milestoneDebugUserId === user.id ? (
              <div className="rounded-lg border border-white/10 bg-black/20 p-2.5 space-y-2">
                {milestoneDebugLoading ? (
                  <p className="text-xs text-white/60">Loading milestone status...</p>
                ) : milestoneDebug ? (
                  <>
                    <p className="text-xs text-white/80">
                      Current XP: <span className="font-semibold text-white">{milestoneDebug.totalXp}</span>
                    </p>
                    <ul className="space-y-1.5">
                      {milestoneDebug.milestones.map((milestone) => (
                        <li key={milestone.key} className="text-xs text-white/70">
                          <span className="font-semibold text-white">{milestone.title}</span> ({milestone.threshold} XP)
                          {" · "}
                          {milestone.unlocked ? "Unlocked" : "Locked"}
                          {milestone.unlockedAt ? ` · ${new Date(milestone.unlockedAt).toLocaleString()}` : ""}
                          {" · "}
                          Popup: {milestone.popupShownAt ? `shown ${new Date(milestone.popupShownAt).toLocaleString()}` : "pending"}
                        </li>
                      ))}
                    </ul>
                    {milestoneDebug.pendingPopups.length > 0 ? (
                      <p className="text-xs text-amber-200">
                        Pending popups: {milestoneDebug.pendingPopups.map((milestone) => milestone.title).join(", ")}
                      </p>
                    ) : (
                      <p className="text-xs text-white/50">No pending milestone popups.</p>
                    )}
                  </>
                ) : null}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
