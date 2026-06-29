"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Search, X } from "lucide-react";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import { postAuthed } from "@/lib/client/dashboardApi";
import {
  avatarFromConnectionProfile,
  fetchConnections,
  type ConnectionItem,
} from "@/lib/client/socialConnectionsClient";
import { fetchPinnedDmUsers } from "@/lib/client/pinnedDmUsersClient";
import { sharePostToConversations, type SharePostTarget } from "@/lib/client/dmMessagesClient";
import { useRegisterImmersiveScreen } from "@/lib/client/nestedImmersiveScreen";

function vibrateShare(): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate?.([10, 30, 14]);
  } catch {
    /* unsupported */
  }
}

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
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [optionalText, setOptionalText] = useState("");

  useRegisterImmersiveScreen(open);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [payload, pinned] = await Promise.all([
        fetchConnections(),
        fetchPinnedDmUsers().catch(() => []),
      ]);
      setConnections(payload.connections);
      setRecentIds(pinned.map((row) => row.pinnedUserId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load friends.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setOptionalText("");
    setQuery("");
    setSent(false);
    setError(null);
    void loadData();
  }, [open, loadData]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const connById = useMemo(
    () => new Map(connections.map((row) => [row.userId, row] as const)),
    [connections],
  );

  const recent = useMemo(() => {
    const seen = new Set<string>();
    const rows: ConnectionItem[] = [];
    for (const id of recentIds) {
      const conn = connById.get(id);
      if (conn && !seen.has(id)) {
        seen.add(id);
        rows.push(conn);
      }
      if (rows.length >= 8) break;
    }
    return rows;
  }, [recentIds, connById]);

  const recentIdSet = useMemo(() => new Set(recent.map((row) => row.userId)), [recent]);

  const allFriends = useMemo(
    () => connections.filter((row) => !recentIdSet.has(row.userId)),
    [connections, recentIdSet],
  );

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return connections.filter(
      (c) => c.displayName.toLowerCase().includes(q) || c.username.toLowerCase().includes(q),
    );
  }, [connections, query]);

  const toggleUser = useCallback((userId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const selectedCount = selected.size;
  const firstSelectedName = useMemo(() => {
    const first = selected.values().next().value as string | undefined;
    return first ? connById.get(first)?.displayName ?? null : null;
  }, [selected, connById]);

  const sendLabel = sent
    ? "Sent"
    : sending
      ? "Sending…"
      : selectedCount === 0
        ? "Select a friend"
        : selectedCount === 1
          ? `Send to ${firstSelectedName ?? "1 friend"}`
          : `Send to ${selectedCount} friends`;

  async function handleSend() {
    if (!target || selected.size === 0 || sending || sent) return;
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
      setSent(true);
      vibrateShare();
      onShared?.(conversationIds.length);
      window.setTimeout(() => {
        onClose();
      }, 900);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Could not share post.");
    } finally {
      setSending(false);
    }
  }

  if (!open || !target || typeof document === "undefined") return null;

  const hasFriends = connections.length > 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[10050] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Share post"
    >
      <button
        type="button"
        className="cq-share-backdrop absolute inset-0 bg-black/70 backdrop-blur-[3px]"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="cq-share-sheet relative z-10 flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-white/12 bg-uri-navy shadow-[0_-12px_60px_-12px_rgba(0,0,0,0.8)] sm:max-h-[min(86vh,680px)] sm:rounded-3xl">
        {/* Grab handle (mobile feel) */}
        <div className="flex justify-center pt-2 sm:hidden" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        {/* Sticky header */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-white/10 bg-uri-navy/95 px-4 py-3 backdrop-blur">
          <h2 className="font-display text-[17px] font-bold tracking-tight text-white">Share post</h2>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 rounded-full p-2 text-white/70 transition hover:bg-white/10 hover:text-white active:scale-95"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {/* Post preview card */}
          <div className="px-4 pt-4">
            <div className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 shadow-[0_8px_30px_-12px_rgba(104,171,232,0.35)]">
              {target.imageUrl ? (
                <img
                  src={target.imageUrl}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-xl object-cover ring-1 ring-white/10"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-white/10 text-2xl ring-1 ring-white/10">
                  📝
                </div>
              )}
              <div className="flex min-w-0 flex-1 flex-col justify-center">
                <p className="truncate text-sm font-semibold text-white">{target.authorName}</p>
                {target.authorUsername ? (
                  <p className="truncate text-xs text-white/45">@{target.authorUsername}</p>
                ) : null}
                <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-white/70">
                  {target.caption || "Campus post"}
                </p>
              </div>
            </div>
          </div>

          {/* Search pill */}
          <div className="px-4 pt-3">
            <div className="flex items-center gap-2 rounded-full bg-white/[0.07] px-3.5 py-2 ring-1 ring-white/10 focus-within:ring-uri-keaney/40">
              <Search className="h-4 w-4 shrink-0 text-white/40" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search friends"
                spellCheck={false}
                autoComplete="off"
                aria-label="Search friends to share with"
                className="w-full bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="shrink-0 rounded-full p-0.5 text-white/40 hover:text-white"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>

          {/* Friend list */}
          <div className="px-2 pb-2 pt-2">
            {loading ? (
              <p className="px-4 py-10 text-center text-sm text-white/55">Loading friends…</p>
            ) : !hasFriends ? (
              <p className="px-4 py-12 text-center text-sm text-white/55">
                No friends to share with yet.
              </p>
            ) : searchResults ? (
              searchResults.length === 0 ? (
                <p className="px-4 py-12 text-center text-sm text-white/55">No friends found.</p>
              ) : (
                <FriendGroup
                  rows={searchResults}
                  selected={selected}
                  onToggle={toggleUser}
                  disabled={sent}
                />
              )
            ) : (
              <>
                {recent.length > 0 ? (
                  <FriendGroup
                    label="Recent"
                    rows={recent}
                    selected={selected}
                    onToggle={toggleUser}
                    disabled={sent}
                  />
                ) : null}
                <FriendGroup
                  label={recent.length > 0 ? "All friends" : undefined}
                  rows={allFriends}
                  selected={selected}
                  onToggle={toggleUser}
                  disabled={sent}
                />
              </>
            )}
          </div>
        </div>

        {/* Sticky footer */}
        <footer className="sticky bottom-0 z-20 space-y-2.5 border-t border-white/10 bg-uri-navy/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
          {error ? (
            <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {error}
            </p>
          ) : null}
          {selectedCount > 0 && !sent ? (
            <input
              type="text"
              value={optionalText}
              onChange={(e) => setOptionalText(e.target.value.slice(0, 2000))}
              placeholder="Write a message…"
              maxLength={2000}
              className="w-full rounded-full bg-white/[0.07] px-4 py-2 text-sm text-white ring-1 ring-white/10 placeholder:text-white/40 focus:outline-none focus:ring-uri-keaney/40"
            />
          ) : null}
          <button
            type="button"
            disabled={selectedCount === 0 || sending || sent}
            onClick={() => void handleSend()}
            className={`flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-sm font-bold transition-all duration-200 ${
              sent
                ? "bg-emerald-500 text-white"
                : selectedCount === 0
                  ? "cursor-not-allowed bg-white/10 text-white/40"
                  : "bg-gradient-to-r from-uri-keaney to-[#4f9be6] text-uri-navy shadow-[0_8px_24px_-8px_rgba(104,171,232,0.8)] hover:brightness-105 active:scale-[0.98]"
            }`}
          >
            {sent ? <Check className="h-4 w-4" strokeWidth={3} /> : null}
            {sendLabel}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function FriendGroup({
  label,
  rows,
  selected,
  onToggle,
  disabled,
}: {
  label?: string;
  rows: ConnectionItem[];
  selected: Set<string>;
  onToggle: (userId: string) => void;
  disabled?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="pb-1">
      {label ? (
        <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
          {label}
        </p>
      ) : null}
      <ul className="space-y-0.5">
        {rows.map((connection) => (
          <li key={connection.userId}>
            <FriendRow
              connection={connection}
              checked={selected.has(connection.userId)}
              onToggle={onToggle}
              disabled={disabled}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function FriendRow({
  connection,
  checked,
  onToggle,
  disabled,
}: {
  connection: ConnectionItem;
  checked: boolean;
  onToggle: (userId: string) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(connection.userId)}
      disabled={disabled}
      aria-pressed={checked}
      className={`cq-share-row flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left active:scale-[0.985] disabled:opacity-60 ${
        checked
          ? "bg-uri-keaney/15 shadow-[0_0_24px_-8px_rgba(104,171,232,0.7)] ring-1 ring-uri-keaney/45"
          : "hover:bg-white/[0.05]"
      }`}
    >
      <span className="relative shrink-0">
        <span className="cq-avatar-slot h-11 w-11 border border-white/15">
          <AvatarDisplay
            avatar={avatarFromConnectionProfile(connection)}
            fitParent
            size={44}
            showProp={false}
          />
        </span>
        {checked ? (
          <span className="cq-share-check absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-uri-navy bg-uri-keaney text-uri-navy">
            <Check className="h-3 w-3" strokeWidth={3.5} />
          </span>
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-white">{connection.displayName}</span>
          {typeof connection.level === "number" ? (
            <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-bold leading-none text-uri-keaney">
              Lv. {connection.level}
            </span>
          ) : null}
        </span>
        <span className="block truncate text-xs text-white/50">@{connection.username}</span>
      </span>
    </button>
  );
}
