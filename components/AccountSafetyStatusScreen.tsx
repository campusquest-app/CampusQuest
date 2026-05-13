"use client";

import { useEffect, useState } from "react";
import { getAccessToken } from "@/lib/client/apiSession";

type Props = {
  status: "suspended" | "banned";
  reason?: string | null;
  suspendedUntil?: string | null;
};

type Appeal = {
  id: string;
  message: string;
  status: "pending" | "reviewed" | "denied" | "approved";
  created_at: string;
  reviewed_at: string | null;
};

export function AccountSafetyStatusScreen({ status, reason, suspendedUntil }: Props) {
  const [appealMessage, setAppealMessage] = useState("");
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingAppeals, setLoadingAppeals] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadAppeals() {
      setLoadingAppeals(true);
      try {
        const token = getAccessToken();
        if (!token) return;
        const response = await fetch("/api/safety/appeals", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error?.message ?? "Could not load review requests.");
        }
        if (!cancelled) {
          setAppeals((payload?.data?.appeals ?? []) as Appeal[]);
        }
      } catch (loadError) {
        if (!cancelled) {
          const message = loadError instanceof Error ? loadError.message : "Could not load review requests.";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoadingAppeals(false);
        }
      }
    }
    void loadAppeals();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitAppeal(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = appealMessage.trim();
    if (trimmed.length < 10) {
      setError("Please include more details in your review request.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setFeedback(null);
    try {
      const token = getAccessToken();
      if (!token) {
        throw new Error("Session expired. Please sign in again.");
      }
      const response = await fetch("/api/safety/appeals", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: trimmed }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Could not submit review request.");
      }
      const nextAppeal = payload?.data?.appeal as Appeal | undefined;
      if (nextAppeal) {
        setAppeals((prev) => [nextAppeal, ...prev]);
      }
      setAppealMessage("");
      setFeedback("Review request submitted. Our safety team will review your appeal.");
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Could not submit review request.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-10 sm:py-14">
      <div className="w-full max-w-2xl rounded-3xl border border-rose-400/30 bg-slate-950/75 backdrop-blur-xl p-5 sm:p-8 shadow-2xl shadow-black/30">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Account Safety Status</h1>
        <p className="mt-3 text-sm sm:text-base text-white/80">
          Your account is currently <span className="font-semibold capitalize text-rose-200">{status}</span>.
        </p>
        {reason ? (
          <p className="mt-2 text-sm text-white/70">
            <span className="font-semibold text-white/85">Reason:</span> {reason}
          </p>
        ) : null}
        {status === "suspended" && suspendedUntil ? (
          <p className="mt-2 text-sm text-white/70">
            <span className="font-semibold text-white/85">Suspension ends:</span>{" "}
            {new Date(suspendedUntil).toLocaleString()}
          </p>
        ) : null}

        <p className="mt-4 text-xs sm:text-sm text-amber-100/90 leading-relaxed">
          If you believe this action was made in error, you may request a review. CampusQuest reviews safety
          decisions to protect students and the campus community.
        </p>
        <p className="mt-2 text-xs text-white/65">
          You can also contact CampusQuest support if you believe this was a mistake.
        </p>

        <form onSubmit={submitAppeal} className="mt-5 space-y-3">
          <label htmlFor="safety-appeal-message" className="block text-xs font-medium text-white/75 uppercase tracking-wider">
            Request review
          </label>
          <textarea
            id="safety-appeal-message"
            value={appealMessage}
            onChange={(event) => setAppealMessage(event.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="Explain why you believe this action should be reviewed."
            className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2.5 text-sm text-white placeholder-white/35 focus:outline-none focus:ring-2 focus:ring-uri-keaney/50"
          />
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-uri-keaney px-4 py-2.5 text-sm font-semibold text-white hover:bg-uri-keaney/90 disabled:opacity-60"
          >
            {submitting ? "Submitting..." : "Submit Review Request"}
          </button>
        </form>

        {feedback ? (
          <p className="mt-3 rounded-lg border border-emerald-400/35 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
            {feedback}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 rounded-lg border border-rose-400/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </p>
        ) : null}

        <div className="mt-5">
          <h2 className="text-sm font-semibold text-white mb-2">Your review requests</h2>
          {loadingAppeals ? (
            <p className="text-xs text-white/55">Loading...</p>
          ) : appeals.length === 0 ? (
            <p className="text-xs text-white/55">No review requests yet.</p>
          ) : (
            <ul className="space-y-2">
              {appeals.map((appeal) => (
                <li key={appeal.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                  <p className="text-xs text-white/50">{new Date(appeal.created_at).toLocaleString()}</p>
                  <p className="text-sm text-white/85 mt-1">{appeal.message}</p>
                  <p className="text-xs text-uri-keaney/90 mt-1 uppercase">{appeal.status}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
