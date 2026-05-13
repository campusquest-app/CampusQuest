"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiRequestError, fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";

type PolicyVersionResponse = {
  version: string;
};

type PolicyActivateResponse = {
  version: string;
  isActive: boolean;
  activatedAt: string;
};

const VERSION_FORMAT = /^\d{4}-\d{2}-\d{2}\.\d+$/;

export function LegalPolicyVersionCard() {
  const [activeVersion, setActiveVersion] = useState<string | null>(null);
  const [versionInput, setVersionInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isForbidden, setIsForbidden] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadVersion = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSessionExpired(false);
    try {
      const result = await fetchAuthed<PolicyVersionResponse>("/api/internal/admin/legal-policy-version");
      setActiveVersion(result.version);
      setIsForbidden(false);
    } catch (loadError) {
      if (loadError instanceof ApiRequestError && loadError.status === 401) {
        setSessionExpired(true);
        return;
      }
      if (loadError instanceof ApiRequestError && loadError.status === 403) {
        setIsForbidden(true);
        return;
      }
      const message =
        loadError instanceof Error ? loadError.message : "Could not load the active legal policy version.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVersion();
  }, [loadVersion]);

  const inputError = useMemo(() => {
    const trimmed = versionInput.trim();
    if (!trimmed) return null;
    if (!VERSION_FORMAT.test(trimmed)) return "Use format YYYY-MM-DD.number (example: 2026-06-01.0).";
    return null;
  }, [versionInput]);

  async function handleActivate() {
    const trimmed = versionInput.trim();
    setError(null);
    setSuccess(null);

    if (!trimmed) {
      setError("Version cannot be empty.");
      return;
    }
    if (!VERSION_FORMAT.test(trimmed)) {
      setError("Version must match format YYYY-MM-DD.number (example: 2026-06-01.0).");
      return;
    }

    setSubmitting(true);
    try {
      const result = await postAuthed<PolicyActivateResponse, { version: string }>(
        "/api/internal/admin/legal-policy-version",
        { version: trimmed },
      );
      setActiveVersion(result.version);
      setVersionInput("");
      setSuccess("Policy version activated. Users will be required to re-accept the updated policies.");
    } catch (activateError) {
      const message =
        activateError instanceof Error ? activateError.message : "Unable to activate this policy version right now.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (isForbidden) return null;

  return (
    <section className="card p-4 sm:p-5 space-y-4">
      <div>
        <h3 className="font-display font-semibold text-white flex items-center gap-2">
          <span aria-hidden>🛡️</span> Legal Policy Version
        </h3>
        <p className="text-xs text-white/55 mt-1">Internal admin control for legal re-consent policy updates.</p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <p className="text-xs text-white/55 mb-1">Active policy version</p>
        <p className="text-sm font-semibold text-white">
          {loading ? "Loading..." : activeVersion ?? "Unavailable"}
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="legal-policy-version-input" className="text-xs font-medium text-white/75 uppercase tracking-wider">
          New policy version
        </label>
        <input
          id="legal-policy-version-input"
          type="text"
          value={versionInput}
          onChange={(event) => setVersionInput(event.target.value)}
          placeholder="2026-06-01.0"
          className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2.5 text-sm text-white placeholder-white/35 focus:outline-none focus:ring-2 focus:ring-uri-keaney/50"
          aria-invalid={Boolean(inputError || error)}
        />
        {inputError ? <p className="text-xs text-amber-300">{inputError}</p> : null}
      </div>

      <button
        type="button"
        onClick={() => void handleActivate()}
        disabled={loading || submitting}
        className="w-full rounded-xl bg-uri-keaney px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-uri-keaney/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Activating..." : "Activate New Policy Version"}
      </button>

      {success ? (
        <p className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          {success}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>
      ) : null}
      {sessionExpired ? (
        <p className="rounded-lg border border-amber-300/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Session expired. Please sign in again to manage policy versions.
        </p>
      ) : null}
    </section>
  );
}
