"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiRequestError, fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import { AdminSectionIntro } from "@/components/admin/AdminUi";

type AdminUserSearchRow = {
  id: string;
  username: string | null;
  displayName: string | null;
  email: string | null;
};

type XpDetail = {
  user: { id: string; username: string | null; display_name: string | null };
  stats: { totalXp: number; level: number };
  recentXpLogs: Array<{
    id: string;
    xp_amount: number;
    source_type: string;
    note: string | null;
    created_at: string;
  }>;
};

export function AdminXpManagementSection() {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AdminUserSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [xpDetail, setXpDetail] = useState<XpDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [action, setAction] = useState<"add" | "subtract">("add");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const data = await fetchAuthed<{ users: AdminUserSearchRow[] }>(
        `/api/internal/admin/users?query=${encodeURIComponent(q)}&limit=12`,
      );
      setSearchResults(data.users ?? []);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed.");
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [query]);

  const loadXpDetail = useCallback(async (userId: string) => {
    setDetailLoading(true);
    setSubmitError(null);
    try {
      const data = await fetchAuthed<XpDetail>(`/api/internal/admin/users/${userId}/xp`);
      setXpDetail(data);
    } catch (err) {
      setXpDetail(null);
      setSubmitError(err instanceof Error ? err.message : "Could not load XP details.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedUserId) {
      setXpDetail(null);
      return;
    }
    void loadXpDetail(selectedUserId);
  }, [selectedUserId, loadXpDetail]);

  async function handleAdjust(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedUserId) return;
    const parsedAmount = Number(amount);
    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      setSubmitError("Enter a positive whole number for XP.");
      return;
    }
    if (reason.trim().length < 3) {
      setSubmitError("Reason is required (min 3 characters).");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setMessage(null);
    try {
      const result = await postAuthed<
        { newXp: number; newLevel: number; signedDelta: number },
        { amount: number; action: "add" | "subtract"; reason: string }
      >(`/api/internal/admin/users/${selectedUserId}/xp`, {
        amount: parsedAmount,
        action,
        reason: reason.trim(),
      });
      setMessage(
        action === "add"
          ? `Added ${parsedAmount} XP. New total: ${result.newXp} (level ${result.newLevel}).`
          : `Removed ${parsedAmount} XP. New total: ${result.newXp} (level ${result.newLevel}).`,
      );
      setAmount("");
      setReason("");
      await loadXpDetail(selectedUserId);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setSubmitError(err.message);
      } else {
        setSubmitError(err instanceof Error ? err.message : "Adjustment failed.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const selectedUser = searchResults.find((u) => u.id === selectedUserId) ?? null;

  return (
    <div className="space-y-5">
      <AdminSectionIntro
        title="Users / XP Management"
        description="Search a player, review their XP ledger, and apply audited admin adjustments. Normal users cannot access this tool."
      />

      <div className="cq-admin-panel p-4 space-y-3">
        <label className="block text-xs font-semibold uppercase tracking-wide text-white/50">Search user</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Username, display name, handle, or email"
            className="flex-1 rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-white/35"
          />
          <button
            type="button"
            onClick={() => void runSearch()}
            disabled={searching || query.trim().length < 2}
            className="rounded-lg bg-uri-keaney px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {searching ? "Searching…" : "Search"}
          </button>
        </div>
        {searchError ? <p className="text-sm text-amber-300">{searchError}</p> : null}
        {searchResults.length > 0 ? (
          <ul className="divide-y divide-white/10 rounded-lg border border-white/10">
            {searchResults.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  onClick={() => setSelectedUserId(user.id)}
                  className={`flex w-full flex-col items-start px-3 py-2.5 text-left text-sm hover:bg-white/5 ${
                    selectedUserId === user.id ? "bg-uri-keaney/15" : ""
                  }`}
                >
                  <span className="font-medium text-white">{user.displayName ?? user.username ?? user.id}</span>
                  <span className="text-xs text-white/50">
                    @{user.username ?? "unknown"}
                    {user.email ? ` · ${user.email}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {selectedUserId ? (
        <div className="cq-admin-panel p-4 space-y-4">
          {detailLoading ? <p className="text-sm text-white/60">Loading XP details…</p> : null}
          {xpDetail ? (
            <>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-semibold text-white">
                  {xpDetail.user.display_name ?? selectedUser?.displayName ?? "Player"}
                </p>
                <p className="text-xs text-white/50">@{xpDetail.user.username ?? selectedUser?.username ?? "unknown"}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-white/45">Current XP</p>
                    <p className="text-2xl font-bold text-white">{xpDetail.stats.totalXp.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-white/45">Level</p>
                    <p className="text-2xl font-bold text-white">{xpDetail.stats.level}</p>
                  </div>
                </div>
              </div>

              <form onSubmit={(e) => void handleAdjust(e)} className="space-y-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAction("add")}
                    className={`rounded-lg px-3 py-2 text-sm font-medium ${
                      action === "add" ? "bg-emerald-600 text-white" : "bg-white/10 text-white/70"
                    }`}
                  >
                    Add XP
                  </button>
                  <button
                    type="button"
                    onClick={() => setAction("subtract")}
                    className={`rounded-lg px-3 py-2 text-sm font-medium ${
                      action === "subtract" ? "bg-rose-600 text-white" : "bg-white/10 text-white/70"
                    }`}
                  >
                    Remove XP
                  </button>
                </div>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Amount"
                  className="w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white"
                />
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Required reason for audit log"
                  rows={2}
                  className="w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white resize-none"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-uri-keaney px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {submitting ? "Saving…" : "Confirm adjustment"}
                </button>
              </form>

              {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
              {submitError ? <p className="text-sm text-amber-300">{submitError}</p> : null}

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">Recent XP history</p>
                <ul className="max-h-56 space-y-2 overflow-y-auto text-xs text-white/75">
                  {(xpDetail.recentXpLogs ?? []).map((log) => (
                    <li key={log.id} className="rounded-lg border border-white/10 px-3 py-2">
                      <span className={log.xp_amount >= 0 ? "text-emerald-300" : "text-rose-300"}>
                        {log.xp_amount >= 0 ? "+" : ""}
                        {log.xp_amount} XP
                      </span>
                      <span className="text-white/40"> · {log.source_type}</span>
                      {log.note ? <p className="mt-1 text-white/55">{log.note}</p> : null}
                      <p className="text-white/35">{new Date(log.created_at).toLocaleString()}</p>
                    </li>
                  ))}
                  {(xpDetail.recentXpLogs ?? []).length === 0 ? (
                    <li className="text-white/45">No XP logs yet.</li>
                  ) : null}
                </ul>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
