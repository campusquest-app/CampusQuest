"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiRequestError, fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import { TORCH_BEARER_IMAGE_URL } from "@/lib/torchBearerBadge";

type FounderRow = {
  user_id: string;
  founder_number: number;
  awarded_at: string;
  username?: string | null;
  display_name?: string | null;
};

type RosterPayload = {
  founders: FounderRow[];
  totalAwarded: number;
  slotsRemaining: number;
  fullyClaimed: boolean;
};

export function AdminBetaFoundersSection() {
  const [roster, setRoster] = useState<RosterPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grantUserId, setGrantUserId] = useState("");
  const [granting, setGranting] = useState(false);
  const [grantMessage, setGrantMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAuthed<RosterPayload>("/api/internal/admin/beta-founders");
      setRoster(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load founder roster.");
      setRoster(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleGrant(event: React.FormEvent) {
    event.preventDefault();
    const userId = grantUserId.trim();
    if (!userId) return;
    setGranting(true);
    setGrantMessage(null);
    setError(null);
    try {
      const data = await postAuthed<{ result: { founderNumber: number; newlyAwarded: boolean }; roster: RosterPayload }, { userId: string }>(
        "/api/internal/admin/beta-founders",
        { userId },
      );
      setRoster(data.roster);
      setGrantUserId("");
      setGrantMessage(
        data.result.newlyAwarded
          ? `Granted Torch Bearer Badge #${data.result.founderNumber}.`
          : `User already holds Torch Bearer Badge #${data.result.founderNumber}.`,
      );
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Grant failed.");
      }
    } finally {
      setGranting(false);
    }
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-white">Torch Bearer Founders</h2>
          <p className="mt-1 max-w-2xl text-sm text-white/60">
            Mythic beta founder badges for the original 30 non-admin users. Numbers are permanent and cannot be reassigned.
          </p>
        </div>
        <img
          src={TORCH_BEARER_IMAGE_URL}
          alt=""
          className="h-20 w-20 rounded-2xl border border-white/15 object-cover shadow-lg"
        />
      </header>

      {loading ? <p className="text-sm text-white/60">Loading founder roster…</p> : null}
      {error ? <p className="text-sm text-amber-300">{error}</p> : null}
      {grantMessage ? <p className="text-sm text-emerald-300">{grantMessage}</p> : null}

      {roster ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/45">Awarded</p>
              <p className="mt-1 text-2xl font-bold text-white">{roster.totalAwarded} / 30</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/45">Slots left</p>
              <p className="mt-1 text-2xl font-bold text-uri-keaney">{roster.slotsRemaining}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/45">Status</p>
              <p className="mt-1 text-sm font-semibold text-white">
                {roster.fullyClaimed ? "Founder badges are fully claimed." : "Open for founders"}
              </p>
            </div>
          </div>

          <form onSubmit={handleGrant} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <p className="text-sm font-semibold text-white">Manually grant badge</p>
            <p className="text-xs text-white/50">
              For testing or selected beta users. Consumes the next founder number until all 30 slots are filled.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={grantUserId}
                onChange={(e) => setGrantUserId(e.target.value)}
                placeholder="User UUID"
                className="flex-1 rounded-xl border border-white/15 bg-black/20 px-3 py-2.5 text-sm text-white placeholder:text-white/35"
                disabled={roster.fullyClaimed || granting}
              />
              <button
                type="submit"
                disabled={roster.fullyClaimed || granting || !grantUserId.trim()}
                className="rounded-xl bg-uri-keaney px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {granting ? "Granting…" : "Grant Torch Bearer"}
              </button>
            </div>
          </form>

          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-white/[0.04] text-[10px] uppercase tracking-wider text-white/45">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Awarded</th>
                </tr>
              </thead>
              <tbody>
                {roster.founders.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-white/50">
                      No Torch Bearer badges awarded yet.
                    </td>
                  </tr>
                ) : (
                  roster.founders.map((row) => (
                    <tr key={row.user_id} className="border-t border-white/10">
                      <td className="px-3 py-2 font-mono text-uri-keaney">#{row.founder_number}</td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-white">{row.display_name ?? "Unknown"}</p>
                        <p className="text-xs text-white/45">@{row.username ?? row.user_id.slice(0, 8)}</p>
                      </td>
                      <td className="px-3 py-2 text-white/60">
                        {new Date(row.awarded_at).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
