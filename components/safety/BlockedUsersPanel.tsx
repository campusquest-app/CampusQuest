"use client";

import { useCallback, useEffect, useState } from "react";
import { DrawerSubPanelShell } from "@/components/DrawerSubPanelShell";
import { UserAvatar } from "@/components/UserAvatar";
import { deleteAuthed, fetchAuthed } from "@/lib/client/dashboardApi";

type BlockedUserRow = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  blockedAt?: string;
};

export function BlockedUsersPanel({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<BlockedUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAuthed<{ blockedUsers: BlockedUserRow[] }>("/api/social/blocks");
      setRows(data.blockedUsers ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load blocked users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleUnblock(userId: string) {
    setBusyId(userId);
    setNotice(null);
    try {
      await deleteAuthed(`/api/social/blocks/${userId}`);
      setRows((prev) => prev.filter((r) => r.userId !== userId));
      setNotice("User unblocked.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not unblock user.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <DrawerSubPanelShell title="Blocked users" onBack={onBack}>
      <div className="space-y-3">
        <p className="px-1 text-[12px] text-white/45">
          Blocked people cannot message you. Unblock them here anytime.
        </p>

        {loading ? <p className="px-1 text-sm text-white/50">Loading…</p> : null}
        {error ? (
          <p className="px-1 text-sm text-rose-300" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="px-1 text-sm text-cyan-200/80" role="status">
            {notice}
          </p>
        ) : null}

        {!loading && !error && rows.length === 0 ? (
          <p className="rounded-2xl border border-white/[0.08] bg-cq-card/50 px-4 py-6 text-center text-sm text-white/50">
            You haven’t blocked anyone.
          </p>
        ) : null}

        <ul className="overflow-hidden rounded-2xl border border-white/[0.08] bg-cq-card/60">
          {rows.map((row, index) => (
            <li
              key={row.userId}
              className={`flex items-center gap-3 px-3 py-3 ${
                index < rows.length - 1 ? "border-b border-white/[0.06]" : ""
              }`}
            >
              <UserAvatar
                size="sm"
                displayName={row.displayName}
                username={row.username}
                avatar={row.avatarUrl}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white/90">{row.displayName}</p>
                <p className="truncate text-[11px] text-white/40">@{row.username}</p>
              </div>
              <button
                type="button"
                disabled={busyId === row.userId}
                onClick={() => void handleUnblock(row.userId)}
                className="shrink-0 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/[0.06] disabled:opacity-45"
              >
                {busyId === row.userId ? "…" : "Unblock"}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </DrawerSubPanelShell>
  );
}
