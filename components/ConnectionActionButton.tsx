"use client";

import { useCallback, useEffect, useState } from "react";
import {
  acceptIncomingConnectionRequest,
  declineIncomingConnectionRequest,
  refreshRelationship,
  relationshipToConnectionActionState,
  requestConnection,
  type ConnectionActionState,
} from "@/lib/client/connectionRequestActions";
import { emitSocialSync, subscribeSocialSync } from "@/lib/client/socialSync";

export function ConnectionActionButton({
  otherUserId,
  otherUsername,
  compact = false,
  onMessage,
  onToast,
  onStateChange,
}: {
  otherUserId: string;
  otherUsername: string;
  compact?: boolean;
  onMessage?: () => void;
  onToast?: (message: string) => void;
  onStateChange?: () => void;
}) {
  const [state, setState] = useState<ConnectionActionState>("loading");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const syncRelationship = useCallback(async () => {
    try {
      const relationship = await refreshRelationship(otherUserId);
      setState(relationshipToConnectionActionState(relationship));
      setRequestId(relationship.requestId);
    } catch {
      setState("none");
      setRequestId(null);
    }
  }, [otherUserId]);

  useEffect(() => {
    void syncRelationship();
    const unsubscribe = subscribeSocialSync(() => void syncRelationship());
    return unsubscribe;
  }, [syncRelationship]);

  async function handleSendRequest() {
    if (busy || state === "connected" || state === "outgoing" || state === "blocked") return;
    setBusy(true);
    try {
      const outcome = await requestConnection({
        username: otherUsername,
        relationship: await refreshRelationship(otherUserId),
      });
      await syncRelationship();
      emitSocialSync({ source: "friends" });
      onStateChange?.();
      if (outcome.toastMessage) onToast?.(outcome.toastMessage);
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : "Could not send request.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAccept() {
    if (!requestId || busy) return;
    setBusy(true);
    try {
      await acceptIncomingConnectionRequest(requestId);
      await syncRelationship();
      emitSocialSync({ source: "friends" });
      onStateChange?.();
      onToast?.(`You are now connected with @${otherUsername}`);
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : "Could not accept request.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDecline() {
    if (!requestId || busy) return;
    setBusy(true);
    try {
      await declineIncomingConnectionRequest(requestId);
      await syncRelationship();
      emitSocialSync({ source: "friends" });
      onStateChange?.();
      onToast?.("Request declined");
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : "Could not decline request.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") {
    return (
      <span className="inline-flex min-h-[44px] items-center rounded-xl border border-white/10 px-3 py-2 text-xs text-white/45">
        Loading…
      </span>
    );
  }

  if (state === "blocked") {
    return null;
  }

  if (state === "connected") {
    return (
      <div className="flex flex-wrap gap-2">
        <span
          className={`inline-flex min-h-[44px] items-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 font-semibold text-emerald-100 ${
            compact ? "px-3 py-2 text-xs" : "px-4 py-2 text-sm"
          }`}
        >
          Friends
        </span>
        {onMessage ? (
          <button
            type="button"
            onClick={onMessage}
            className={`min-h-[44px] rounded-xl border border-white/20 font-semibold text-white hover:bg-white/10 ${
              compact ? "px-3 py-2 text-xs" : "px-4 py-2 text-sm"
            }`}
          >
            Message
          </button>
        ) : null}
      </div>
    );
  }

  if (state === "outgoing") {
    return (
      <span
        className={`inline-flex min-h-[44px] items-center rounded-xl border border-white/15 bg-white/[0.05] font-medium text-white/55 ${
          compact ? "px-3 py-2 text-xs" : "px-4 py-2 text-sm"
        }`}
      >
        Requested
      </span>
    );
  }

  if (state === "incoming") {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleAccept()}
          className={`min-h-[44px] rounded-xl bg-uri-keaney font-semibold text-white hover:bg-uri-keaney/90 disabled:opacity-60 ${
            compact ? "px-3 py-2 text-xs" : "px-4 py-2 text-sm"
          }`}
        >
          Accept
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleDecline()}
          className={`min-h-[44px] rounded-xl border border-white/20 font-medium text-white/80 hover:bg-white/10 disabled:opacity-60 ${
            compact ? "px-3 py-2 text-xs" : "px-4 py-2 text-sm"
          }`}
        >
          Deny
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void handleSendRequest()}
      className={`min-h-[44px] rounded-xl bg-uri-keaney font-semibold text-white hover:bg-uri-keaney/90 disabled:opacity-60 ${
        compact ? "px-3 py-2 text-xs" : "px-4 py-2 text-sm"
      }`}
    >
      {busy ? "Sending…" : "Connect"}
    </button>
  );
}
