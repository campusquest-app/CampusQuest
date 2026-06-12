"use client";

import { useEffect, useState } from "react";
import { postAuthed } from "@/lib/client/dashboardApi";

export function OrganizationModerationCard({ initialOrganizationId }: { initialOrganizationId?: string }) {
  const [organizationId, setOrganizationId] = useState(initialOrganizationId ?? "");
  const [newOwnerUserId, setNewOwnerUserId] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialOrganizationId) setOrganizationId(initialOrganizationId);
  }, [initialOrganizationId]);

  async function runAction(action: "freeze" | "unfreeze" | "transfer_owner" | "remove" | "restore") {
    if (!organizationId.trim()) {
      setError("Enter an organization ID.");
      return;
    }
    if (action === "transfer_owner" && !newOwnerUserId.trim()) {
      setError("Enter a new owner user ID.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await postAuthed("/api/internal/admin/moderation/organizations", {
        action,
        organizationId: organizationId.trim(),
        newOwnerUserId: newOwnerUserId.trim() || undefined,
        reason: reason.trim() || undefined,
      });
      setNotice(`Action completed: ${action.replace("_", " ")}.`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Action failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card p-4 sm:p-5 space-y-3">
      <h3 className="font-display font-semibold text-white flex items-center gap-2">
        <span aria-hidden>🏛️</span> Organization Moderation Controls
      </h3>
      <p className="text-xs text-white/55">
        Internal controls for freezing, ownership transfer, and remove/restore actions.
      </p>
      <input
        value={organizationId}
        onChange={(event) => setOrganizationId(event.target.value)}
        placeholder="Organization ID"
        className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-sm text-white placeholder-white/45"
      />
      <input
        value={newOwnerUserId}
        onChange={(event) => setNewOwnerUserId(event.target.value)}
        placeholder="New owner user ID (for transfer)"
        className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-sm text-white placeholder-white/45"
      />
      <textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        rows={2}
        placeholder="Reason / note (optional)"
        className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-sm text-white placeholder-white/45"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void runAction("freeze")}
          disabled={submitting}
          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/20 text-rose-200 border border-rose-400/35 disabled:opacity-60"
        >
          Freeze
        </button>
        <button
          type="button"
          onClick={() => void runAction("unfreeze")}
          disabled={submitting}
          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-sky-500/20 text-sky-200 border border-sky-400/35 disabled:opacity-60"
        >
          Unfreeze
        </button>
        <button
          type="button"
          onClick={() => void runAction("transfer_owner")}
          disabled={submitting}
          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/20 text-amber-200 border border-amber-400/35 disabled:opacity-60"
        >
          Transfer owner
        </button>
        <button
          type="button"
          onClick={() => void runAction("remove")}
          disabled={submitting}
          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white/10 text-white/85 border border-white/20 disabled:opacity-60"
        >
          Remove
        </button>
        <button
          type="button"
          onClick={() => void runAction("restore")}
          disabled={submitting}
          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-200 border border-emerald-400/35 disabled:opacity-60"
        >
          Restore
        </button>
      </div>
      {notice ? <p className="text-xs text-emerald-200">{notice}</p> : null}
      {error ? <p className="text-xs text-rose-200">{error}</p> : null}
    </section>
  );
}
