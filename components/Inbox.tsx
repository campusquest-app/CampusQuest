"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import type { Character } from "@/lib/types";
import { AvatarDisplay } from "./AvatarDisplay";
import { DirectMessageThread } from "./DirectMessageThread";
import { fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import { sendConnectionRequest } from "@/lib/client/socialConnectionsClient";
import { emitSocialSync } from "@/lib/client/socialSync";
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
      const result = await sendConnectionRequest(username);
      setConnectionUsername("");
      setMessageError(null);
      await loadMessageCenter();
      emitSocialSync({ source: "inbox" });
      if (process.env.NODE_ENV !== "production") {
        console.info("[cq:friend-request:success]", {
          targetUsername: username,
          friendRequestId: result.connection.id,
          recipientId: result.connection.addresseeId,
          notificationId: result.notification.id,
        });
      }
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
      emitSocialSync({ source: "inbox" });
    } catch (acceptError) {
      const message = acceptError instanceof Error ? acceptError.message : "Could not accept request.";
      setMessageError(message);
    }
  }

  async function handleDeclineConnection(requestId: string) {
    try {
      await postAuthed("/api/social/connections/requests/respond", { requestId, action: "decline" });
      await loadMessageCenter();
      emitSocialSync({ source: "inbox" });
    } catch (declineError) {
      const message = declineError instanceof Error ? declineError.message : "Could not decline request.";
      setMessageError(message);
    }
  }

  return (
    <div className="cq-tab-shell flex min-h-[60vh] flex-col space-y-4 pb-8">
      <header className="cq-screen-header mb-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/20 text-white/85 transition hover:bg-cq-elevated/10 hover:text-white"
            aria-label="Back"
          >
            ←
          </button>
          <div className="min-w-0 flex-1">
            <p className="cq-screen-header__eyebrow">Messages &amp; Alerts</p>
            <h2 className="cq-screen-header__title">Inbox</h2>
          </div>
        </div>
        <div className="mt-4 flex rounded-xl border border-white/15 bg-black/25 p-1">
          <button
            type="button"
            onClick={() => onSubTabChange("messages")}
            className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all ${
              subTab === "messages"
                ? "bg-uri-keaney text-white shadow-sm"
                : "text-white/65 hover:bg-cq-elevated/10 hover:text-white"
            }`}
          >
            Messages
          </button>
          <button
            type="button"
            onClick={() => onSubTabChange("notifications")}
            className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all ${
              subTab === "notifications"
                ? "bg-uri-keaney text-white shadow-sm"
                : "text-white/65 hover:bg-cq-elevated/10 hover:text-white"
            }`}
          >
            Notifications
          </button>
        </div>
      </header>

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
            <div className="border-b border-cq-border bg-cq-elevated p-3 sm:p-4">
              <form onSubmit={handleSendConnectionRequest} className="mb-3 flex gap-2">
                <input
                  type="text"
                  value={connectionUsername}
                  onChange={(e) => setConnectionUsername(e.target.value)}
                  placeholder="Connect by username (e.g. alex_rhody)"
                  className="flex-1 rounded-xl border border-cq-border bg-cq-elevated px-3 py-2.5 text-sm text-cq-foreground placeholder:text-cq-muted focus:border-uri-keaney/50 focus:outline-none focus:ring-2 focus:ring-uri-keaney/25"
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
                    <div key={request.requestId} className="flex items-center justify-between gap-2 rounded-lg border border-cq-border bg-cq-elevated p-2">
                      <p className="text-xs text-cq-foreground truncate">
                        <span className="font-semibold">{request.displayName}</span> @{request.username} wants to connect
                      </p>
                      <div className="flex gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleAcceptConnection(request.requestId)}
                          className="px-2.5 py-1 rounded-md text-xs font-semibold bg-uri-keaney text-uri-navy"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeclineConnection(request.requestId)}
                          className="px-2.5 py-1 rounded-md text-xs font-semibold border border-cq-border text-cq-muted hover:bg-cq-elevated"
                        >
                          Deny
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <label htmlFor="inbox-msg-search" className="sr-only">
                Search messages by name
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cq-muted" aria-hidden>
                  🔍
                </span>
                <input
                  id="inbox-msg-search"
                  type="search"
                  value={messageSearch}
                  onChange={(e) => setMessageSearch(e.target.value)}
                  placeholder="Search by name…"
                  autoComplete="off"
                  className="w-full rounded-xl border border-cq-border bg-cq-elevated py-2.5 pl-10 pr-3 text-sm text-cq-foreground placeholder:text-cq-muted transition-colors focus:border-uri-keaney/50 focus:outline-none focus:ring-2 focus:ring-uri-keaney/25"
                />
              </div>
            </div>
            {messageError && (
              <div className="mx-3 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {messageError}
              </div>
            )}
            <ul className="max-h-[min(50vh,28rem)] divide-y divide-cq-border overflow-y-auto overscroll-y-contain">
            {messageLoading ? (
              <li className="px-4 py-10 text-center text-sm text-cq-muted">Loading conversations...</li>
            ) : filteredMessages.length === 0 ? (
              <li className="px-4 py-10 text-center">
                <p className="text-sm text-cq-muted">
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
                    className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-cq-elevated"
                  >
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-cq-border bg-cq-elevated">
                      <AvatarDisplay avatar={m.otherUser.avatarUrl ?? "🎓"} size={44} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-cq-foreground">{m.otherUser.displayName}</p>
                      <p className="truncate text-sm text-cq-muted">{m.latestMessage?.content ?? "No messages yet"}</p>
                      <p className="mt-0.5 text-xs text-cq-subtle">
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
