"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
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
import { DmImageMessage } from "@/components/messages/DmImageMessage";
import { DmSharedPostCard } from "@/components/messages/DmSharedPostCard";
import { ProfilePostDetail } from "@/components/profile/ProfilePostDetail";
import { AvatarDisplay } from "./AvatarDisplay";
import { MobileSwipeBackSurface } from "@/components/mobile/MobileSwipeBackSurface";
import { fetchFriendCharacter } from "@/lib/client/friendProfileClient";

const SAFETY_NOTICE =
  "Keep conversations respectful. Harassment, threats, scams, or unsafe conduct may lead to removal from CampusQuest and referral to university conduct offices.";

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
  const [otherProfile, setOtherProfile] = useState<Character | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const displayAvatar = otherProfile?.avatar ?? otherUser.avatar;
  const displayLevel = otherProfile?.level ?? 1;

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
    const isSharedPost = m.type === "shared_post" && m.sharedPostPreview;
    const isImageOnly = m.type === "image" && m.imageUrl && !showCaption;

    const bubbleClass = isMe ? "cq-dm-bubble cq-dm-bubble--sent" : "cq-dm-bubble cq-dm-bubble--received";
    const timestampClass = isMe ? "text-white/55" : "text-white/40";

    return (
      <div className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
        <div
          className={`max-w-[78%] ${favorited ? "ring-1 ring-uri-gold/45 rounded-2xl" : ""} ${
            m.pending ? "opacity-70" : ""
          } ${m.failed ? "ring-1 ring-rose-400/40 rounded-2xl" : ""}`}
        >
          {isImageOnly ? (
            <div className="overflow-hidden rounded-2xl">
              <DmImageMessage
                imageUrl={m.imageUrl!}
                pending={m.pending}
                uploadProgress={m.uploadProgress}
              />
            </div>
          ) : isSharedPost ? (
            <div className={`${bubbleClass} p-1.5`}>
              <DmSharedPostCard
                preview={m.sharedPostPreview!}
                onOpen={() => void openSharedPost(m.sharedPostPreview!)}
              />
              {showCaption ? (
                <p className="mt-1.5 px-1 text-sm whitespace-pre-wrap break-words text-white">{m.content}</p>
              ) : null}
            </div>
          ) : (
            <div className={`${bubbleClass} px-3.5 py-2`}>
              {m.type === "image" && m.imageUrl ? (
                <div className="mb-2 -mx-1 overflow-hidden rounded-xl">
                  <DmImageMessage
                    imageUrl={m.imageUrl}
                    pending={m.pending}
                    uploadProgress={m.uploadProgress}
                  />
                </div>
              ) : null}
              {showCaption ? (
                <p className="text-[15px] leading-snug whitespace-pre-wrap break-words">{m.content}</p>
              ) : null}
            </div>
          )}

          <div className={`mt-1 flex flex-wrap items-center gap-2 px-1 ${isMe ? "justify-end" : "justify-start"}`}>
            <p className={`text-[10px] ${timestampClass}`}>
              {m.pending ? "Sending…" : m.failed ? "Failed to send" : new Date(m.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              {isMe && m.readAt ? " · Seen" : ""}
            </p>
            {!m.pending && !m.failed ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => toggleMessageFavorite(m.id, !favorited)}
                  className={`text-[10px] font-medium transition-colors disabled:opacity-50 ${
                    favorited ? "text-uri-gold" : "text-white/30 hover:text-white/55"
                  }`}
                  aria-pressed={favorited}
                  title={favorited ? "Unfavorite" : "Favorite"}
                >
                  {favorited ? "★" : "☆"}
                </button>
                {!isMe ? (
                  <button
                    type="button"
                    onClick={() => void handleReportMessage(m.id)}
                    className="text-[10px] text-white/30 hover:text-rose-300/80"
                  >
                    Report
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const content = (
    <MobileSwipeBackSurface
      onBack={onClose}
      className="cq-dm-thread fixed inset-0 z-[100] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={`Direct message with ${otherUser.name}`}
    >
      <header className="cq-dm-header shrink-0 border-b border-white/[0.08] pt-[max(0.25rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2 px-2 py-2">
          <button type="button" onClick={onClose} className="cq-dm-header-btn shrink-0" aria-label="Back">
            <ArrowLeft className="h-6 w-6" strokeWidth={1.75} />
          </button>

          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-[#262626]">
            <AvatarDisplay avatar={displayAvatar} fitParent size={36} />
          </div>

          <div className="min-w-0 flex-1 pr-1">
            <p className="truncate text-[15px] font-semibold leading-tight text-white">{otherUser.name}</p>
            <p className="truncate text-xs text-white/45">
              @{otherUser.username} · Level {displayLevel}
            </p>
          </div>

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
                <button
                  type="button"
                  onClick={() => {
                    setHeaderMenuOpen(false);
                    void handleHideConversation();
                  }}
                  disabled={!conversationId}
                  className="cq-dm-header-menu-item w-full px-4 py-2.5 text-left text-sm text-white disabled:opacity-40"
                >
                  Hide conversation
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHeaderMenuOpen(false);
                    void handleBlockUser();
                  }}
                  className="cq-dm-header-menu-item w-full px-4 py-2.5 text-left text-sm text-rose-300"
                >
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

      <div ref={listRef} className="cq-dm-messages flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 py-3 space-y-2">
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
            {blockedByMe ? "You blocked this user. Unblock from settings to message again." : "You cannot message this user."}
          </p>
        ) : null}
        {canMessage && messages.length === 0 && !loading ? (
          <p className="py-10 text-center text-sm text-white/40">No messages yet. Say hi!</p>
        ) : null}
        {pinnedMessages.length > 0 && canMessage && !blockedByMe && !blockedByOther ? (
          <div className="mb-3 space-y-2 border-b border-white/[0.08] pb-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-uri-gold/80">Pinned</p>
            {pinnedMessages.map((m) => (
              <MessageBubbleRow key={`pin-${m.id}`} m={m} />
            ))}
          </div>
        ) : null}
        {threadMessages.map((m) => (
          <MessageBubbleRow key={m.id} m={m} />
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
          onImageSendError={setError}
          uploadProgress={uploadProgress}
        />
      ) : (
        <p className="shrink-0 px-4 py-3 text-center text-sm text-white/40">
          Connect first to message through CampusQuest.
        </p>
      )}
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
