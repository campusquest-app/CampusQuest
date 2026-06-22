"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronDown, Pin, Search, SquarePen, Users, X } from "lucide-react";
import type { Character } from "@/lib/types";
import { AvatarDisplay } from "./AvatarDisplay";
import { DirectMessageThread } from "./DirectMessageThread";
import { fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import { requestConnection } from "@/lib/client/connectionRequestActions";
import {
  avatarFromConnectionProfile,
  fetchConnections,
  type ConnectionItem,
} from "@/lib/client/socialConnectionsClient";
import { emitSocialSync, subscribeSocialSync } from "@/lib/client/socialSync";
import {
  buildInboxMessageSearchResults,
  type InboxFriendRow,
  type InboxGroupChatRow,
  type InboxMessageSearchResult,
} from "@/lib/inboxMessageSearch";
import { conversationPreviewText } from "@/lib/client/dmMessagesClient";
import { CreateGroupChatSheet } from "@/components/messages/CreateGroupChatSheet";
import { GroupMessageThread } from "@/components/messages/GroupMessageThread";
import { GroupAvatarStack } from "@/components/messages/GroupAvatarStack";
import { NotificationsCenter } from "./NotificationsCenter";
import { MobileSwipeBackSurface } from "@/components/mobile/MobileSwipeBackSurface";
import { UserSearchInput } from "@/components/ui/UserSearchInput";
import { avatarFromUserSearchResult } from "@/lib/client/userSearchClient";
import {
  fetchPinnedDmUsers,
  pinDmUser,
  unpinDmUser,
  type PinnedDmUserRow,
} from "@/lib/client/pinnedDmUsersClient";

export type InboxSubTab = "messages" | "notifications";

type DirectConversationItem = {
  type: "direct";
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
    recipientId: string | null;
    content: string;
    type?: "text" | "image" | "shared_post";
    previewText?: string;
    createdAt: string;
    readAt: string | null;
  } | null;
  lastReadAt: string | null;
};

type GroupConversationItem = {
  type: "group";
  conversationId: string;
  title: string | null;
  displayName: string;
  memberCount: number;
  members: Array<{
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    role: "owner" | "member";
  }>;
  latestMessage: DirectConversationItem["latestMessage"];
  lastReadAt: string | null;
};

type ConversationItem = DirectConversationItem | GroupConversationItem;

type IncomingConnectionRequest = {
  requestId: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
};

function formatIgTimestamp(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}w`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function resolvePersonAvatar(
  userId: string,
  avatarUrl: string | null,
  friendsById: Map<string, InboxFriendRow>,
): string {
  const friend = friendsById.get(userId);
  if (friend) return avatarFromConnectionProfile(friend);
  const url = avatarUrl?.trim();
  if (url) return url;
  return "";
}

function enrichSearchResults(
  results: InboxMessageSearchResult[],
  friendsById: Map<string, InboxFriendRow>,
  conversations: ConversationItem[],
): InboxMessageSearchResult[] {
  return results.map((result) => {
    if (result.kind === "group") return result;
    const friend = friendsById.get(result.userId);
    const conv = conversations.find(
      (c): c is DirectConversationItem => c.type === "direct" && c.otherUser.id === result.userId,
    );
    const avatar = friend
      ? avatarFromConnectionProfile(friend)
      : resolvePersonAvatar(result.userId, conv?.otherUser.avatarUrl ?? null, friendsById);
    return avatar ? { ...result, avatar } : result;
  });
}

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
  const [friends, setFriends] = useState<InboxFriendRow[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<IncomingConnectionRequest[]>([]);
  const [debouncedMessageSearch, setDebouncedMessageSearch] = useState("");
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [groupWith, setGroupWith] = useState<string | null>(null);
  const [requestsExpanded, setRequestsExpanded] = useState(false);
  const [pinnedUsers, setPinnedUsers] = useState<PinnedDmUserRow[]>([]);
  const [pinBusyUserId, setPinBusyUserId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedMessageSearch(messageSearch), 200);
    return () => window.clearTimeout(timer);
  }, [messageSearch]);

  const friendsById = useMemo(() => new Map(friends.map((f) => [f.userId, f])), [friends]);

  const groupChats = useMemo<InboxGroupChatRow[]>(() => {
    return conversations
      .filter((row): row is GroupConversationItem => row.type === "group")
      .map((row) => ({
        conversationId: row.conversationId,
        name: row.displayName,
        memberCount: row.memberCount,
        memberNames: row.members.map((m) => m.displayName),
        memberAvatars: row.members
          .filter((m) => m.id !== character.id)
          .map((m) => m.avatarUrl ?? "")
          .slice(0, 3),
        latestMessage: conversationPreviewText(row.latestMessage),
        latestMessageAt: row.latestMessage?.createdAt ?? null,
        lastReadAt: row.lastReadAt,
      }));
  }, [conversations, character.id]);

  const messageSearchResults = useMemo(() => {
    const raw = buildInboxMessageSearchResults({
      query: debouncedMessageSearch,
      conversations,
      friends,
      groupChats,
      avatarForFriend: avatarFromConnectionProfile,
    });
    return enrichSearchResults(raw, friendsById, conversations);
  }, [debouncedMessageSearch, conversations, friends, friendsById, groupChats]);

  const isSearchActive = debouncedMessageSearch.trim().length > 0;

  const pinnedUserIds = useMemo(
    () => new Set(pinnedUsers.map((row) => row.pinnedUserId)),
    [pinnedUsers],
  );

  const recentConversationUserIds = useMemo(
    () =>
      new Set(
        conversations
          .filter((c): c is DirectConversationItem => c.type === "direct")
          .filter((c) => {
            const at = c.latestMessage?.createdAt;
            if (!at) return false;
            return Date.now() - new Date(at).getTime() < 1000 * 60 * 60 * 24 * 3;
          })
          .map((c) => c.otherUser.id),
      ),
    [conversations],
  );

  const pinnedRowUsers = useMemo(() => {
    return pinnedUsers
      .filter((row) => row.pinnedUserId !== character.id)
      .map((row) => {
        const friend = friendsById.get(row.pinnedUserId);
        const avatar = friend
          ? avatarFromConnectionProfile(friend)
          : avatarFromConnectionProfile({
              avatarUrl: row.avatarUrl,
              avatarCustomJson: row.avatarCustomJson,
            });
        return {
          ...row,
          avatar,
          isActive: recentConversationUserIds.has(row.pinnedUserId),
        };
      });
  }, [pinnedUsers, character.id, friendsById, recentConversationUserIds]);

  const loadMessageCenter = useCallback(async () => {
    setMessageLoading(true);
    setMessageError(null);
    try {
      const [convoPayload, incomingPayload, connectionsPayload] = await Promise.all([
        fetchAuthed<{ conversations: ConversationItem[] }>("/api/social/conversations"),
        fetchAuthed<{ requests: IncomingConnectionRequest[] }>("/api/social/connections/requests?direction=incoming"),
        fetchConnections(),
      ]);
      setConversations(convoPayload.conversations ?? []);
      setIncomingRequests(incomingPayload.requests ?? []);
      setFriends(mapConnectionsToFriends(connectionsPayload.connections));

      const pinnedPayload = await fetchPinnedDmUsers();
      setPinnedUsers(pinnedPayload.filter((row) => row.pinnedUserId !== character.id));
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Could not load messages.";
      setMessageError(message);
      setPinnedUsers([]);
    } finally {
      setMessageLoading(false);
    }
  }, [character.id]);

  async function handleTogglePin(userId: string, nextPinned: boolean, profileHint?: PinnedDmUserRow) {
    if (userId === character.id) return;

    const previousPinned = pinnedUsers;
    setPinBusyUserId(userId);

    if (nextPinned) {
      const friend = friendsById.get(userId);
      const conv = conversations.find(
        (c): c is DirectConversationItem => c.type === "direct" && c.otherUser.id === userId,
      );
      const optimistic: PinnedDmUserRow =
        profileHint ??
        (friend
          ? {
              pinnedUserId: friend.userId,
              username: friend.username,
              displayName: friend.displayName,
              avatarUrl: friend.avatarUrl,
              avatarCustomJson: friend.avatarCustomJson,
              pinnedAt: new Date().toISOString(),
            }
          : conv
            ? {
                pinnedUserId: conv.otherUser.id,
                username: conv.otherUser.username,
                displayName: conv.otherUser.displayName,
                avatarUrl: conv.otherUser.avatarUrl,
                avatarCustomJson: null,
                pinnedAt: new Date().toISOString(),
              }
            : {
                pinnedUserId: userId,
                username: "",
                displayName: "Pinned user",
                avatarUrl: null,
                avatarCustomJson: null,
                pinnedAt: new Date().toISOString(),
              });

      setPinnedUsers((rows) => {
        if (rows.some((row) => row.pinnedUserId === userId)) return rows;
        return [...rows.filter((row) => row.pinnedUserId !== character.id), optimistic];
      });
    } else {
      setPinnedUsers((rows) => rows.filter((row) => row.pinnedUserId !== userId));
    }

    try {
      if (nextPinned) {
        await pinDmUser(userId);
      } else {
        await unpinDmUser(userId);
      }
      setMessageError(null);
    } catch (pinError) {
      setPinnedUsers(previousPinned);
      const message = pinError instanceof Error ? pinError.message : "Could not update pin.";
      setMessageError(message.replace(/^Backend request failed:[^.]*\.\s*/i, ""));
    } finally {
      setPinBusyUserId(null);
    }
  }

  useEffect(() => {
    if (subTab === "messages") void loadMessageCenter();
  }, [subTab, loadMessageCenter]);

  useEffect(() => {
    if (subTab !== "messages") return;
    const unsubscribe = subscribeSocialSync(() => void loadMessageCenter());
    return unsubscribe;
  }, [subTab, loadMessageCenter]);

  function handleOpenDm(userId: string, username: string, name: string, avatar: string) {
    if (onOpenDm) {
      onOpenDm({ userId, username, name, avatar });
      return;
    }
    setDmWith({ userId, username, name, avatar });
  }

  function handleOpenSearchResult(result: InboxMessageSearchResult) {
    if (result.kind === "group") {
      setGroupWith(result.conversationId);
      return;
    }
    handleOpenDm(result.userId, result.username, result.displayName, result.avatar);
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
      await requestConnection({ username });
      setConnectionUsername("");
      setNewChatOpen(false);
      await loadMessageCenter();
      emitSocialSync({ source: "inbox" });
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Could not send connection request.";
      setMessageError(message.replace(/^Backend request failed:[^.]*\.\s*/i, ""));
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

  const emptyCopy = isSearchActive
    ? "No matches found."
    : personalization?.discoveryFocus?.includes("meet_students")
      ? `No conversations yet. Tap + to connect with students${personalization.schoolName ? ` at ${personalization.schoolName}` : ""}.`
      : "No conversations yet. Tap + to start a new chat.";

  return (
    <MobileSwipeBackSurface onBack={onBack} className="cq-inbox flex min-h-[100dvh] flex-col bg-black">
      <header className="cq-inbox-header shrink-0 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="cq-inbox-header__bar flex items-center justify-between gap-2 px-3 py-2">
          <button type="button" onClick={onBack} className="cq-inbox-icon-btn" aria-label="Back">
            <ArrowLeft className="h-6 w-6" strokeWidth={1.75} />
          </button>

          <button
            type="button"
            className="cq-inbox-header__title flex min-w-0 items-center gap-1"
            aria-label={`${character.username} inbox`}
          >
            <span className="truncate font-semibold text-[17px] text-white">{character.username}</span>
            <ChevronDown className="h-[18px] w-[18px] shrink-0 text-white/70" strokeWidth={2} aria-hidden />
          </button>

          <button
            type="button"
            onClick={() => {
              setMessageError(null);
              setNewChatOpen(true);
            }}
            className="cq-inbox-icon-btn"
            aria-label="New message"
          >
            <SquarePen className="h-[22px] w-[22px]" strokeWidth={1.75} />
          </button>
        </div>

        <div className="cq-inbox-tabs flex border-b border-white/[0.08]">
          <button
            type="button"
            onClick={() => onSubTabChange("messages")}
            className={`cq-inbox-tab flex-1 py-3 text-[13px] font-semibold transition ${
              subTab === "messages" ? "cq-inbox-tab--active text-white" : "text-white/45"
            }`}
            aria-current={subTab === "messages" ? "page" : undefined}
          >
            Messages
          </button>
          <button
            type="button"
            onClick={() => onSubTabChange("notifications")}
            className={`cq-inbox-tab flex-1 py-3 text-[13px] font-semibold transition ${
              subTab === "notifications" ? "cq-inbox-tab--active text-white" : "text-white/45"
            }`}
            aria-current={subTab === "notifications" ? "page" : undefined}
          >
            Notifications
          </button>
        </div>
      </header>

      {subTab === "messages" ? (
        <>
          <div className="cq-inbox-search-wrap shrink-0 px-3 py-2.5">
            <div className="mb-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setMessageError(null);
                  setCreateGroupOpen(true);
                }}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-[#0095f6]/35 bg-[#0095f6]/10 px-3 py-2 text-[13px] font-semibold text-[#0095f6] transition active:bg-[#0095f6]/15"
              >
                <Users className="h-4 w-4" strokeWidth={1.75} />
                New Group
              </button>
            </div>
            <label htmlFor="inbox-msg-search" className="sr-only">
              Search messages
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-[1.125rem] z-[1] h-4 w-4 -translate-y-1/2 text-white/35" aria-hidden />
              <UserSearchInput
                value={messageSearch}
                onChange={setMessageSearch}
                onSelectUser={(user) => {
                  handleOpenDm(
                    user.userId,
                    user.username,
                    user.displayName,
                    avatarFromUserSearchResult(user),
                  );
                  setMessageSearch("");
                }}
                inputId="inbox-msg-search"
                placeholder="Search"
                inputClassName="cq-inbox-search w-full rounded-[10px] py-2 pl-9 pr-3 text-[15px] text-white placeholder:text-white/35"
                ariaLabel="Search messages and users"
                panelClassName="cq-user-search-panel--inbox absolute inset-x-0 top-full z-20 mt-1"
                className="w-full"
              />
            </div>
          </div>

          {!isSearchActive ? (
            <div className="cq-inbox-stories shrink-0 border-b border-white/[0.06] pb-3">
              {pinnedRowUsers.length > 0 ? (
                <div className="flex gap-3 overflow-x-auto px-3 pt-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {pinnedRowUsers.map((pinned) => (
                    <button
                      key={pinned.pinnedUserId}
                      type="button"
                      onClick={() =>
                        handleOpenDm(
                          pinned.pinnedUserId,
                          pinned.username,
                          pinned.displayName,
                          pinned.avatar,
                        )
                      }
                      className="cq-inbox-story flex w-[4.25rem] shrink-0 flex-col items-center gap-1.5"
                    >
                      <div className={`cq-inbox-story-ring cq-inbox-story-ring--pinned ${pinned.isActive ? "cq-inbox-story-ring--active" : ""} relative`}>
                        <div className="cq-inbox-story-avatar overflow-hidden rounded-full bg-[#262626]">
                          <AvatarDisplay avatar={pinned.avatar} fitParent size={56} />
                        </div>
                        {pinned.isActive ? <span className="cq-inbox-story-dot" aria-hidden /> : null}
                      </div>
                      <span className="w-full truncate text-center text-[11px] text-white/80">
                        {pinned.displayName.split(" ")[0]}
                      </span>
                    </button>
                  ))}
                </div>
              ) : !messageLoading ? (
                <p className="px-4 pt-1 pb-0.5 text-center text-[11px] text-white/35">No pinned chats yet</p>
              ) : null}
            </div>
          ) : null}

          {incomingRequests.length > 0 ? (
            <div className="shrink-0 border-b border-white/[0.06]">
              <button
                type="button"
                onClick={() => setRequestsExpanded((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-left active:bg-white/[0.04]"
              >
                <span className="text-sm font-semibold text-white">Message requests</span>
                <span className="rounded-full bg-[#0095f6] px-2 py-0.5 text-[11px] font-bold text-white">
                  {incomingRequests.length}
                </span>
              </button>
              {requestsExpanded ? (
                <ul className="border-t border-white/[0.06]">
                  {incomingRequests.map((request) => (
                    <li key={request.requestId} className="flex items-center gap-3 px-4 py-3">
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-[#262626]">
                        <AvatarDisplay avatar={request.avatarUrl ?? ""} fitParent size={48} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{request.displayName}</p>
                        <p className="truncate text-xs text-white/45">@{request.username}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => void handleAcceptConnection(request.requestId)}
                          className="rounded-lg bg-[#0095f6] px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeclineConnection(request.requestId)}
                          className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {messageError && !newChatOpen ? (
            <p className="mx-4 mt-2 text-xs text-amber-300/90" role="alert">
              {messageError}
            </p>
          ) : null}

          <ul className="cq-inbox-thread-list flex-1 overflow-y-auto overscroll-y-contain" data-cq-scroll-root>
            {messageLoading ? (
              <li className="px-4 py-16 text-center text-sm text-white/40">Loading…</li>
            ) : messageSearchResults.length === 0 ? (
              <li className="px-4 py-16 text-center text-sm text-white/40">{emptyCopy}</li>
            ) : (
              messageSearchResults.map((result) => (
                <InboxThreadRow
                  key={result.key}
                  result={result}
                  conversations={conversations}
                  groupChats={groupChats}
                  currentUserId={character.id}
                  isPinned={result.kind !== "group" ? pinnedUserIds.has(result.userId) : false}
                  pinBusy={result.kind !== "group" && pinBusyUserId === result.userId}
                  onTogglePin={(userId, nextPinned) => void handleTogglePin(userId, nextPinned)}
                  onSelect={() => handleOpenSearchResult(result)}
                />
              ))
            )}
          </ul>
        </>
      ) : (
        <NotificationsCenter
          embedded
          theme="inbox"
          onUnreadCountChange={onUnreadCountChange}
          personalization={personalization}
        />
      )}

      {newChatOpen ? (
        <InboxNewChatSheet
          connectionUsername={connectionUsername}
          sendingRequest={sendingRequest}
          error={messageError}
          friends={friends}
          onUsernameChange={setConnectionUsername}
          onClose={() => {
            setNewChatOpen(false);
            setMessageError(null);
          }}
          onSubmit={handleSendConnectionRequest}
          onSelectFriend={(friend) => {
            setNewChatOpen(false);
            handleOpenDm(
              friend.userId,
              friend.username,
              friend.displayName,
              avatarFromConnectionProfile(friend),
            );
          }}
        />
      ) : null}

      {createGroupOpen ? (
        <CreateGroupChatSheet
          currentUserId={character.id}
          friends={friends}
          error={messageError}
          onClose={() => {
            setCreateGroupOpen(false);
            setMessageError(null);
          }}
          onCreated={(conversationId) => {
            setCreateGroupOpen(false);
            setMessageError(null);
            void loadMessageCenter().then(() => {
              setGroupWith(conversationId);
              emitSocialSync({ source: "inbox" });
            });
          }}
        />
      ) : null}

      {groupWith ? (
        <GroupMessageThread
          currentUser={character}
          conversationId={groupWith}
          onClose={() => setGroupWith(null)}
          onMessageSent={() => void loadMessageCenter()}
        />
      ) : null}

      {dmWith ? (
        <DirectMessageThread
          currentUser={character}
          otherUser={dmWith}
          onClose={() => setDmWith(null)}
          onMessageSent={() => void loadMessageCenter()}
        />
      ) : null}
    </MobileSwipeBackSurface>
  );
}

function InboxThreadRow({
  result,
  conversations,
  groupChats,
  currentUserId,
  isPinned,
  pinBusy,
  onTogglePin,
  onSelect,
}: {
  result: InboxMessageSearchResult;
  conversations: ConversationItem[];
  groupChats: InboxGroupChatRow[];
  currentUserId: string;
  isPinned: boolean;
  pinBusy: boolean;
  onTogglePin: (userId: string, nextPinned: boolean) => void;
  onSelect: () => void;
}) {
  const directConv =
    result.kind === "conversation"
      ? conversations.find(
          (c): c is DirectConversationItem =>
            c.type === "direct" && c.conversationId === result.conversationId,
        )
      : null;
  const groupConv =
    result.kind === "group"
      ? groupChats.find((g) => g.conversationId === result.conversationId)
      : null;
  const groupRow =
    result.kind === "group"
      ? (conversations.find(
          (c): c is GroupConversationItem =>
            c.type === "group" && c.conversationId === result.conversationId,
        ) ?? null)
      : null;

  const isUnread = Boolean(
    directConv?.latestMessage &&
      directConv.latestMessage.senderId !== currentUserId &&
      !directConv.latestMessage.readAt,
  ) || Boolean(
    groupRow?.latestMessage &&
      groupRow.latestMessage.senderId !== currentUserId &&
      (!groupRow.lastReadAt ||
        new Date(groupRow.latestMessage.createdAt).getTime() > new Date(groupRow.lastReadAt).getTime()),
  );

  const preview =
    result.kind === "conversation" || result.kind === "group"
      ? result.subtitle
      : result.kind === "friend"
        ? "Tap to message"
        : "";

  const timestamp =
    result.kind === "conversation" || result.kind === "group" ? formatIgTimestamp(result.meta) : "";
  const canPin = result.kind !== "group" && result.userId !== currentUserId;

  return (
    <li>
      <div className="cq-inbox-thread-row group flex w-full items-center gap-0 text-left">
        <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-3">
          <div className="relative h-[56px] w-[56px] shrink-0">
            {result.kind === "group" ? (
              <GroupAvatarStack avatars={result.memberAvatars} size={56} />
            ) : (
              <div className="h-full w-full overflow-hidden rounded-full bg-[#262626]">
                <AvatarDisplay avatar={result.avatar} fitParent size={56} />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className={`truncate text-[15px] ${isUnread ? "font-bold text-white" : "font-semibold text-white"}`}>
                {result.kind === "group" ? result.name : result.displayName}
              </p>
              {timestamp ? (
                <span className={`shrink-0 text-xs ${isUnread ? "font-semibold text-[#0095f6]" : "text-white/40"}`}>
                  {timestamp}
                </span>
              ) : null}
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <p className={`min-w-0 flex-1 truncate text-sm ${isUnread ? "font-semibold text-white" : "text-white/45"}`}>
                {result.kind !== "group" ? (
                  <>
                    <span className="text-white/55">@{result.username}</span>
                    {preview ? <span className="text-white/35"> · {preview}</span> : null}
                  </>
                ) : groupConv ? (
                  <>
                    {groupConv.memberCount} members
                    {preview ? <span className="text-white/35"> · {preview}</span> : null}
                  </>
                ) : (
                  preview
                )}
              </p>
              {isUnread ? <span className="cq-inbox-unread-dot shrink-0" aria-label="Unread" /> : null}
            </div>
          </div>
        </button>
        {canPin ? (
          <button
            type="button"
            disabled={pinBusy}
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin(result.userId, !isPinned);
            }}
            className={`cq-inbox-pin-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition disabled:opacity-40 ${
              isPinned ? "text-[#0095f6]" : "text-white/30 hover:text-white/55"
            }`}
            aria-label={isPinned ? "Unpin chat" : "Pin chat"}
            aria-pressed={isPinned}
          >
            <Pin className={`h-[18px] w-[18px] ${isPinned ? "fill-current" : ""}`} strokeWidth={1.75} />
          </button>
        ) : null}
      </div>
    </li>
  );
}

function InboxNewChatSheet({
  connectionUsername,
  sendingRequest,
  error,
  friends,
  onUsernameChange,
  onClose,
  onSubmit,
  onSelectFriend,
}: {
  connectionUsername: string;
  sendingRequest: boolean;
  error: string | null;
  friends: InboxFriendRow[];
  onUsernameChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onSelectFriend: (friend: InboxFriendRow) => void;
}) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="New message">
      <button type="button" className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" onClick={onClose} aria-label="Close" />
      <div className="cq-inbox-new-chat relative z-10 w-full max-w-md rounded-t-2xl bg-[#121212] sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
          <button type="button" onClick={onClose} className="cq-inbox-icon-btn" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
          <p className="text-[15px] font-semibold text-white">New message</p>
          <span className="w-9" aria-hidden />
        </div>

        <form onSubmit={onSubmit} className="border-b border-white/[0.08] px-4 py-3">
          <p className="mb-2 text-sm text-white/55">To:</p>
          <UserSearchInput
            value={connectionUsername}
            onChange={onUsernameChange}
            onSelectUser={(user) => {
              onUsernameChange(user.username);
              onSelectFriend({
                userId: user.userId,
                username: user.username,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl,
                avatarCustomJson: user.avatarCustomJson,
              });
            }}
            placeholder="Search name or username"
            inputClassName="w-full rounded-[10px] border border-white/10 bg-black/30 px-3 py-2 text-[15px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/20"
            ariaLabel="Search users to message"
            autoFocus
            panelClassName="cq-user-search-panel--sheet"
          />
          {error ? <p className="mt-2 text-xs text-amber-300/90">{error}</p> : null}
          <button
            type="submit"
            disabled={sendingRequest || !connectionUsername.trim()}
            className="mt-3 w-full rounded-lg bg-[#0095f6] py-2.5 text-sm font-semibold text-white disabled:opacity-45"
          >
            {sendingRequest ? "Sending…" : "Connect & message"}
          </button>
        </form>

        {friends.length > 0 ? (
          <ul className="max-h-[min(50vh,20rem)] overflow-y-auto">
            {friends.map((friend) => (
              <li key={friend.userId}>
                <button
                  type="button"
                  onClick={() => onSelectFriend(friend)}
                  className="cq-inbox-thread-row w-full text-left"
                >
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-[#262626]">
                    <AvatarDisplay avatar={avatarFromConnectionProfile(friend)} fitParent size={48} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{friend.displayName}</p>
                    <p className="truncate text-xs text-white/45">@{friend.username}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-center text-sm text-white/40">Connect with someone by username to start chatting.</p>
        )}
      </div>
    </div>,
    document.body,
  );
}

function mapConnectionsToFriends(connections: ConnectionItem[]): InboxFriendRow[] {
  return connections.map((connection) => ({
    userId: connection.userId,
    username: connection.username,
    displayName: connection.displayName,
    avatarUrl: connection.avatarUrl,
    avatarCustomJson: connection.avatarCustomJson,
  }));
}
