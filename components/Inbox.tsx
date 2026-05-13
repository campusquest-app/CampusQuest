"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import type { Character } from "@/lib/types";
import { AvatarDisplay } from "./AvatarDisplay";
import { DirectMessageThread } from "./DirectMessageThread";
import { fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import { NotificationsCenter } from "./NotificationsCenter";

export type InboxSubTab = "messages" | "notifications";

type ConversationItem = {
  conversationId: string;
  otherUser: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  latestMessage: {
    id: string;
    senderId: string;
    recipientId: string;
    content: string;
    createdAt: string;
    readAt: string | null;
  } | null;
};

type IncomingConnectionRequest = {
  requestId: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
};

export function Inbox({
  character,
  onBack,
  onOpenDm,
  personalization,
  subTab,
  onSubTabChange,
  onUnreadCountChange,
}: {
  character: Character;
  onBack: () => void;
  onOpenDm?: (other: { userId: string; username: string; name: string; avatar: string }) => void;
  personalization?: { schoolName?: string; discoveryFocus?: string[] } | null;
  subTab: InboxSubTab;
  onSubTabChange: (tab: InboxSubTab) => void;
  onUnreadCountChange?: (count: number) => void;
}) {
  const [messageSearch, setMessageSearch] = useState("");
  const [dmWith, setDmWith] = useState<{ userId: string; username: string; name: string; avatar: string } | null>(null);
  const [connectionUsername, setConnectionUsername] = useState("");
  const [messageLoading, setMessageLoading] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<IncomingConnectionRequest[]>([]);

  const filteredMessages = useMemo(() => {
    const q = messageSearch.trim().toLowerCase();
    const sorted = [...conversations].sort(
      (a, b) =>
        new Date(b.latestMessage?.createdAt ?? 0).getTime() -
        new Date(a.latestMessage?.createdAt ?? 0).getTime(),
    );
    if (!q) return sorted;
    return sorted.filter((m) => {
      return (
        m.otherUser.displayName.toLowerCase().includes(q) ||
        m.otherUser.username.toLowerCase().includes(q)
      );
    });
  }, [conversations, messageSearch]);

  const loadMessageCenter = useCallback(async () => {
    setMessageLoading(true);
    setMessageError(null);
    try {
      const [convoPayload, incomingPayload] = await Promise.all([
        fetchAuthed<{ conversations: ConversationItem[] }>("/api/social/conversations"),
        fetchAuthed<{ requests: IncomingConnectionRequest[] }>("/api/social/connections/requests?direction=incoming"),
      ]);
      setConversations(convoPayload.conversations ?? []);
      setIncomingRequests(incomingPayload.requests ?? []);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Could not load messages.";
      setMessageError(message);
    } finally {
      setMessageLoading(false);
    }
  }, []);

  useEffect(() => {
    if (subTab === "messages") {
      void loadMessageCenter();
    }
  }, [subTab, loadMessageCenter]);

  function handleOpenDm(userId: string, username: string, name: string, avatar: string) {
    if (onOpenDm) {
      onOpenDm({ userId, username, name, avatar });
      onBack();
    } else {
      setDmWith({ userId, username, name, avatar });
    }
  }

  async function handleSendConnectionRequest(e: React.FormEvent) {
    e.preventDefault();
    const username = connectionUsername.trim().toLowerCase();
    if (!username) {
      setMessageError("Enter a username to send a connection request.");
      return;
    }
    setSendingRequest(true);
    setMessageError(null);
    try {
      await postAuthed("/api/social/connections/request", { username });
      setConnectionUsername("");
      await loadMessageCenter();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Could not send connection request.";
      setMessageError(message);
    } finally {
      setSendingRequest(false);
    }
  }

  async function handleAcceptConnection(requestId: string) {
    try {
      await postAuthed("/api/social/connections/requests/respond", { requestId, action: "accept" });
      await loadMessageCenter();
    } catch (acceptError) {
      const message = acceptError instanceof Error ? acceptError.message : "Could not accept request.";
      setMessageError(message);
    }
  }

  return (
    <div className="min-h-[60vh] flex flex-col">
      {/* Top bar: back + title */}
      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/10 border border-white/15 hover:bg-white/15 text-white transition-colors"
          aria-label="Back"
        >
          ←
        </button>
        <h2 className="font-display font-bold text-lg text-white">Inbox</h2>
      </div>

      {/* Sub-tabs: Messages first, then unified notifications */}
      <div className="flex rounded-xl border border-white/15 bg-white/5 p-1 mb-4">
        <button
          type="button"
          onClick={() => onSubTabChange("messages")}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            subTab === "messages"
              ? "bg-uri-keaney/25 text-uri-keaney border border-uri-keaney/40"
              : "text-white/70 hover:text-white border border-transparent"
          }`}
        >
          Messages
        </button>
        <button
          type="button"
          onClick={() => onSubTabChange("notifications")}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            subTab === "notifications"
              ? "bg-uri-keaney/25 text-uri-keaney border border-uri-keaney/40"
              : "text-white/70 hover:text-white border border-transparent"
          }`}
        >
          Notifications
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 card overflow-hidden p-0">
        {subTab === "notifications" && (
          <NotificationsCenter
            embedded
            onUnreadCountChange={onUnreadCountChange}
            personalization={personalization}
          />
        )}

        {subTab === "messages" && (
          <>
            <div className="border-b border-white/10 p-3 sm:p-4">
              <form onSubmit={handleSendConnectionRequest} className="mb-3 flex gap-2">
                <input
                  type="text"
                  value={connectionUsername}
                  onChange={(e) => setConnectionUsername(e.target.value)}
                  placeholder="Connect by username (e.g. alex_rhody)"
                  className="flex-1 rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2.5 text-sm text-white placeholder-white/40 focus:border-uri-keaney/45 focus:outline-none focus:ring-2 focus:ring-uri-keaney/25"
                />
                <button
                  type="submit"
                  disabled={sendingRequest}
                  className="px-3 py-2.5 rounded-xl text-sm font-semibold bg-uri-keaney text-uri-navy hover:bg-uri-keaney/90 disabled:opacity-60"
                >
                  {sendingRequest ? "Sending..." : "Connect"}
                </button>
              </form>
              {incomingRequests.length > 0 && (
                <div className="mb-3 space-y-2">
                  {incomingRequests.map((request) => (
                    <div key={request.requestId} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.04] p-2">
                      <p className="text-xs text-white/80 truncate">
                        <span className="font-semibold">{request.displayName}</span> @{request.username} wants to connect
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleAcceptConnection(request.requestId)}
                        className="px-2.5 py-1 rounded-md text-xs font-semibold bg-uri-keaney text-uri-navy"
                      >
                        Accept
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label htmlFor="inbox-msg-search" className="sr-only">
                Search messages by name
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" aria-hidden>
                  🔍
                </span>
                <input
                  id="inbox-msg-search"
                  type="search"
                  value={messageSearch}
                  onChange={(e) => setMessageSearch(e.target.value)}
                  placeholder="Search by name…"
                  autoComplete="off"
                  className="w-full rounded-xl border border-white/15 bg-white/[0.06] py-2.5 pl-10 pr-3 text-sm text-white placeholder-white/40 shadow-inner transition-colors focus:border-uri-keaney/45 focus:outline-none focus:ring-2 focus:ring-uri-keaney/25"
                />
              </div>
            </div>
            {messageError && (
              <div className="mx-3 mb-2 rounded-lg border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                {messageError}
              </div>
            )}
            <ul className="divide-y divide-white/10 max-h-[min(50vh,28rem)] overflow-y-auto overscroll-y-contain">
            {messageLoading ? (
              <li className="px-4 py-10 text-center text-sm text-white/55">Loading conversations...</li>
            ) : filteredMessages.length === 0 ? (
              <li className="px-4 py-10 text-center">
                <p className="text-sm text-white/55">
                  {messageSearch.trim()
                    ? `No conversations match "${messageSearch.trim()}".`
                    : personalization?.discoveryFocus?.includes("meet_students")
                      ? `No conversations yet. Meet students ${personalization.schoolName ? `at ${personalization.schoolName}` : "on campus"} by sending your first connection request.`
                      : "No conversations yet. Connect with a student to start messaging."}
                </p>
              </li>
            ) : (
              filteredMessages.map((m) => (
              <li key={m.conversationId}>
                  <button
                    type="button"
                    onClick={() =>
                      handleOpenDm(
                        m.otherUser.id,
                        m.otherUser.username,
                        m.otherUser.displayName,
                        m.otherUser.avatarUrl ?? "🎓",
                      )
                    }
                    className="w-full flex items-center gap-3 p-4 hover:bg-white/[0.04] text-left transition-colors"
                  >
                    <div className="w-11 h-11 rounded-xl bg-white/10 border border-uri-keaney/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                      <AvatarDisplay avatar={m.otherUser.avatarUrl ?? "🎓"} size={44} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-white text-sm truncate">{m.otherUser.displayName}</p>
                      <p className="text-white/60 text-sm truncate">{m.latestMessage?.content ?? "No messages yet"}</p>
                      <p className="text-white/40 text-xs mt-0.5">
                        {m.latestMessage?.createdAt
                          ? new Date(m.latestMessage.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                          : "Just now"}
                      </p>
                    </div>
                  </button>
              </li>
              ))
            )}
            </ul>
          </>
        )}
      </div>

      {dmWith && (
        <DirectMessageThread
          currentUser={character}
          otherUser={dmWith}
          onClose={() => setDmWith(null)}
          onMessageSent={() => void loadMessageCenter()}
        />
      )}
    </div>
  );
}
