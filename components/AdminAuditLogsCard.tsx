"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiRequestError, fetchAuthed } from "@/lib/client/dashboardApi";

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

export function AdminAuditLogsCard() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

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

  if (forbidden) return null;

  return (
    <section className="card p-4 sm:p-5 space-y-4">
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

      {sessionExpired ? (
        <p className="rounded-lg border border-amber-300/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Session expired. Please sign in again to view audit logs.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>
      ) : null}

      <div className="space-y-2 max-h-[24rem] overflow-y-auto">
        {logs.length === 0 && !loading && !error && !sessionExpired ? (
          <p className="text-sm text-white/60">No audit logs yet.</p>
        ) : null}
        {logs.map((log) => (
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
            <p className="text-[11px] text-white/45 break-words">
              Metadata: {JSON.stringify(log.metadata ?? {})}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
