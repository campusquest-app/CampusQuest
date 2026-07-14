"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowLeft, ChevronRight } from "lucide-react";
import { useRegisterImmersiveScreen } from "@/lib/client/nestedImmersiveScreen";
import { useDmKeyboardInsets } from "@/lib/client/useDmKeyboardInsets";
import type { Character } from "@/lib/types";
import type { InboxFriendRow } from "@/lib/inboxMessageSearch";
import { fetchAuthed } from "@/lib/client/dashboardApi";
import {
  getDmAudioDurationSeconds,
  readBlobAsDataUrl,
  sendRichDirectMessage,
  uploadDmAudio,
  uploadDmImage,
  type DirectMessageDto,
} from "@/lib/client/dmMessagesClient";
import type { DmPendingImageDraft } from "@/lib/client/dmMediaComposer";
import type { DmVoiceRecordingResult } from "@/lib/client/useDmVoiceRecorder";
import { fetchGroupConversation, type GroupConversationDetails } from "@/lib/client/groupChatClient";
import { humanReadableShortName } from "@/lib/groupDisplayName";
import { emitSocialSync, subscribeSocialSync } from "@/lib/client/socialSync";
import {
  emitConversationReadConfirmed,
  emitConversationReadOptimistic,
  emitConversationReadRollback,
  type ConversationReadSync,
} from "@/lib/client/inboxReadSync";
import { DmThreadComposer } from "@/components/messages/DmThreadComposer";
import { DmImageMessage } from "@/components/messages/DmImageMessage";
import { DmAudioMessage } from "@/components/messages/DmAudioMessage";
import { DmSharedPostCard } from "@/components/messages/DmSharedPostCard";
import { GroupAvatarStack } from "@/components/messages/GroupAvatarStack";
import { GroupInfoSheet } from "@/components/messages/GroupInfoSheet";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import { MobileSwipeBackSurface } from "@/components/mobile/MobileSwipeBackSurface";

const GROUP_GAP_MS = 2 * 60 * 1000;
const NEAR_BOTTOM_PX = 140;

function formatTimeDivider(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (sameDay) return time;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

function mergeById(prev: DirectMessageDto[], incoming: DirectMessageDto[]): DirectMessageDto[] {
  const map = new Map<string, DirectMessageDto>();
  for (const message of prev) {
    if (!message.pending && !message.failed) map.set(message.id, message);
  }
  for (const message of incoming) map.set(message.id, message);
  for (const message of prev) {
    if ((message.pending || message.failed) && !map.has(message.id)) {
      map.set(message.id, message);
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

export function GroupMessageThread({
  currentUser,
  conversationId,
  friends = [],
  onClose,
  onMessageSent,
}: {
  currentUser: Character;
  conversationId: string;
  friends?: InboxFriendRow[];
  onClose: () => void;
  onMessageSent?: () => void;
}) {
  const [group, setGroup] = useState<GroupConversationDetails | null>(null);
  const [messages, setMessages] = useState<DirectMessageDto[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [imageDraft, setImageDraft] = useState<DmPendingImageDraft | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [infoOpen, setInfoOpen] = useState(false);
  const [showJumpBottom, setShowJumpBottom] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const lastMessageCountRef = useRef(0);

  useRegisterImmersiveScreen();
  useDmKeyboardInsets(threadRef);

  const loadThread = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) setLoading(true);
      setError(null);
      try {
        if (!options?.silent) {
          emitConversationReadOptimistic({ conversationId });
        }

        const [groupDetails, messagesPayload] = await Promise.all([
          fetchGroupConversation(conversationId),
          fetchAuthed<{ messages: DirectMessageDto[]; readSync: ConversationReadSync }>(
            `/api/social/conversations/${conversationId}/messages?limit=80`,
          ),
        ]);
        setGroup(groupDetails);
        setMessages((prev) => (options?.silent ? mergeById(prev, messagesPayload.messages) : messagesPayload.messages));

        if (messagesPayload.readSync) {
          const hasNewReads =
            messagesPayload.readSync.notificationsMarkedRead > 0 ||
            messagesPayload.readSync.messagesMarkedRead > 0;
          if (!options?.silent || hasNewReads) {
            emitConversationReadConfirmed({
              conversationId,
              readSync: messagesPayload.readSync,
            });
          }
        }
        emitSocialSync({ source: "inbox" });
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "Could not load group chat.";
        const cleaned = message.replace(/^Backend request failed:[^.]*\.\s*/i, "");
        setError(cleaned);
        if (!options?.silent) {
          emitConversationReadRollback({ conversationId, error: cleaned });
        }
      } finally {
        if (!options?.silent) setLoading(false);
      }
    },
    [conversationId],
  );

  useEffect(() => {
    void loadThread();
    const unsubscribe = subscribeSocialSync(() => void loadThread({ silent: true }));
    return unsubscribe;
  }, [loadThread]);

  useEffect(() => {
    let cancelled = false;

    async function pollMessages() {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        const payload = await fetchAuthed<{
          messages: DirectMessageDto[];
          readSync: ConversationReadSync;
        }>(`/api/social/conversations/${conversationId}/messages?limit=80`);
        if (cancelled) return;
        setMessages((prev) => mergeById(prev, payload.messages));
        if (
          payload.readSync &&
          (payload.readSync.notificationsMarkedRead > 0 || payload.readSync.messagesMarkedRead > 0)
        ) {
          emitConversationReadConfirmed({ conversationId, readSync: payload.readSync });
          emitSocialSync({ source: "inbox" });
        }
      } catch {
        // Silent background poll.
      }
    }

    const intervalId = window.setInterval(() => void pollMessages(), 8000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [conversationId]);

  const handleListScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < NEAR_BOTTOM_PX;
    stickToBottomRef.current = nearBottom;
    setShowJumpBottom(!nearBottom && messages.length > 0);
  }, [messages.length]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = listRef.current;
    if (!el) return;
    stickToBottomRef.current = true;
    setShowJumpBottom(false);
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const grew = messages.length > lastMessageCountRef.current;
    const isInitialLoad = lastMessageCountRef.current === 0 && messages.length > 0;
    lastMessageCountRef.current = messages.length;
    if (isInitialLoad || (grew && stickToBottomRef.current)) {
      el.scrollTo({ top: el.scrollHeight, behavior: isInitialLoad ? "auto" : "smooth" });
    } else if (grew && !stickToBottomRef.current) {
      setShowJumpBottom(true);
    }
  }, [messages]);

  const renderRows = useMemo(() => {
    return messages.map((m, index) => {
      const prev = messages[index - 1];
      const isMe = m.senderId === currentUser.id;
      const prevIsMe = prev ? prev.senderId === currentUser.id : null;
      const gapFromPrev = prev ? new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() : Infinity;
      const sameSender = prev && prev.senderId === m.senderId;
      const isClusterStart = !sameSender || gapFromPrev > GROUP_GAP_MS;
      const showTimeDivider =
        !prev || new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > 15 * 60 * 1000;
      return {
        m,
        isMe,
        isClusterStart: isClusterStart && !showTimeDivider,
        showSender: !isMe && (isClusterStart || showTimeDivider),
        showAvatar: !isMe && (isClusterStart || showTimeDivider),
        showTimeDivider,
        prevIsMe,
      };
    });
  }, [messages, currentUser.id]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || sending || imageDraft) return;

    const optimisticId = `pending-${Date.now()}`;
    const optimistic: DirectMessageDto = {
      id: optimisticId,
      conversationId,
      senderId: currentUser.id,
      recipientId: null,
      type: "text",
      content: trimmed,
      imageUrl: null,
      sharedPostId: null,
      sharedPostType: null,
      metadata: {},
      sharedPostPreview: null,
      previewText: trimmed,
      createdAt: new Date().toISOString(),
      readAt: null,
      pending: true,
      sender: {
        id: currentUser.id,
        displayName: currentUser.name || currentUser.username,
        username: currentUser.username,
        avatarUrl: currentUser.avatar || null,
      },
    };

    setSending(true);
    stickToBottomRef.current = true;
    setInput("");
    setMessages((prev) => [...prev.filter((m) => !m.failed), optimistic]);

    try {
      const message = await sendRichDirectMessage({
        conversationId,
        type: "text",
        content: trimmed,
      });
      setMessages((prev) => prev.map((m) => (m.id === optimisticId ? message : m)));
      setError(null);
      onMessageSent?.();
      emitSocialSync({ source: "inbox" });
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Could not send message.";
      setError(message);
      setInput(trimmed);
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticId ? { ...m, pending: false, failed: true } : m)),
      );
    } finally {
      setSending(false);
    }
  }

  const handleImageSend = useCallback(
    async ({ draft, caption }: { draft: DmPendingImageDraft; caption: string }) => {
      if (sending) return;
      setSending(true);
      stickToBottomRef.current = true;
      setUploadProgress(12);
      const optimisticId = `pending-${Date.now()}`;
      const displayContent = caption || "📷 Photo";
      setMessages((prev) => [
        ...prev.filter((m) => !m.failed),
        {
          id: optimisticId,
          conversationId,
          senderId: currentUser.id,
          recipientId: null,
          type: "image",
          content: displayContent,
          imageUrl: draft.dataUrl,
          sharedPostId: null,
          sharedPostType: null,
          metadata: { pickSource: draft.source },
          sharedPostPreview: null,
          previewText: displayContent,
          createdAt: new Date().toISOString(),
          readAt: null,
          pending: true,
          uploadProgress: 12,
          sender: {
            id: currentUser.id,
            displayName: currentUser.name || currentUser.username,
            username: currentUser.username,
            avatarUrl: currentUser.avatar || null,
          },
        },
      ]);
      setImageDraft(null);

      try {
        setUploadProgress(45);
        const imageUrl = await uploadDmImage({ conversationId, imageDataUrl: draft.dataUrl });
        setUploadProgress(78);
        const message = await sendRichDirectMessage({
          conversationId,
          type: "image",
          content: caption,
          imageUrl,
        });
        setMessages((prev) => prev.map((m) => (m.id === optimisticId ? message : m)));
        setError(null);
        onMessageSent?.();
        emitSocialSync({ source: "inbox" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not send image.";
        setError(message);
        setMessages((prev) =>
          prev.map((m) => (m.id === optimisticId ? { ...m, pending: false, failed: true } : m)),
        );
      } finally {
        setSending(false);
        setUploadProgress(0);
      }
    },
    [conversationId, currentUser, onMessageSent, sending],
  );

  const handleAudioSend = useCallback(
    async (result: DmVoiceRecordingResult) => {
      if (sending) return;
      setSending(true);
      stickToBottomRef.current = true;
      const optimisticId = `pending-${Date.now()}`;
      const dataUrl = await readBlobAsDataUrl(result.blob);
      const durationSeconds = Math.max(1, Math.round(result.durationMs / 1000));
      setMessages((prev) => [
        ...prev.filter((m) => !m.failed),
        {
          id: optimisticId,
          conversationId,
          senderId: currentUser.id,
          recipientId: null,
          type: "audio",
          content: "🎤 Voice message",
          imageUrl: dataUrl,
          sharedPostId: null,
          sharedPostType: null,
          metadata: { durationSeconds },
          sharedPostPreview: null,
          previewText: "🎤 Voice message",
          createdAt: new Date().toISOString(),
          readAt: null,
          pending: true,
          sender: {
            id: currentUser.id,
            displayName: currentUser.name || currentUser.username,
            username: currentUser.username,
            avatarUrl: currentUser.avatar || null,
          },
        },
      ]);

      try {
        const audioUrl = await uploadDmAudio({ conversationId, audioDataUrl: dataUrl });
        const message = await sendRichDirectMessage({
          conversationId,
          type: "audio",
          imageUrl: audioUrl,
          metadata: { durationSeconds },
        });
        setMessages((prev) => prev.map((m) => (m.id === optimisticId ? message : m)));
        setError(null);
        onMessageSent?.();
        emitSocialSync({ source: "inbox" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not send voice message.";
        setError(message);
        setMessages((prev) =>
          prev.map((m) => (m.id === optimisticId ? { ...m, pending: false, failed: true } : m)),
        );
      } finally {
        setSending(false);
      }
    },
    [conversationId, currentUser, onMessageSent, sending],
  );

  const avatarMembers = useMemo(
    () =>
      (group?.members ?? [])
        .filter((m) => m.id !== currentUser.id)
        .map((m) => ({ avatarUrl: m.avatarUrl, displayName: m.displayName }))
        .slice(0, 3),
    [group?.members, currentUser.id],
  );

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={threadRef}
      className="fixed inset-0 z-[200] h-[100dvh] max-h-[100dvh] cq-dm-thread cq-dm-thread--enter cq-group-thread"
    >
      <MobileSwipeBackSurface onBack={onClose} className="cq-dm-thread flex h-full max-h-full flex-col bg-black">
        <header className="cq-group-thread-header flex shrink-0 items-center gap-1 border-b border-white/[0.08] px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <button type="button" onClick={onClose} className="cq-dm-header-btn" aria-label="Back">
            <ArrowLeft className="h-6 w-6" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1.5 py-1.5 text-left active:bg-white/[0.04]"
            aria-label="Open group info"
          >
            <GroupAvatarStack members={avatarMembers} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold leading-tight text-white">
                {group?.displayName ?? "Group chat"}
              </p>
              <p className="truncate text-[12px] text-white/45">
                {group ? `${group.memberCount} members` : "Loading…"}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-white/30" aria-hidden />
          </button>
        </header>

        {error ? (
          <p className="shrink-0 px-4 py-2 text-xs text-amber-300/90" role="alert">
            {error}
          </p>
        ) : null}

        <div className="relative min-h-0 flex-1">
          <div
            ref={listRef}
            onScroll={handleListScroll}
            className="cq-group-thread-messages absolute inset-0 overflow-y-auto overscroll-y-contain px-3 py-3"
          >
            {loading ? (
              <p className="py-12 text-center text-sm text-white/40">Loading…</p>
            ) : messages.length === 0 ? (
              <GroupEmptyState
                title={group?.displayName ?? "Group chat"}
                memberCount={group?.memberCount ?? 0}
                members={avatarMembers}
              />
            ) : (
              <ul className="flex flex-col pb-2">
                {renderRows.map(({ m, isMe, isClusterStart, showSender, showAvatar, showTimeDivider }) => (
                  <li key={m.id}>
                    {showTimeDivider ? (
                      <p className="my-3 text-center text-[11px] font-medium tracking-wide text-white/35">
                        {formatTimeDivider(m.createdAt)}
                      </p>
                    ) : null}
                    <GroupMessageBubble
                      message={m}
                      isMe={isMe}
                      isClusterStart={isClusterStart}
                      showSender={showSender}
                      showAvatar={showAvatar}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {showJumpBottom ? (
            <button
              type="button"
              onClick={() => scrollToBottom("smooth")}
              className="cq-group-jump-bottom absolute bottom-3 left-1/2 z-10 flex h-11 -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/15 bg-[#1c1c1e]/95 px-3.5 text-xs font-semibold text-white shadow-lg backdrop-blur"
              aria-label="Jump to latest messages"
            >
              <ArrowDown className="h-3.5 w-3.5" strokeWidth={2.2} />
              New messages
            </button>
          ) : null}
        </div>

        <DmThreadComposer
          input={input}
          onInputChange={setInput}
          onSubmit={(e) => void handleSend(e)}
          disabled={loading}
          sending={sending}
          imageDraft={imageDraft}
          onImageDraftChange={setImageDraft}
          onImageSend={(args) => void handleImageSend(args)}
          onAudioSend={(result) => void handleAudioSend(result)}
          onMediaError={setError}
          uploadProgress={uploadProgress}
        />
      </MobileSwipeBackSurface>

      {infoOpen && group ? (
        <GroupInfoSheet
          group={group}
          currentUserId={currentUser.id}
          friends={friends}
          messages={messages}
          onClose={() => setInfoOpen(false)}
          onUpdated={(next) => {
            setGroup(next);
            emitSocialSync({ source: "inbox" });
          }}
          onLeft={() => {
            setInfoOpen(false);
            onClose();
            emitSocialSync({ source: "inbox" });
          }}
        />
      ) : null}
    </div>,
    document.body,
  );
}

function GroupEmptyState({
  title,
  memberCount,
  members,
}: {
  title: string;
  memberCount: number;
  members: Array<{ avatarUrl?: string | null; displayName?: string }>;
}) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-8 py-16 text-center">
      <GroupAvatarStack members={members} size={88} />
      <p className="mt-4 max-w-[16rem] text-[17px] font-semibold leading-snug text-white">{title}</p>
      <p className="mt-1.5 text-[13px] text-white/45">
        {memberCount} {memberCount === 1 ? "member" : "members"}
      </p>
      <p className="mt-5 text-[14px] font-medium text-white/55">Start the conversation</p>
    </div>
  );
}

const GroupMessageBubble = memo(function GroupMessageBubble({
  message,
  isMe,
  isClusterStart,
  showSender,
  showAvatar,
}: {
  message: DirectMessageDto;
  isMe: boolean;
  isClusterStart: boolean;
  showSender: boolean;
  showAvatar: boolean;
}) {
  const senderName = humanReadableShortName(
    message.sender?.displayName ?? "Member",
    message.sender?.username,
  );
  const senderAvatar = message.sender?.avatarUrl ?? "";
  const showCaption =
    message.type === "text" ||
    (message.type === "image" && message.content.trim() && message.content.trim() !== "📷 Photo") ||
    (message.type === "shared_post" && message.content.trim() && message.content.trim() !== "Shared a post");
  const isSharedPost = message.type === "shared_post" && message.sharedPostPreview;
  const isImageOnly = message.type === "image" && message.imageUrl && !showCaption;
  const isAudioOnly = message.type === "audio" && message.imageUrl;
  const bubbleClass = isMe ? "cq-dm-bubble cq-dm-bubble--sent" : "cq-dm-bubble cq-dm-bubble--received";

  return (
    <div
      className={`flex ${isMe ? "justify-end" : "justify-start"} ${isClusterStart ? "mt-3" : "mt-0.5"}`}
    >
      <div className={`flex max-w-[76%] gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
        {!isMe ? (
          <div className={`mt-auto h-7 w-7 shrink-0 ${showAvatar ? "" : "invisible"}`}>
            <div className="h-7 w-7 overflow-hidden rounded-full bg-[#262626] ring-1 ring-black/40">
              <AvatarDisplay avatar={senderAvatar} fitParent size={28} />
            </div>
          </div>
        ) : null}
        <div className="min-w-0">
          {showSender ? (
            <p className="mb-1 px-1 text-[11px] font-semibold tracking-wide text-[#a8c7ff]">{senderName}</p>
          ) : null}
          <div
            className={`cq-dm-bubble-wrap select-none ${message.pending ? "opacity-70" : ""} ${
              message.failed ? "ring-1 ring-rose-400/40 rounded-2xl" : ""
            }`}
          >
            {isImageOnly ? (
              <div className="cq-dm-bubble-enter overflow-hidden rounded-[1.25rem]">
                <DmImageMessage
                  imageUrl={message.imageUrl!}
                  pending={message.pending}
                  uploadProgress={message.uploadProgress}
                />
              </div>
            ) : isAudioOnly ? (
              <div className="cq-dm-bubble-enter">
                <DmAudioMessage
                  audioUrl={message.imageUrl!}
                  durationSeconds={getDmAudioDurationSeconds(message)}
                  pending={message.pending}
                  uploadProgress={message.uploadProgress}
                  isSent={isMe}
                />
              </div>
            ) : isSharedPost ? (
              <div className={`cq-dm-bubble-enter ${bubbleClass} p-1.5`}>
                <DmSharedPostCard preview={message.sharedPostPreview!} />
                {showCaption ? (
                  <p className="mt-1.5 px-1 text-sm whitespace-pre-wrap break-words text-white">{message.content}</p>
                ) : null}
              </div>
            ) : (
              <div className={`cq-dm-bubble-enter ${bubbleClass} px-3.5 py-2`}>
                {message.type === "image" && message.imageUrl ? (
                  <div className="mb-2 -mx-1 overflow-hidden rounded-xl">
                    <DmImageMessage
                      imageUrl={message.imageUrl}
                      pending={message.pending}
                      uploadProgress={message.uploadProgress}
                    />
                  </div>
                ) : null}
                {message.type === "audio" && message.imageUrl ? (
                  <div className="mb-1">
                    <DmAudioMessage
                      audioUrl={message.imageUrl}
                      durationSeconds={getDmAudioDurationSeconds(message)}
                      pending={message.pending}
                      uploadProgress={message.uploadProgress}
                      isSent={isMe}
                    />
                  </div>
                ) : null}
                {showCaption ? (
                  <p className="text-[15px] leading-[1.35] whitespace-pre-wrap break-words">{message.content}</p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
