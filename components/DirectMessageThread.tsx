"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
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
  sendRichDirectMessage,
  uploadDmImage,
  type DirectMessageDto,
} from "@/lib/client/dmMessagesClient";
import type { DmPendingImageDraft } from "@/lib/client/dmMediaComposer";
import { DmThreadComposer } from "@/components/messages/DmThreadComposer";
import { fetchQuadPostById } from "@/lib/client/quadPostsClient";
import { getCommentsByNoteId } from "@/lib/feedStore";
import { DmImageMessage } from "@/components/messages/DmImageMessage";
import { DmSharedPostCard } from "@/components/messages/DmSharedPostCard";
import { ProfilePostDetail } from "@/components/profile/ProfilePostDetail";
import { AvatarDisplay } from "./AvatarDisplay";
import { MobileSwipeBackSurface } from "@/components/mobile/MobileSwipeBackSurface";

export function DirectMessageThread({
  currentUser,
  otherUser,
  onClose,
  onMessageSent,
}: {
  currentUser: Character;
  otherUser: Pick<Friend, "userId" | "username" | "name" | "avatar">;
  onClose: () => void;
  onMessageSent?: () => void;
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
  const [favBusy, setFavBusy] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const pinnedMessages = useMemo(() => {
    const fav = messages.filter((m) => m.isFavorited);
    return [...fav].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [messages]);

  const threadMessages = useMemo(() => messages.filter((m) => !m.isFavorited), [messages]);

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

    async function loadThread() {
      setLoading(true);
      setError(null);
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
        const nextConversationId = conversationPayload.conversation.id;
        setConversationId(nextConversationId);

        const messagesPayload = await fetchAuthed<{ messages: DirectMessageDto[] }>(
          `/api/social/conversations/${nextConversationId}/messages?limit=100`,
        );
        if (cancelled) return;
        setMessages(messagesPayload.messages);
      } catch (loadError) {
        if (cancelled) return;
        const message = loadError instanceof Error ? loadError.message : "Could not load this conversation.";
        setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadThread();
    const unsubscribe = subscribeSocialSync(() => void loadThread());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [otherUser.userId]);

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight);
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!canMessage || !conversationId || sending || !trimmed || imageDraft) return;

    setSending(true);
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
            m.id === optimisticId ? { ...m, pending: false, failed: true, uploadProgress: 0 } : m,
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
    setFavBusy(messageId);
    void (async () => {
      try {
        await postAuthed(`/api/social/messages/${messageId}/favorite`, { favorited: nextFavorited });
        setMessages((prev) => prev.map((x) => (x.id === messageId ? { ...x, isFavorited: nextFavorited } : x)));
        setError(null);
      } catch (favoriteErr) {
        setError(favoriteErr instanceof Error ? favoriteErr.message : "Could not update favorite.");
      } finally {
        setFavBusy(null);
      }
    })();
  }

  function MessageBubbleRow({ m }: { m: DirectMessageDto }) {
    const isMe = m.senderId !== otherUser.userId;
    const favorited = Boolean(m.isFavorited);
    const busy = favBusy === m.id;
    const showCaption =
      m.type === "text" ||
      (m.type === "image" && m.content.trim() && m.content.trim() !== "📷 Photo") ||
      (m.type === "shared_post" && m.content.trim() && m.content.trim() !== "Shared a post");

    return (
      <div className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
        <div
          className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
            favorited ? "ring-1 ring-uri-gold/55 ring-offset-1 ring-offset-uri-navy/40 " : ""
          } ${
            isMe
              ? "bg-uri-keaney text-uri-navy rounded-br-md"
              : "bg-white/15 text-white border border-white/10 rounded-bl-md"
          } ${m.pending ? "opacity-70" : ""} ${m.failed ? "ring-1 ring-rose-400/40" : ""}`}
        >
          {m.type === "image" && m.imageUrl ? (
            <div className="mb-2">
              <DmImageMessage
                imageUrl={m.imageUrl}
                pending={m.pending}
                uploadProgress={m.uploadProgress}
              />
            </div>
          ) : null}
          {m.type === "shared_post" && m.sharedPostPreview ? (
            <div className={`mb-2 ${isMe ? "[&_.cq-dm-shared-post]:border-uri-navy/20" : ""}`}>
              <DmSharedPostCard
                preview={m.sharedPostPreview}
                onOpen={() => void openSharedPost(m.sharedPostPreview!)}
              />
            </div>
          ) : null}
          {showCaption ? (
            <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
          ) : null}
          <p className={`text-[10px] mt-1 ${isMe ? "text-uri-navy/70" : "text-white/50"}`}>
            {m.pending ? "Sending…" : m.failed ? "Failed to send" : new Date(m.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            {isMe && m.readAt ? " · Read" : ""}
          </p>
          {!m.pending && !m.failed ? (
            <div className="flex flex-wrap gap-2 mt-1.5 items-center">
              <button
                type="button"
                disabled={busy}
                onClick={() => toggleMessageFavorite(m.id, !favorited)}
                className={`text-[10px] font-semibold rounded-md px-1.5 py-0.5 border transition-colors disabled:opacity-50 ${
                  favorited
                    ? isMe
                      ? "border-uri-navy/40 text-uri-navy bg-uri-navy/10"
                      : "border-uri-gold/45 text-uri-gold bg-uri-gold/15"
                    : isMe
                      ? "border-uri-navy/30 text-uri-navy/80 hover:bg-uri-navy/10"
                      : "border-white/25 text-white/75 hover:bg-white/10"
                }`}
                aria-pressed={favorited}
                title={favorited ? "Unfavorite" : "Favorite"}
              >
                {favorited ? "Unfavorite" : "Favorite"}
              </button>
              {!isMe && (
                <button
                  type="button"
                  onClick={() => void handleReportMessage(m.id)}
                  className="text-[10px] underline text-rose-300/95 hover:text-rose-100"
                >
                  Report safety issue
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const content = (
    <MobileSwipeBackSurface
      onBack={onClose}
      className="fixed inset-0 z-[100] flex flex-col bg-uri-navy"
      role="dialog"
      aria-modal="true"
      aria-label={`Direct message with ${otherUser.name}`}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative z-10 flex flex-col flex-1 min-h-0 max-h-[100vh] w-full max-w-lg mx-auto rounded-t-2xl border border-b-0 border-uri-keaney/20 bg-uri-navy shadow-xl">
        {/* Header */}
        <div className="flex items-center gap-3 p-3 border-b border-white/10 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="p-2 -ml-1 rounded-xl text-white/70 hover:text-white hover:bg-white/10"
            aria-label="Close"
          >
            ←
          </button>
          <div className="cq-avatar-slot w-10 h-10 bg-white/10 border border-uri-keaney/30">
            <AvatarDisplay avatar={otherUser.avatar} fitParent size={40} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-white truncate">{otherUser.name}</p>
            <p className="text-xs text-uri-keaney/90 truncate">@{otherUser.username}</p>
          </div>
          <button
            type="button"
            onClick={() => void handleBlockUser()}
            className="text-[11px] px-2.5 py-1.5 rounded-lg border border-rose-300/30 text-rose-200 hover:bg-rose-500/10"
          >
            Block
          </button>
          <button
            type="button"
            onClick={() => void handleHideConversation()}
            disabled={!conversationId}
            className="text-[11px] px-2.5 py-1.5 rounded-lg border border-white/25 text-white/80 hover:bg-white/10 disabled:opacity-40"
          >
            Hide
          </button>
        </div>

        {/* Messages */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0"
        >
          {loading && <p className="text-sm text-white/60 text-center py-6">Loading conversation...</p>}
          {!loading && error && (
            <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-300/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          {!loading && connectionNotice && !error && (
            <p className="text-xs text-cyan-100/90 bg-cyan-500/10 border border-cyan-300/25 rounded-lg px-3 py-2">
              {connectionNotice}
            </p>
          )}
          {!loading && !canMessage && !blockedByMe && !blockedByOther && (
            <div className="rounded-xl border border-white/15 bg-white/[0.04] p-4 text-sm text-white/80">
              <p className="mb-3">Messaging is available only after both students are connected on CampusQuest.</p>
              {isConnected ? (
                <span className="inline-flex rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100">
                  Friends
                </span>
              ) : incomingPending ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleAcceptRequest()}
                    className="min-h-[44px] px-3 py-2 rounded-lg text-sm font-semibold bg-uri-keaney text-uri-navy hover:bg-uri-keaney/90"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeclineRequest()}
                    className="min-h-[44px] px-3 py-2 rounded-lg text-sm font-medium border border-white/20 text-white/80 hover:bg-white/10"
                  >
                    Deny
                  </button>
                </div>
              ) : outgoingPending ? (
                <span className="inline-flex rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2 text-xs font-medium text-white/55">
                  Request Sent
                </span>
              ) : (
                <button
                  type="button"
                  disabled={sendingConnectionRequest}
                  onClick={() => void handleSendConnectionRequest()}
                  className="min-h-[44px] px-3 py-2 rounded-lg text-sm font-semibold bg-uri-keaney text-uri-navy hover:bg-uri-keaney/90 disabled:opacity-60"
                >
                  {sendingConnectionRequest ? "Sending..." : "Add Friend"}
                </button>
              )}
            </div>
          )}
          {!loading && (blockedByMe || blockedByOther) && (
            <p className="text-sm text-rose-200 bg-rose-500/10 border border-rose-400/30 rounded-lg px-3 py-3">
              {blockedByMe ? "You blocked this user. Unblock from settings to message again." : "You cannot message this user."}
            </p>
          )}
          {canMessage &&
            messages.length === 0 &&
            !loading && (
              <p className="text-sm text-white/50 text-center py-6">No messages yet. Say hi!</p>
            )}
          {pinnedMessages.length > 0 && canMessage && !blockedByMe && !blockedByOther && (
            <div className="mb-4 pb-4 border-b border-uri-gold/25 space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-uri-gold/90">Pinned favorites</p>
              {pinnedMessages.map((m) => (
                <MessageBubbleRow key={`pin-${m.id}`} m={m} />
              ))}
            </div>
          )}
          {threadMessages.map((m) => (
            <MessageBubbleRow key={m.id} m={m} />
          ))}
        </div>

        {/* Input */}
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
            onImageSendError={setError}
            uploadProgress={uploadProgress}
          />
        ) : (
          <p className="p-3 text-center text-sm text-amber-400/90">
            Connect first to message through CampusQuest.
          </p>
        )}
      </div>
    </MobileSwipeBackSurface>
  );

  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      {content}
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
          comments={getCommentsByNoteId(sharedPostDetail.id)}
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
