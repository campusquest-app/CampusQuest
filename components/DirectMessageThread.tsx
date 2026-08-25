"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Ban, EyeOff, MoreHorizontal, Sparkles, UserRound } from "lucide-react";
import type { Character, FieldNote } from "@/lib/types";
import type { Friend } from "@/lib/types";
import { fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import {
  fetchRelationship,
} from "@/lib/client/socialConnectionsClient";
import {
  acceptIncomingConnectionRequest,
  declineIncomingConnectionRequest,
  refreshRelationship,
  relationshipToConnectionActionState,
  requestConnection,
} from "@/lib/client/connectionRequestActions";
import { emitSocialSync, subscribeSocialSync } from "@/lib/client/socialSync";
import {
  emitConversationReadConfirmed,
  emitConversationReadOptimistic,
  emitConversationReadRollback,
  type ConversationReadSync,
} from "@/lib/client/inboxReadSync";
import {
  sendRichDirectMessage,
  uploadDmAudio,
  uploadDmImage,
  readBlobAsDataUrl,
  getDmAudioDurationSeconds,
  type DirectMessageDto,
  type DmFailedRetryPayload,
} from "@/lib/client/dmMessagesClient";
import type { DmPendingImageDraft } from "@/lib/client/dmMediaComposer";
import type { DmVoiceRecordingResult } from "@/lib/client/useDmVoiceRecorder";
import { DmThreadComposer } from "@/components/messages/DmThreadComposer";
import { DmMessageActionSheet, type DmMessageAction } from "@/components/messages/DmMessageActionSheet";
import { fetchQuadPostById } from "@/lib/client/quadPostsClient";
import { DmImageMessage } from "@/components/messages/DmImageMessage";
import { DmAudioMessage } from "@/components/messages/DmAudioMessage";
import { DmSharedPostCard } from "@/components/messages/DmSharedPostCard";
import { ProfilePostDetail } from "@/components/profile/ProfilePostDetail";
import { AvatarDisplay } from "./AvatarDisplay";
import { MobileSwipeBackSurface } from "@/components/mobile/MobileSwipeBackSurface";
import { fetchFriendCharacter } from "@/lib/client/friendProfileClient";
import { useRegisterImmersiveScreen } from "@/lib/client/nestedImmersiveScreen";
import { useDmKeyboardInsets } from "@/lib/client/useDmKeyboardInsets";

const SAFETY_NOTICE =
  "Keep conversations respectful. Harassment, threats, scams, or unsafe conduct may lead to removal from CampusQuest and referral to university conduct offices.";

function formatTimeDivider(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (sameDay) return time;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  const dateLabel = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
  return `${dateLabel} · ${time}`;
}

/**
 * A single DM message row. Defined at module scope (not inline) so it isn't
 * remounted on every parent render (e.g. while typing), which would otherwise
 * replay the bubble enter animation and cause scroll jitter.
 */
function DmMessageBubbleRow({
  m,
  isMe,
  isGroupStart,
  isLatestOutgoing,
  isRevealed,
  onReveal,
  onOpenActions,
  onOpenSharedPost,
  onRetryFailed,
}: {
  m: DirectMessageDto;
  isMe: boolean;
  isGroupStart: boolean;
  isLatestOutgoing: boolean;
  isRevealed: boolean;
  onReveal: (id: string) => void;
  onOpenActions: (id: string) => void;
  onOpenSharedPost: (preview: NonNullable<DirectMessageDto["sharedPostPreview"]>) => void;
  onRetryFailed: (message: DirectMessageDto) => void;
}) {
  const favorited = Boolean(m.isFavorited);
  const isTaggedSharedPost =
    m.type === "shared_post" && m.metadata?.reason === "tagged_in_post";
  const showCaption =
    m.type === "text" ||
    (m.type === "image" && m.content.trim() && m.content.trim() !== "📷 Photo") ||
    (m.type === "shared_post" &&
      !isTaggedSharedPost &&
      m.content.trim() &&
      m.content.trim() !== "Shared a post");
  const isSharedPost = m.type === "shared_post" && m.sharedPostPreview;
  const isImageOnly = m.type === "image" && m.imageUrl && !showCaption;
  const isAudioOnly = m.type === "audio" && m.imageUrl;

  const bubbleClass = isMe ? "cq-dm-bubble cq-dm-bubble--sent" : "cq-dm-bubble cq-dm-bubble--received";

  const showMeta = isLatestOutgoing || isRevealed || Boolean(m.pending) || Boolean(m.failed);

  const longPressTimer = useRef<number | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);

  const clearLongPress = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const openActions = () => {
    if (m.pending || m.failed) return;
    onOpenActions(m.id);
    try {
      navigator.vibrate?.(8);
    } catch {
      /* haptics optional */
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (m.pending || m.failed) return;
    pressStart.current = { x: e.clientX, y: e.clientY };
    clearLongPress();
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null;
      openActions();
    }, 430);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pressStart.current) return;
    const dx = Math.abs(e.clientX - pressStart.current.x);
    const dy = Math.abs(e.clientY - pressStart.current.y);
    if (dx > 10 || dy > 10) clearLongPress();
  };

  const onPointerUp = () => {
    const wasShortPress = longPressTimer.current !== null;
    clearLongPress();
    pressStart.current = null;
    if (wasShortPress && !m.pending && !m.failed) {
      onReveal(m.id);
    }
  };

  const metaText = m.pending
    ? "Sending…"
    : m.failed
      ? "Failed to send · Tap to retry"
      : isMe && isLatestOutgoing && m.readAt
        ? "Seen"
        : isMe && isLatestOutgoing
          ? "Sent"
          : new Date(m.createdAt).toLocaleString(undefined, { hour: "numeric", minute: "2-digit" });

  return (
    <div
      className={`flex flex-wrap items-end gap-1.5 ${isMe ? "justify-end" : "justify-start"} ${
        isGroupStart ? "mt-3" : "mt-0.5"
      }`}
    >
      {isMe && favorited ? (
        <Sparkles className="mb-1 h-3.5 w-3.5 shrink-0 text-uri-gold/80" strokeWidth={2} aria-label="Saved" />
      ) : null}
      <div
        className={`cq-dm-bubble-wrap relative max-w-[74%] select-none ${m.pending ? "opacity-70" : ""} ${
          m.failed ? "ring-1 ring-rose-400/40 rounded-2xl" : ""
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={clearLongPress}
        onContextMenu={(e) => {
          e.preventDefault();
          openActions();
        }}
      >
        {isImageOnly ? (
          <div className="cq-dm-bubble-enter overflow-hidden rounded-[1.25rem]">
            <DmImageMessage imageUrl={m.imageUrl!} pending={m.pending} uploadProgress={m.uploadProgress} />
          </div>
        ) : isAudioOnly ? (
          <div className="cq-dm-bubble-enter">
            <DmAudioMessage
              audioUrl={m.imageUrl!}
              durationSeconds={getDmAudioDurationSeconds(m)}
              pending={m.pending}
              uploadProgress={m.uploadProgress}
              isSent={isMe}
            />
          </div>
        ) : isSharedPost ? (
          <div className={`cq-dm-bubble-enter ${bubbleClass} p-1.5`}>
            <DmSharedPostCard
              preview={m.sharedPostPreview!}
              reason={typeof m.metadata?.reason === "string" ? m.metadata.reason : null}
              timestamp={m.createdAt}
              onOpen={() => onOpenSharedPost(m.sharedPostPreview!)}
            />
            {showCaption ? (
              <p className="mt-1.5 px-1 text-sm whitespace-pre-wrap break-words text-white">{m.content}</p>
            ) : null}
          </div>
        ) : (
          <div className={`cq-dm-bubble-enter ${bubbleClass} px-4 py-2`}>
            {m.type === "image" && m.imageUrl ? (
              <div className="mb-2 -mx-1.5 overflow-hidden rounded-xl">
                <DmImageMessage imageUrl={m.imageUrl} pending={m.pending} uploadProgress={m.uploadProgress} />
              </div>
            ) : null}
            {m.type === "audio" && m.imageUrl ? (
              <div className="mb-1">
                <DmAudioMessage
                  audioUrl={m.imageUrl}
                  durationSeconds={getDmAudioDurationSeconds(m)}
                  pending={m.pending}
                  uploadProgress={m.uploadProgress}
                  isSent={isMe}
                />
              </div>
            ) : null}
            {showCaption ? (
              <>
                {typeof m.metadata?.marketplaceTitle === "string" ? (
                  <p className="cq-dm-market-chip">
                    {String(m.metadata.marketplaceTitle)}
                    {typeof m.metadata.marketplacePrice === "string" ? ` — ${String(m.metadata.marketplacePrice)}` : ""}
                  </p>
                ) : null}
                <p className="text-[15px] leading-snug whitespace-pre-wrap break-words">{m.content}</p>
              </>
            ) : null}
          </div>
        )}
      </div>
      {!isMe && favorited ? (
        <Sparkles className="mb-1 h-3.5 w-3.5 shrink-0 text-uri-gold/80" strokeWidth={2} aria-label="Saved" />
      ) : null}
      {showMeta ? (
        <p
          className={`cq-dm-meta basis-full text-[10px] ${
            isMe ? "text-right text-white/45" : "text-left text-white/40"
          } ${m.failed ? "cursor-pointer text-rose-300/80" : ""}`}
          onClick={() => {
            if (m.failed) onRetryFailed(m);
          }}
          onKeyDown={(e) => {
            if (m.failed && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              onRetryFailed(m);
            }
          }}
          role={m.failed ? "button" : undefined}
          tabIndex={m.failed ? 0 : undefined}
        >
          {metaText}
        </p>
      ) : null}
    </div>
  );
}

export function DirectMessageThread({
  currentUser,
  otherUser,
  onClose,
  onMessageSent,
  onViewProfile,
}: {
  currentUser: Character;
  otherUser: Pick<Friend, "userId" | "username" | "name" | "avatar">;
  onClose: () => void;
  onMessageSent?: () => void;
  onViewProfile?: (userId: string) => void;
}) {
  const [messages, setMessages] = useState<DirectMessageDto[]>([]);
  const [input, setInput] = useState("");
  const [imageDraft, setImageDraft] = useState<DmPendingImageDraft | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [sharedPostDetail, setSharedPostDetail] = useState<FieldNote | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [canMessage, setCanMessage] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [incomingPending, setIncomingPending] = useState(false);
  const [outgoingPending, setOutgoingPending] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [blockedByOther, setBlockedByOther] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionNotice, setConnectionNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendingConnectionRequest, setSendingConnectionRequest] = useState(false);
  const [otherProfile, setOtherProfile] = useState<Character | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [revealedTimestampId, setRevealedTimestampId] = useState<string | null>(null);
  const [actionMessageId, setActionMessageId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const lastMessageCountRef = useRef(0);

  useRegisterImmersiveScreen();
  useDmKeyboardInsets(threadRef);

  const displayAvatar = otherProfile?.avatar ?? otherUser.avatar;
  const displayLevel = otherProfile?.level ?? 1;

  // Show a timestamp divider only when there's a meaningful gap between messages.
  const TIME_GAP_MS = 10 * 60 * 1000;
  // Break a visual sender "group" on sender change or after a quiet stretch.
  const GROUP_GAP_MS = 5 * 60 * 1000;

  const orderedMessages = useMemo(
    () => [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [messages],
  );

  const lastOutgoingId = useMemo(() => {
    for (let i = orderedMessages.length - 1; i >= 0; i -= 1) {
      const m = orderedMessages[i];
      if (m.senderId !== otherUser.userId && !m.pending && !m.failed) return m.id;
    }
    return null;
  }, [orderedMessages, otherUser.userId]);

  const renderRows = useMemo(() => {
    return orderedMessages.map((m, index) => {
      const prev = index > 0 ? orderedMessages[index - 1] : null;
      const isMe = m.senderId !== otherUser.userId;
      const prevIsMe = prev ? prev.senderId !== otherUser.userId : null;
      const gapFromPrev = prev ? new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() : Infinity;
      const isGroupStart = !prev || prevIsMe !== isMe || gapFromPrev > GROUP_GAP_MS;
      const showTimeDivider = gapFromPrev > TIME_GAP_MS;
      return { m, isMe, isGroupStart, showTimeDivider };
    });
  }, [orderedMessages, otherUser.userId, GROUP_GAP_MS, TIME_GAP_MS]);

  const activeActionMessage = useMemo(
    () => orderedMessages.find((m) => m.id === actionMessageId) ?? null,
    [orderedMessages, actionMessageId],
  );

  async function applyRelationshipSnapshot(otherUserId: string) {
    const relationship = await fetchRelationship(otherUserId);
    setCanMessage(relationship.canMessage);
    setIsConnected(relationship.isFollowing || relationship.canMessage);
    setIncomingPending(relationship.incomingPending);
    setOutgoingPending(relationship.outgoingPending);
    setBlockedByMe(relationship.blockedByMe);
    setBlockedByOther(relationship.blockedByOther);
    setRequestId(relationship.requestId);
    return relationship;
  }

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        const profile = await fetchFriendCharacter(otherUser.userId);
        if (!cancelled) setOtherProfile(profile);
      } catch {
        if (!cancelled) setOtherProfile(null);
      }
    }

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [otherUser.userId]);

  useEffect(() => {
    if (!headerMenuOpen) return undefined;
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setHeaderMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [headerMenuOpen]);

  useEffect(() => {
    let cancelled = false;

    async function loadThread(options?: { silent?: boolean }) {
      if (!options?.silent) {
        setLoading(true);
      }
      setError(null);
      let activeConversationId: string | null = null;
      try {
        const relationship = await applyRelationshipSnapshot(otherUser.userId);

        if (cancelled) return;

        if (!relationship.canMessage) {
          setMessages([]);
          setConversationId(null);
          return;
        }

        const conversationPayload = await postAuthed<{ conversation: { id: string } }, { otherUserId: string }>(
          "/api/social/conversations/direct",
          { otherUserId: otherUser.userId },
        );
        if (cancelled) return;
        activeConversationId = conversationPayload.conversation.id;
        setConversationId(activeConversationId);

        if (!options?.silent) {
          emitConversationReadOptimistic({
            conversationId: activeConversationId,
            otherUserId: otherUser.userId,
          });
        }

        const messagesPayload = await fetchAuthed<{
          messages: DirectMessageDto[];
          readSync: ConversationReadSync;
        }>(`/api/social/conversations/${activeConversationId}/messages?limit=100`);
        if (cancelled) return;
        setMessages(messagesPayload.messages);

        if (messagesPayload.readSync) {
          const hasNewReads =
            messagesPayload.readSync.notificationsMarkedRead > 0 ||
            messagesPayload.readSync.messagesMarkedRead > 0;
          if (!options?.silent || hasNewReads) {
            emitConversationReadConfirmed({
              conversationId: activeConversationId,
              otherUserId: otherUser.userId,
              readSync: messagesPayload.readSync,
            });
          }
        }
        emitSocialSync({ source: "inbox" });
      } catch (loadError) {
        if (cancelled) return;
        const message = loadError instanceof Error ? loadError.message : "Could not load this conversation.";
        setError(message);
        if (activeConversationId && !options?.silent) {
          emitConversationReadRollback({
            conversationId: activeConversationId,
            otherUserId: otherUser.userId,
            error: message,
          });
        }
      } finally {
        if (!cancelled && !options?.silent) setLoading(false);
      }
    }

    void loadThread();
    const unsubscribe = subscribeSocialSync(() => void loadThread({ silent: true }));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [otherUser.userId]);

  // Poll while the thread is open so incoming messages are fetched (and marked read) without
  // incrementing the inbox badge while the user is actively viewing the conversation.
  useEffect(() => {
    if (!conversationId || !canMessage) return undefined;
    const activeConversationId = conversationId;
    let cancelled = false;

    async function pollMessages() {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        const payload = await fetchAuthed<{
          messages: DirectMessageDto[];
          readSync: ConversationReadSync;
        }>(`/api/social/conversations/${activeConversationId}/messages?limit=100`);
        if (cancelled) return;
        setMessages(payload.messages);
        if (payload.readSync && (payload.readSync.notificationsMarkedRead > 0 || payload.readSync.messagesMarkedRead > 0)) {
          emitConversationReadConfirmed({
            conversationId: activeConversationId,
            otherUserId: otherUser.userId,
            readSync: payload.readSync,
          });
          emitSocialSync({ source: "inbox" });
        }
      } catch {
        // Silent background poll — ignore transient errors.
      }
    }

    const intervalId = window.setInterval(() => void pollMessages(), 8000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [conversationId, canMessage, otherUser.userId]);

  const handleListScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 120;
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const grew = messages.length > lastMessageCountRef.current;
    const isInitialLoad = lastMessageCountRef.current === 0;
    lastMessageCountRef.current = messages.length;
    // Auto-scroll on first load, or for new messages only when the user is already near the bottom.
    if (isInitialLoad || (grew && stickToBottomRef.current)) {
      el.scrollTo({ top: el.scrollHeight, behavior: isInitialLoad ? "auto" : "smooth" });
    }
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!canMessage || !conversationId || sending || !trimmed || imageDraft) return;

    setSending(true);
    stickToBottomRef.current = true;
    try {
      const message = await sendRichDirectMessage({
        conversationId,
        type: "text",
        content: trimmed,
      });
      setMessages((prev) => [...prev, message]);
      setInput("");
      setError(null);
      onMessageSent?.();
      emitSocialSync({ source: "inbox" });
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Could not send message.";
      setError(message);
    } finally {
      setSending(false);
    }
  }

  const handleImageSend = useCallback(
    async ({ draft, caption }: { draft: DmPendingImageDraft; caption: string }) => {
      if (!canMessage || !conversationId || sending) return;

      setMessages((prev) => prev.filter((m) => !m.failed));
      setSending(true);
      stickToBottomRef.current = true;
      setUploadProgress(12);

      const optimisticId = `pending-${Date.now()}`;
      const displayContent = caption || "📷 Photo";

      setMessages((prev) => [
        ...prev,
        {
          id: optimisticId,
          conversationId,
          senderId: currentUser.id,
          recipientId: otherUser.userId,
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
          isFavorited: false,
          pending: true,
          uploadProgress: 12,
        },
      ]);

      const progressTimer = window.setInterval(() => {
        setUploadProgress((prev) => {
          const next = prev >= 88 ? prev : prev + 6;
          setMessages((messages) =>
            messages.map((m) => (m.id === optimisticId ? { ...m, uploadProgress: next } : m)),
          );
          return next;
        });
      }, 220);

      try {
        setUploadProgress(35);
        setMessages((prev) =>
          prev.map((m) => (m.id === optimisticId ? { ...m, uploadProgress: 35 } : m)),
        );

        const imageUrl = await uploadDmImage({ conversationId, imageDataUrl: draft.dataUrl });

        setUploadProgress(82);
        setMessages((prev) =>
          prev.map((m) => (m.id === optimisticId ? { ...m, uploadProgress: 82 } : m)),
        );

        const message = await sendRichDirectMessage({
          conversationId,
          type: "image",
          imageUrl,
          content: caption || undefined,
        });

        setUploadProgress(100);
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId).concat(message));
        setImageDraft(null);
        setInput("");
        setError(null);
        onMessageSent?.();
        emitSocialSync({ source: "inbox" });
      } catch (sendError) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === optimisticId
              ? {
                  ...m,
                  pending: false,
                  failed: true,
                  uploadProgress: 0,
                  failedRetry: { kind: "image", draft, caption },
                }
              : m,
          ),
        );
        const message = sendError instanceof Error ? sendError.message : "Could not send photo.";
        setError(message);
      } finally {
        window.clearInterval(progressTimer);
        setSending(false);
        setUploadProgress(0);
      }
    },
    [canMessage, conversationId, sending, currentUser.id, otherUser.userId, onMessageSent],
  );

  const handleAudioSend = useCallback(
    async (recording: DmVoiceRecordingResult) => {
      if (!canMessage || !conversationId || sending) return;

      setMessages((prev) => prev.filter((m) => !m.failed));
      setSending(true);
      stickToBottomRef.current = true;
      setUploadProgress(12);

      const optimisticId = `pending-audio-${Date.now()}`;
      const durationSeconds = Math.max(1, Math.round(recording.durationMs / 1000));
      const displayContent = "🎤 Voice message";
      const failedRetry: DmFailedRetryPayload = {
        kind: "audio",
        blob: recording.blob,
        mimeType: recording.mimeType,
        durationMs: recording.durationMs,
        previewUrl: recording.previewUrl,
      };

      setMessages((prev) => [
        ...prev,
        {
          id: optimisticId,
          conversationId,
          senderId: currentUser.id,
          recipientId: otherUser.userId,
          type: "audio",
          content: displayContent,
          imageUrl: recording.previewUrl,
          sharedPostId: null,
          sharedPostType: null,
          metadata: {
            mimeType: recording.mimeType,
            durationSeconds,
            mediaUrl: recording.previewUrl,
          },
          sharedPostPreview: null,
          previewText: displayContent,
          createdAt: new Date().toISOString(),
          readAt: null,
          isFavorited: false,
          pending: true,
          uploadProgress: 12,
        },
      ]);

      const progressTimer = window.setInterval(() => {
        setUploadProgress((prev) => {
          const next = prev >= 88 ? prev : prev + 6;
          setMessages((messages) =>
            messages.map((m) => (m.id === optimisticId ? { ...m, uploadProgress: next } : m)),
          );
          return next;
        });
      }, 220);

      try {
        const audioDataUrl = await readBlobAsDataUrl(recording.blob);
        setUploadProgress(35);
        setMessages((prev) =>
          prev.map((m) => (m.id === optimisticId ? { ...m, uploadProgress: 35 } : m)),
        );

        const audioUrl = await uploadDmAudio({ conversationId, audioDataUrl });

        setUploadProgress(82);
        setMessages((prev) =>
          prev.map((m) => (m.id === optimisticId ? { ...m, uploadProgress: 82 } : m)),
        );

        const message = await sendRichDirectMessage({
          conversationId,
          type: "audio",
          imageUrl: audioUrl,
          content: displayContent,
          metadata: {
            mimeType: recording.mimeType,
            durationSeconds,
            mediaUrl: audioUrl,
          },
        });

        setUploadProgress(100);
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId).concat(message));
        setError(null);
        onMessageSent?.();
        emitSocialSync({ source: "inbox" });
      } catch (sendError) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === optimisticId
              ? {
                  ...m,
                  pending: false,
                  failed: true,
                  uploadProgress: 0,
                  failedRetry,
                }
              : m,
          ),
        );
        const message = sendError instanceof Error ? sendError.message : "Could not send voice message.";
        setError(message);
      } finally {
        window.clearInterval(progressTimer);
        setSending(false);
        setUploadProgress(0);
      }
    },
    [canMessage, conversationId, sending, currentUser.id, otherUser.userId, onMessageSent],
  );

  const handleRetryFailed = useCallback(
    (message: DirectMessageDto) => {
      if (!message.failed || !message.failedRetry || sending) return;
      setMessages((prev) => prev.filter((m) => m.id !== message.id));
      const retry = message.failedRetry;
      if (retry.kind === "image") {
        void handleImageSend({ draft: retry.draft, caption: retry.caption });
        return;
      }
      void handleAudioSend({
        blob: retry.blob,
        mimeType: retry.mimeType,
        durationMs: retry.durationMs,
        previewUrl: retry.previewUrl,
      });
    },
    [handleAudioSend, handleImageSend, sending],
  );

  async function openSharedPost(preview: NonNullable<DirectMessageDto["sharedPostPreview"]>) {
    if (preview.unavailable || preview.locked) return;
    try {
      const note = await fetchQuadPostById(preview.postId, currentUser.id);
      if (!note) {
        setError("Post unavailable.");
        return;
      }
      setSharedPostDetail(note);
    } catch {
      setError("Post unavailable.");
    }
  }

  async function handleSendConnectionRequest() {
    if (isConnected || outgoingPending) return;
    setSendingConnectionRequest(true);
    setError(null);
    setConnectionNotice(null);
    try {
      const relationship = await refreshRelationship(otherUser.userId);
      const actionState = relationshipToConnectionActionState(relationship);
      if (actionState === "connected" || actionState === "outgoing") {
        await applyRelationshipSnapshot(otherUser.userId);
        setConnectionNotice(actionState === "connected" ? "You're already connected." : "Request already sent.");
        return;
      }

      const outcome = await requestConnection({
        username: otherUser.username,
        relationship,
      });
      await applyRelationshipSnapshot(otherUser.userId);
      setConnectionNotice(outcome.toastMessage);
      emitSocialSync({ source: "inbox" });
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Could not send connection request.";
      setError(message.replace(/^Backend request failed:[^.]*\.\s*/i, ""));
    } finally {
      setSendingConnectionRequest(false);
    }
  }

  async function handleAcceptRequest() {
    if (!requestId) return;
    try {
      await acceptIncomingConnectionRequest(requestId);
      await applyRelationshipSnapshot(otherUser.userId);
      setIncomingPending(false);
      setOutgoingPending(false);
      setIsConnected(true);
      setCanMessage(true);
      setError(null);
      setConnectionNotice("You are now connected.");
      emitSocialSync({ source: "inbox" });
    } catch (acceptError) {
      const message = acceptError instanceof Error ? acceptError.message : "Could not accept request.";
      setError(message.replace(/^Backend request failed:[^.]*\.\s*/i, ""));
    }
  }

  async function handleDeclineRequest() {
    if (!requestId) return;
    try {
      await declineIncomingConnectionRequest(requestId);
      await applyRelationshipSnapshot(otherUser.userId);
      setConnectionNotice("Request declined");
      emitSocialSync({ source: "inbox" });
    } catch (declineError) {
      const message = declineError instanceof Error ? declineError.message : "Could not decline request.";
      setError(message.replace(/^Backend request failed:[^.]*\.\s*/i, ""));
    }
  }

  async function handleBlockUser() {
    try {
      await postAuthed("/api/social/blocks", { userId: otherUser.userId });
      setBlockedByMe(true);
      setCanMessage(false);
      setConversationId(null);
      setMessages([]);
      setError(null);
    } catch (blockError) {
      const message = blockError instanceof Error ? blockError.message : "Could not block user.";
      setError(message);
    }
  }

  async function handleHideConversation() {
    if (!conversationId) return;
    try {
      await postAuthed(`/api/social/conversations/${conversationId}/hide`, {});
      onClose();
    } catch (hideError) {
      const message = hideError instanceof Error ? hideError.message : "Could not hide conversation.";
      setError(message);
    }
  }

  async function handleReportMessage(messageId: string) {
    try {
      await postAuthed(`/api/social/messages/${messageId}/report`, {
        reason: "harassment",
        details: "Reported from direct message thread.",
      });
      setError(null);
    } catch (reportError) {
      const message = reportError instanceof Error ? reportError.message : "Could not report message.";
      setError(message);
    }
  }

  function toggleMessageFavorite(messageId: string, nextFavorited: boolean) {
    // Optimistic update so the sparkle indicator responds immediately.
    setMessages((prev) => prev.map((x) => (x.id === messageId ? { ...x, isFavorited: nextFavorited } : x)));
    void (async () => {
      try {
        await postAuthed(`/api/social/messages/${messageId}/favorite`, { favorited: nextFavorited });
        setError(null);
      } catch (favoriteErr) {
        setMessages((prev) => prev.map((x) => (x.id === messageId ? { ...x, isFavorited: !nextFavorited } : x)));
        setError(favoriteErr instanceof Error ? favoriteErr.message : "Could not update favorite.");
      }
    })();
  }

  async function copyMessageText(text: string) {
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      /* Clipboard access can be blocked; fail silently. */
    }
  }

  function handleMessageAction(action: DmMessageAction) {
    const message = messages.find((m) => m.id === actionMessageId);
    setActionMessageId(null);
    if (!message) return;
    switch (action) {
      case "copy":
        void copyMessageText(message.content?.trim() ? message.content : "");
        break;
      case "favorite":
        toggleMessageFavorite(message.id, true);
        break;
      case "unfavorite":
        toggleMessageFavorite(message.id, false);
        break;
      case "report":
        void handleReportMessage(message.id);
        break;
      default:
        break;
    }
  }

  const content = (
    <div
      ref={threadRef}
      className="fixed inset-0 z-[200] h-[100dvh] max-h-[100dvh] cq-dm-thread cq-dm-thread--enter"
    >
    <MobileSwipeBackSurface
      onBack={onClose}
      className="cq-dm-thread flex h-full max-h-full flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={`Direct message with ${otherUser.name}`}
    >
      <header className="cq-dm-header shrink-0 border-b border-white/[0.08] pt-[max(0.25rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <button type="button" onClick={onClose} className="cq-dm-header-btn shrink-0" aria-label="Back">
            <ArrowLeft className="h-6 w-6" strokeWidth={1.75} />
          </button>

          <button
            type="button"
            onClick={() => onViewProfile?.(otherUser.userId)}
            disabled={!onViewProfile}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl text-left disabled:cursor-default"
          >
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[#262626]">
              <AvatarDisplay avatar={displayAvatar} fitParent size={40} />
            </div>
            <div className="min-w-0 flex-1 pr-1">
              <p className="truncate text-[16px] font-bold leading-tight text-white">{otherUser.name}</p>
              <p className="truncate text-xs text-white/60">
                @{otherUser.username} · Level {displayLevel}
              </p>
            </div>
          </button>

          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              onClick={() => setHeaderMenuOpen((open) => !open)}
              className="cq-dm-header-btn"
              aria-label="Conversation options"
              aria-expanded={headerMenuOpen}
            >
              <MoreHorizontal className="h-[22px] w-[22px]" strokeWidth={1.75} />
            </button>
            {headerMenuOpen ? (
              <div className="cq-dm-header-menu absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#121212] py-1 shadow-xl">
                {onViewProfile ? (
                  <button
                    type="button"
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      onViewProfile(otherUser.userId);
                    }}
                    className="cq-dm-header-menu-item flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-white"
                  >
                    <UserRound className="h-4 w-4 shrink-0 text-white/70" strokeWidth={1.9} />
                    View profile
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setHeaderMenuOpen(false);
                    void handleHideConversation();
                  }}
                  disabled={!conversationId}
                  className="cq-dm-header-menu-item flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-white disabled:opacity-40"
                >
                  <EyeOff className="h-4 w-4 shrink-0 text-white/70" strokeWidth={1.9} />
                  Hide conversation
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHeaderMenuOpen(false);
                    void handleBlockUser();
                  }}
                  className="cq-dm-header-menu-item flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-rose-300"
                >
                  <Ban className="h-4 w-4 shrink-0" strokeWidth={1.9} />
                  Block user
                </button>
                <div className="border-t border-white/[0.08] px-4 py-2.5">
                  <p className="text-[10px] leading-relaxed text-white/35">{SAFETY_NOTICE}</p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div
        ref={listRef}
        onScroll={handleListScroll}
        className="cq-dm-messages flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 py-3"
      >
        {loading && <p className="py-10 text-center text-sm text-white/40">Loading conversation…</p>}
        {!loading && error ? (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90">{error}</p>
        ) : null}
        {!loading && connectionNotice && !error ? (
          <p className="rounded-lg bg-white/[0.06] px-3 py-2 text-xs text-white/60">{connectionNotice}</p>
        ) : null}
        {!loading && !canMessage && !blockedByMe && !blockedByOther ? (
          <div className="rounded-xl bg-[#121212] p-4 text-sm text-white/75">
            <p className="mb-3">Messaging is available only after both students are connected on CampusQuest.</p>
            {isConnected ? (
              <span className="inline-flex rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-200">
                Friends
              </span>
            ) : incomingPending ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleAcceptRequest()}
                  className="min-h-[44px] rounded-lg bg-[#0095f6] px-3 py-2 text-sm font-semibold text-white"
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeclineRequest()}
                  className="min-h-[44px] rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-white/80"
                >
                  Deny
                </button>
              </div>
            ) : outgoingPending ? (
              <span className="inline-flex rounded-lg bg-white/[0.06] px-3 py-2 text-xs font-medium text-white/55">
                Request Sent
              </span>
            ) : (
              <button
                type="button"
                disabled={sendingConnectionRequest}
                onClick={() => void handleSendConnectionRequest()}
                className="min-h-[44px] rounded-lg bg-[#0095f6] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {sendingConnectionRequest ? "Sending…" : "Add Friend"}
              </button>
            )}
          </div>
        ) : null}
        {!loading && (blockedByMe || blockedByOther) ? (
          <p className="rounded-lg bg-rose-500/10 px-3 py-3 text-sm text-rose-200/90">
            {blockedByMe ? "You blocked this user. Unblock them in Settings → Blocked users to message again." : "You cannot message this user."}
          </p>
        ) : null}
        {canMessage && messages.length === 0 && !loading ? (
          <p className="py-10 text-center text-sm text-white/40">No messages yet. Say hi!</p>
        ) : null}
        {renderRows.map(({ m, isMe, isGroupStart, showTimeDivider }) => (
          <div key={m.id}>
            {showTimeDivider ? (
              <p className="cq-dm-time-divider my-3 text-center text-[10px] font-medium uppercase tracking-[0.12em] text-white/35">
                {formatTimeDivider(m.createdAt)}
              </p>
            ) : null}
            <DmMessageBubbleRow
              m={m}
              isMe={isMe}
              isGroupStart={isGroupStart && !showTimeDivider}
              isLatestOutgoing={m.id === lastOutgoingId}
              isRevealed={revealedTimestampId === m.id}
              onReveal={(id) => setRevealedTimestampId((prev) => (prev === id ? null : id))}
              onOpenActions={(id) => setActionMessageId(id)}
              onOpenSharedPost={(preview) => void openSharedPost(preview)}
              onRetryFailed={handleRetryFailed}
            />
          </div>
        ))}
      </div>

      {canMessage && !blockedByMe && !blockedByOther ? (
        <DmThreadComposer
          input={input}
          onInputChange={setInput}
          onSubmit={handleSend}
          disabled={!canMessage}
          sending={sending}
          imageDraft={imageDraft}
          onImageDraftChange={setImageDraft}
          onImageSend={(args) => void handleImageSend(args)}
          onAudioSend={(result) => void handleAudioSend(result)}
          onMediaError={setError}
          uploadProgress={uploadProgress}
        />
      ) : (
        <p className="shrink-0 px-4 py-3 text-center text-sm text-white/40">
          Connect first to message through CampusQuest.
        </p>
      )}
    </MobileSwipeBackSurface>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      {content}
      <DmMessageActionSheet
        open={Boolean(activeActionMessage)}
        isMine={activeActionMessage ? activeActionMessage.senderId !== otherUser.userId : false}
        isFavorited={Boolean(activeActionMessage?.isFavorited)}
        canCopy={Boolean(activeActionMessage?.content?.trim())}
        onAction={handleMessageAction}
        onClose={() => setActionMessageId(null)}
      />
      {sharedPostDetail ? (
        <ProfilePostDetail
          note={sharedPostDetail}
          currentUserId={currentUser.id}
          currentUser={{
            id: currentUser.id,
            name: currentUser.name,
            username: currentUser.username,
            avatar: currentUser.avatar,
          }}
          onClose={() => setSharedPostDetail(null)}
          onNod={() => undefined}
          onHype={() => undefined}
          onVerify={() => undefined}
          onAssist={() => undefined}
        />
      ) : null}
    </>,
    document.body,
  );
}
