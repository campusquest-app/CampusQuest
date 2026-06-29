"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Search, Users, X } from "lucide-react";
import type { InboxFriendRow } from "@/lib/inboxMessageSearch";
import { avatarFromConnectionProfile } from "@/lib/client/socialConnectionsClient";
import { searchUsers, avatarFromUserSearchResult } from "@/lib/client/userSearchClient";
import { createGroupConversation } from "@/lib/client/groupChatClient";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import { useRegisterImmersiveScreen } from "@/lib/client/nestedImmersiveScreen";

type SelectableUser = {
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  isFriend: boolean;
};

export function CreateGroupChatSheet({
  currentUserId,
  friends,
  onClose,
  onCreated,
  error: externalError,
}: {
  currentUserId: string;
  friends: InboxFriendRow[];
  onClose: () => void;
  onCreated: (conversationId: string) => void;
  error?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selected, setSelected] = useState<SelectableUser[]>([]);
  const [searchResults, setSearchResults] = useState<SelectableUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [step, setStep] = useState<"members" | "name">("members");
  const [submitting, setSubmitting] = useState(false);

  useRegisterImmersiveScreen();
  const [error, setError] = useState<string | null>(null);

  const selectedIds = useMemo(() => new Set(selected.map((u) => u.userId)), [selected]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    if (!debouncedQuery) {
      setSearchResults([]);
      return;
    }

    void (async () => {
      setSearchLoading(true);
      try {
        const results = await searchUsers(debouncedQuery);
        if (cancelled) return;
        const friendIds = new Set(friends.map((f) => f.userId));
        setSearchResults(
          results
            .filter((user) => user.userId !== currentUserId)
            .map((user) => ({
              userId: user.userId,
              username: user.username,
              displayName: user.displayName,
              avatar: avatarFromUserSearchResult(user),
              isFriend: friendIds.has(user.userId),
            })),
        );
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, friends, currentUserId]);

  const friendSuggestions = useMemo(() => {
    const q = debouncedQuery.toLowerCase();
    return friends
      .filter((friend) => friend.userId !== currentUserId)
      .filter((friend) => {
        if (!q) return true;
        return (
          friend.displayName.toLowerCase().includes(q) ||
          friend.username.toLowerCase().includes(q)
        );
      })
      .map((friend) => ({
        userId: friend.userId,
        username: friend.username,
        displayName: friend.displayName,
        avatar: avatarFromConnectionProfile(friend),
        isFriend: true,
      }));
  }, [friends, debouncedQuery, currentUserId]);

  const otherSuggestions = useMemo(
    () => searchResults.filter((user) => !selectedIds.has(user.userId) && !user.isFriend),
    [searchResults, selectedIds],
  );

  const toggleUser = useCallback((user: SelectableUser) => {
    setSelected((prev) => {
      if (prev.some((row) => row.userId === user.userId)) {
        return prev.filter((row) => row.userId !== user.userId);
      }
      return [...prev, user];
    });
  }, []);

  async function handleCreate() {
    if (selected.length < 2) return;
    setSubmitting(true);
    setError(null);
    try {
      const conversation = await createGroupConversation({
        memberIds: selected.map((u) => u.userId),
        title: groupName.trim() || undefined,
      });
      onCreated(conversation.conversationId);
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : "Could not create group.";
      setError(message.replace(/^Backend request failed:[^.]*\.\s*/i, ""));
    } finally {
      setSubmitting(false);
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="cq-group-create-root fixed inset-0 z-[140] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="New group">
      <header className="flex shrink-0 items-center justify-between border-b border-white/[0.08] px-3 py-2.5 pt-[max(0.65rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} className="cq-inbox-icon-btn" aria-label="Close">
          <X className="h-6 w-6" strokeWidth={1.75} />
        </button>
        <p className="text-[15px] font-semibold text-white">{step === "members" ? "New group" : "Name your group"}</p>
        {step === "members" ? (
          <button
            type="button"
            disabled={selected.length < 2}
            onClick={() => setStep("name")}
            className="rounded-lg px-2 py-1 text-sm font-semibold text-[#0095f6] disabled:opacity-35"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleCreate()}
            className="rounded-lg px-2 py-1 text-sm font-semibold text-[#0095f6] disabled:opacity-35"
          >
            {submitting ? "Creating…" : "Create"}
          </button>
        )}
      </header>

      {step === "members" ? (
        <>
          {selected.length > 0 ? (
            <div className="flex shrink-0 flex-wrap gap-2 border-b border-white/[0.06] px-3 py-2.5">
              {selected.map((user) => (
                <button
                  key={user.userId}
                  type="button"
                  onClick={() => toggleUser(user)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white"
                >
                  <span className="max-w-[7rem] truncate">{user.displayName}</span>
                  <X className="h-3 w-3 opacity-70" />
                </button>
              ))}
            </div>
          ) : null}

          <div className="shrink-0 px-3 py-2.5">
            <label htmlFor="group-member-search" className="sr-only">
              Search users
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <input
                id="group-member-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search users"
                className="cq-inbox-search w-full rounded-[10px] py-2.5 pl-9 pr-3 text-[15px] text-white placeholder:text-white/35"
                autoFocus
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-y-contain px-1 pb-4">
            {friendSuggestions.length > 0 ? (
              <section>
                <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-white/40">Friends</p>
                <ul>
                  {friendSuggestions.map((user) => (
                    <MemberRow
                      key={user.userId}
                      user={user}
                      selected={selectedIds.has(user.userId)}
                      onToggle={() => toggleUser(user)}
                    />
                  ))}
                </ul>
              </section>
            ) : null}

            {otherSuggestions.length > 0 ? (
              <section>
                <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-white/40">Others</p>
                <ul>
                  {otherSuggestions.map((user) => (
                    <MemberRow
                      key={user.userId}
                      user={user}
                      selected={selectedIds.has(user.userId)}
                      onToggle={() => toggleUser(user)}
                    />
                  ))}
                </ul>
              </section>
            ) : null}

            {searchLoading ? <p className="px-4 py-6 text-center text-sm text-white/40">Searching…</p> : null}
            {!searchLoading && debouncedQuery && friendSuggestions.length === 0 && otherSuggestions.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-white/40">No users found.</p>
            ) : null}
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col px-4 py-6">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white/10 text-[#0095f6]">
            <Users className="h-9 w-9" strokeWidth={1.5} />
          </div>
          <label htmlFor="group-name" className="mt-6 text-sm text-white/55">
            Group name <span className="text-white/30">(optional)</span>
          </label>
          <input
            id="group-name"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Auto-name from members if left blank"
            maxLength={80}
            className="mt-2 w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2.5 text-[15px] text-white placeholder:text-white/30 focus:border-[#0095f6]/50 focus:outline-none"
          />
          <p className="mt-3 text-xs text-white/40">
            {selected.length + 1} members including you
          </p>
          <button
            type="button"
            onClick={() => setStep("members")}
            className="mt-6 text-sm font-medium text-[#0095f6]"
          >
            Edit members
          </button>
        </div>
      )}

      {(error || externalError) && (
        <p className="shrink-0 px-4 pb-4 text-xs text-amber-300/90" role="alert">
          {error || externalError}
        </p>
      )}
    </div>,
    document.body,
  );
}

function MemberRow({
  user,
  selected,
  onToggle,
}: {
  user: SelectableUser;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-white/[0.04]"
      >
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-[#262626]">
          <AvatarDisplay avatar={user.avatar} fitParent size={44} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{user.displayName}</p>
          <p className="truncate text-xs text-white/45">@{user.username}</p>
        </div>
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
            selected ? "border-[#0095f6] bg-[#0095f6]" : "border-white/25"
          }`}
          aria-hidden
        >
          {selected ? <span className="text-[11px] font-bold text-white">✓</span> : null}
        </span>
      </button>
    </li>
  );
}
