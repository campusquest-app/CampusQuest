"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import { UserSearchInput } from "@/components/ui/UserSearchInput";
import { postAuthed } from "@/lib/client/dashboardApi";
import {
  avatarFromConnectionProfile,
  fetchConnections,
  type ConnectionItem,
} from "@/lib/client/socialConnectionsClient";
import { sharePostToConversations, type SharePostTarget } from "@/lib/client/dmMessagesClient";
import type { UserSearchResult } from "@/lib/client/userSearchClient";

export function SharePostSheet({
  open,
  target,
  onClose,
  onShared,
}: {
  open: boolean;
  target: SharePostTarget | null;
  onClose: () => void;
  onShared?: (count: number) => void;
}) {
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [optionalText, setOptionalText] = useState("");

  const loadConnections = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchConnections();
      setConnections(payload.connections);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load connections.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setOptionalText("");
    setQuery("");
    void loadConnections();
  }, [open, loadConnections]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const connectionIds = useMemo(() => new Set(connections.map((row) => row.userId)), [connections]);

  const filterToConnections = useCallback(
    (results: UserSearchResult[]) => results.filter((row) => connectionIds.has(row.userId)),
    [connectionIds],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return connections;
    return connections.filter(
      (c) => c.displayName.toLowerCase().includes(q) || c.username.toLowerCase().includes(q),
    );
  }, [connections, query]);

  function toggleUser(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function handleSend() {
    if (!target || selected.size === 0 || sending) return;
    setSending(true);
    setError(null);
    try {
      const conversationIds: string[] = [];
      for (const userId of Array.from(selected)) {
        const payload = await postAuthed<{ conversation: { id: string } }, { otherUserId: string }>(
          "/api/social/conversations/direct",
          { otherUserId: userId },
        );
        conversationIds.push(payload.conversation.id);
      }
      await sharePostToConversations({
        postId: target.postId,
        postType: target.postType,
        conversationIds,
        optionalText: optionalText.trim() || undefined,
        locationName: target.locationName,
      });
      onShared?.(conversationIds.length);
      onClose();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Could not share post.");
    } finally {
      setSending(false);
    }
  }

  if (!open || !target || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Share post">
      <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 flex max-h-[min(90vh,640px)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-white/15 bg-uri-navy shadow-2xl sm:rounded-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <h2 className="font-display text-base font-bold text-white">Share post</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-white/70 hover:bg-white/10" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="border-b border-white/10 px-4 py-3">
          <div className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
            {target.imageUrl ? (
              <img src={target.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-white/10 text-xl">📝</div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{target.authorName}</p>
              <p className="line-clamp-2 text-xs text-white/65">{target.caption || "Campus post"}</p>
            </div>
          </div>
          <UserSearchInput
            value={query}
            onChange={setQuery}
            onSelectUser={(user) => toggleUser(user.userId)}
            filterResults={filterToConnections}
            placeholder="Search friends…"
            inputClassName="mt-3 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-uri-keaney/40"
            ariaLabel="Search friends to share with"
            panelClassName="cq-user-search-panel--sheet"
            emptyMessage="No friends found."
          />
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto divide-y divide-white/10">
          {loading ? (
            <li className="px-4 py-8 text-center text-sm text-white/55">Loading connections…</li>
          ) : filtered.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-white/55">No connections found.</li>
          ) : (
            filtered.map((connection) => {
              const checked = selected.has(connection.userId);
              return (
                <li key={connection.userId}>
                  <button
                    type="button"
                    onClick={() => toggleUser(connection.userId)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
                      checked ? "bg-uri-keaney/10" : "hover:bg-white/[0.04]"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                        checked ? "border-uri-keaney bg-uri-keaney text-uri-navy" : "border-white/30"
                      }`}
                      aria-hidden
                    >
                      {checked ? "✓" : ""}
                    </span>
                    <span className="cq-avatar-slot h-10 w-10 border border-white/15">
                      <AvatarDisplay avatar={avatarFromConnectionProfile(connection)} fitParent size={40} showProp={false} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-white">{connection.displayName}</span>
                      <span className="block truncate text-xs text-white/55">@{connection.username}</span>
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <footer className="border-t border-white/10 p-4 space-y-3">
          <input
            type="text"
            value={optionalText}
            onChange={(e) => setOptionalText(e.target.value.slice(0, 2000))}
            placeholder="Add a message…"
            maxLength={2000}
            className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-uri-keaney/40"
          />
          {error ? (
            <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>
          ) : null}
          <button
            type="button"
            disabled={selected.size === 0 || sending}
            onClick={() => void handleSend()}
            className="w-full rounded-xl bg-uri-keaney py-3 text-sm font-semibold text-uri-navy hover:bg-uri-keaney/90 disabled:opacity-50"
          >
            {sending ? "Sending…" : selected.size > 0 ? `Send to ${selected.size} Ram${selected.size === 1 ? "" : "s"}` : "Select a friend"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
