"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import type { Character } from "@/lib/types";
import { AvatarDisplay } from "./AvatarDisplay";
import { DirectMessageThread } from "./DirectMessageThread";
import { fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";

type InboxSubTab = "notifications" | "messages";

const STORAGE_STARRED_NOTIFICATIONS = "campusquest_inbox_starred_notifications";
const STORAGE_STARRED_MESSAGES = "campusquest_inbox_starred_messages";

function loadStarredSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveStarredSet(key: string, set: Set<string>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(Array.from(set)));
}

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

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
}: {
  character: Character;
  onBack: () => void;
  onOpenDm?: (other: { userId: string; username: string; name: string; avatar: string }) => void;
  personalization?: { schoolName?: string; discoveryFocus?: string[] } | null;
}) {
  const [subTab, setSubTab] = useState<InboxSubTab>("notifications");
  const [messageSearch, setMessageSearch] = useState("");
  const [dmWith, setDmWith] = useState<{ userId: string; username: string; name: string; avatar: string } | null>(null);
  const [connectionUsername, setConnectionUsername] = useState("");
  const [messageLoading, setMessageLoading] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<IncomingConnectionRequest[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [starredNotifications, setStarredNotifications] = useState<Set<string>>(() => loadStarredSet(STORAGE_STARRED_NOTIFICATIONS));
  const [starredMessages, setStarredMessages] = useState<Set<string>>(() => loadStarredSet(STORAGE_STARRED_MESSAGES));

  useEffect(() => {
    saveStarredSet(STORAGE_STARRED_NOTIFICATIONS, starredNotifications);
  }, [starredNotifications]);
  useEffect(() => {
    saveStarredSet(STORAGE_STARRED_MESSAGES, starredMessages);
  }, [starredMessages]);

  const toggleStarNotification = useCallback((id: string) => {
    setStarredNotifications((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const toggleStarMessage = useCallback((id: string) => {
    setStarredMessages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const sortedNotifications = useMemo(() => {
    return [...notifications].sort((a, b) => {
      const aStar = starredNotifications.has(a.id) ? 0 : 1;
      const bStar = starredNotifications.has(b.id) ? 0 : 1;
      if (aStar !== bStar) return aStar - bStar;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [notifications, starredNotifications]);

  const sortedMessages = useMemo(() => {
    return [...conversations].sort((a, b) => {
      const aStar = starredMessages.has(a.conversationId) ? 0 : 1;
      const bStar = starredMessages.has(b.conversationId) ? 0 : 1;
      if (aStar !== bStar) return aStar - bStar;
      return (
        new Date(b.latestMessage?.createdAt ?? 0).getTime() -
        new Date(a.latestMessage?.createdAt ?? 0).getTime()
      );
    });
  }, [conversations, starredMessages]);

  const filteredMessages = useMemo(() => {
    const q = messageSearch.trim().toLowerCase();
    if (!q) return sortedMessages;
    return sortedMessages.filter((m) => {
      return (
        m.otherUser.displayName.toLowerCase().includes(q) ||
        m.otherUser.username.toLowerCase().includes(q)
      );
    });
  }, [sortedMessages, messageSearch]);

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

  useEffect(() => {
    if (subTab !== "notifications") return;
    let cancelled = false;
    async function loadNotifications() {
      setNotificationLoading(true);
      setNotificationError(null);
      try {
        const payload = await fetchAuthed<{ notifications: NotificationItem[] }>("/api/notifications?limit=50");
        if (!cancelled) setNotifications(payload.notifications ?? []);
      } catch (loadError) {
        if (!cancelled) setNotificationError(loadError instanceof Error ? loadError.message : "Could not load notifications.");
      } finally {
        if (!cancelled) setNotificationLoading(false);
      }
    }
    void loadNotifications();
    return () => {
      cancelled = true;
    };
  }, [subTab]);

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

      {/* Sub-tabs */}
      <div className="flex rounded-xl border border-white/15 bg-white/5 p-1 mb-4">
        <button
          type="button"
          onClick={() => setSubTab("notifications")}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            subTab === "notifications"
              ? "bg-uri-keaney/25 text-uri-keaney border border-uri-keaney/40"
              : "text-white/70 hover:text-white border border-transparent"
          }`}
        >
          Notifications
        </button>
        <button
          type="button"
          onClick={() => setSubTab("messages")}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            subTab === "messages"
              ? "bg-uri-keaney/25 text-uri-keaney border border-uri-keaney/40"
              : "text-white/70 hover:text-white border border-transparent"
          }`}
        >
          Messages
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 card overflow-hidden p-0">
        {subTab === "notifications" && (
          <ul className="divide-y divide-white/10 max-h-[50vh] overflow-y-auto">
            {notificationLoading ? (
              <li className="px-4 py-10 text-center text-sm text-white/55">Loading notifications...</li>
            ) : null}
            {!notificationLoading && notificationError ? (
              <li className="px-4 py-4 text-xs text-rose-200">{notificationError}</li>
            ) : null}
            {!notificationLoading && !notificationError && sortedNotifications.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-white/55">No notifications yet. We’ll let you know when something important happens.</li>
            ) : null}
            {sortedNotifications.map((n) => (
              <li key={n.id} className="p-4 hover:bg-white/[0.04] transition-colors flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-xl flex-shrink-0">
                  {n.type.includes("event") ? "📅" : n.type.includes("message") ? "💬" : "🔔"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white text-sm">{n.title}</p>
                  <p className="text-white/70 text-sm mt-0.5 line-clamp-2">{n.body}</p>
                  <p className="text-white/40 text-xs mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleStarNotification(n.id); }}
                  className={`flex-shrink-0 p-2 rounded-lg transition-colors ${starredNotifications.has(n.id) ? "text-uri-gold" : "text-white/50 hover:text-uri-gold"} hover:bg-uri-gold/10`}
                  aria-label={starredNotifications.has(n.id) ? "Unstar" : "Star"}
                  title={starredNotifications.has(n.id) ? "Unstar" : "Star to keep at top"}
                >
                  {starredNotifications.has(n.id) ? "★" : "☆"}
                </button>
              </li>
            ))}
          </ul>
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
              <li key={m.conversationId} className="flex items-center gap-2">
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
                    className="flex-1 min-w-0 flex items-center gap-3 p-4 hover:bg-white/[0.04] text-left transition-colors"
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
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleStarMessage(m.conversationId); }}
                  className={`flex-shrink-0 p-2 rounded-lg transition-colors ${starredMessages.has(m.conversationId) ? "text-uri-gold" : "text-white/50 hover:text-uri-gold"} hover:bg-uri-gold/10`}
                  aria-label={starredMessages.has(m.conversationId) ? "Unstar" : "Star"}
                  title={starredMessages.has(m.conversationId) ? "Unstar" : "Star to keep at top"}
                >
                  {starredMessages.has(m.conversationId) ? "★" : "☆"}
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
