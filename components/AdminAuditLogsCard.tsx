"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiRequestError, fetchAuthed } from "@/lib/client/dashboardApi";
import { AdminStatusPill } from "@/components/admin/AdminUi";

type AuditLog = {
  id: string;
  createdAt: string;
  actionType: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  admin: {
    userId: string | null;
    email: string | null;
    username: string | null;
    displayName: string | null;
  };
  targetUser: {
    userId: string;
    username: string | null;
    displayName: string | null;
  } | null;
};

type TimeFilter = "all" | "today" | "7d" | "30d";
type CategoryFilter = "all" | "moderation" | "policy" | "organizations" | "sync";

const MODERATION_ACTIONS = ["user_suspend", "user_ban", "user_reactivate", "message_report", "content_remove", "content_restore", "appeal"];
const POLICY_ACTIONS = ["legal_policy_activate", "legal_policy"];
const ORG_ACTIONS = ["organization", "org_creation"];
const SYNC_ACTIONS = ["urinvolved", "sync"];

function matchesCategory(actionType: string, category: CategoryFilter): boolean {
  if (category === "all") return true;
  const lower = actionType.toLowerCase();
  if (category === "moderation") return MODERATION_ACTIONS.some((needle) => lower.includes(needle));
  if (category === "policy") return POLICY_ACTIONS.some((needle) => lower.includes(needle));
  if (category === "organizations") return ORG_ACTIONS.some((needle) => lower.includes(needle));
  if (category === "sync") return SYNC_ACTIONS.some((needle) => lower.includes(needle));
  return true;
}

function matchesTime(createdAt: string, filter: TimeFilter): boolean {
  if (filter === "all") return true;
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  if (filter === "today") return created >= now - 24 * 60 * 60 * 1000;
  if (filter === "7d") return created >= now - 7 * 24 * 60 * 60 * 1000;
  if (filter === "30d") return created >= now - 30 * 24 * 60 * 60 * 1000;
  return true;
}

export function AdminAuditLogsCard({
  enhanced = false,
  initialSearch,
}: {
  enhanced?: boolean;
  initialSearch?: string;
}) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [search, setSearch] = useState(initialSearch ?? "");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("7d");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSessionExpired(false);
    try {
      const data = await fetchAuthed<{ logs: AuditLog[] }>("/api/internal/admin/audit-logs?limit=120");
      setLogs(data.logs ?? []);
      setForbidden(false);
    } catch (loadError) {
      if (loadError instanceof ApiRequestError && loadError.status === 403) {
        setForbidden(true);
        return;
      }
      if (loadError instanceof ApiRequestError && loadError.status === 401) {
        setSessionExpired(true);
        return;
      }
      const message = loadError instanceof Error ? loadError.message : "Could not load audit logs.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    if (initialSearch) setSearch(initialSearch);
  }, [initialSearch]);

  const filteredLogs = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return logs.filter((log) => {
      if (!matchesTime(log.createdAt, timeFilter)) return false;
      if (!matchesCategory(log.actionType, categoryFilter)) return false;
      if (!needle) return true;
      const haystack = [
        log.actionType,
        log.reason,
        log.admin.email,
        log.admin.displayName,
        log.admin.username,
        log.targetUser?.displayName,
        log.targetUser?.username,
        JSON.stringify(log.metadata ?? {}),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [logs, search, timeFilter, categoryFilter]);

  if (forbidden) return null;

  return (
    <section className={enhanced ? "space-y-4" : "card p-4 sm:p-5 space-y-4"}>
      {!enhanced ? (
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display font-semibold text-white flex items-center gap-2">
              <span aria-hidden>🧾</span> Admin Audit Logs
            </h3>
            <p className="text-xs text-white/55 mt-1">Recent moderation and policy admin actions.</p>
          </div>
          <button
            type="button"
            onClick={() => void loadLogs()}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-uri-keaney/40 text-uri-keaney hover:bg-uri-keaney/10 disabled:opacity-60"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-white/70">{filteredLogs.length} matching entries</p>
          </div>
          <button
            type="button"
            onClick={() => void loadLogs()}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-uri-keaney/40 text-uri-keaney hover:bg-uri-keaney/10 disabled:opacity-60"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      )}

      {enhanced ? (
        <div className="cq-admin-panel space-y-3 p-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search action, admin, target, reason…"
            className="w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-white/40"
          />
          <div className="flex flex-wrap gap-2">
            {(["all", "today", "7d", "30d"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTimeFilter(value)}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold border ${
                  timeFilter === value ? "border-uri-keaney/40 bg-uri-keaney/15 text-uri-keaney" : "border-white/15 text-white/65"
                }`}
              >
                {value === "all" ? "All time" : value === "today" ? "Today" : value === "7d" ? "7 Days" : "30 Days"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", "All"],
                ["moderation", "Moderation"],
                ["policy", "Policy"],
                ["organizations", "Organizations"],
                ["sync", "Sync Actions"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setCategoryFilter(value)}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold border ${
                  categoryFilter === value ? "border-cyan-400/35 bg-cyan-500/10 text-cyan-200" : "border-white/15 text-white/65"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {sessionExpired ? (
        <p className="rounded-lg border border-amber-300/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Session expired. Please sign in again to view audit logs.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>
      ) : null}

      <div className={`space-y-2 ${enhanced ? "" : "max-h-[24rem] overflow-y-auto"}`}>
        {filteredLogs.length === 0 && !loading && !error && !sessionExpired ? (
          <p className="text-sm text-white/60">No audit logs match your filters.</p>
        ) : null}
        {filteredLogs.slice(0, enhanced ? 50 : undefined).map((log) =>
          enhanced ? (
            <details key={log.id} className="cq-admin-panel group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 marker:content-none">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{log.actionType}</p>
                  <p className="text-[11px] text-white/45">
                    {new Date(log.createdAt).toLocaleString()} · {log.admin.displayName ?? log.admin.email ?? "Admin"}
                  </p>
                </div>
                <AdminStatusPill label="Details" tone="neutral" />
              </summary>
              <div className="space-y-1.5 border-t border-white/10 px-3 py-2 text-xs text-white/70">
                {log.targetUser ? (
                  <p>
                    Target: {log.targetUser.displayName ?? log.targetUser.username ?? log.targetUser.userId}
                  </p>
                ) : null}
                {log.reason ? <p>Reason: {log.reason}</p> : null}
                <p className="break-words text-white/45">Metadata: {JSON.stringify(log.metadata ?? {})}</p>
              </div>
            </details>
          ) : (
            <article key={log.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-3 space-y-1.5">
              <p className="text-xs text-white/50">{new Date(log.createdAt).toLocaleString()}</p>
              <p className="text-sm text-white font-semibold">{log.actionType}</p>
              <p className="text-xs text-white/70">
                Admin: {log.admin.displayName ?? log.admin.username ?? "Unknown"} ({log.admin.email ?? "No email"})
              </p>
              {log.targetUser ? (
                <p className="text-xs text-white/65">
                  Target: {log.targetUser.displayName ?? log.targetUser.username ?? log.targetUser.userId}
                </p>
              ) : null}
              {log.reason ? <p className="text-xs text-white/60">Reason: {log.reason}</p> : null}
              <p className="text-[11px] text-white/45 break-words">Metadata: {JSON.stringify(log.metadata ?? {})}</p>
            </article>
          ),
        )}
      </div>
    </section>
  );
}
