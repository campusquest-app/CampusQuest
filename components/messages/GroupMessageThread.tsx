"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft } from "lucide-react";
import type { Character } from "@/lib/types";
import { fetchAuthed } from "@/lib/client/dashboardApi";
import { sendRichDirectMessage, type DirectMessageDto } from "@/lib/client/dmMessagesClient";
import { fetchGroupConversation, type GroupConversationDetails } from "@/lib/client/groupChatClient";
import { emitSocialSync, subscribeSocialSync } from "@/lib/client/socialSync";
import { DmThreadComposer } from "@/components/messages/DmThreadComposer";
import { GroupAvatarStack } from "@/components/messages/GroupAvatarStack";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import { MobileSwipeBackSurface } from "@/components/mobile/MobileSwipeBackSurface";

export function GroupMessageThread({
  currentUser,
  conversationId,
  onClose,
  onMessageSent,
}: {
  currentUser: Character;
  conversationId: string;
  onClose: () => void;
  onMessageSent?: () => void;
}) {
  const [group, setGroup] = useState<GroupConversationDetails | null>(null);
  const [messages, setMessages] = useState<DirectMessageDto[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const loadThread = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [groupDetails, messagesPayload] = await Promise.all([
        fetchGroupConversation(conversationId),
        fetchAuthed<{ messages: DirectMessageDto[] }>(
          `/api/social/conversations/${conversationId}/messages?limit=100`,
        ),
      ]);
      setGroup(groupDetails);
      setMessages(messagesPayload.messages);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Could not load group chat.";
      setError(message.replace(/^Backend request failed:[^.]*\.\s*/i, ""));
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    void loadThread();
    const unsubscribe = subscribeSocialSync(() => void loadThread());
    return unsubscribe;
  }, [loadThread]);

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight);
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || sending) return;

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

  const memberAvatars = (group?.members ?? [])
    .filter((m) => m.id !== currentUser.id)
    .map((m) => m.avatarUrl ?? "")
    .slice(0, 3);

  if (typeof document === "undefined") return null;

  return createPortal(
    <MobileSwipeBackSurface onBack={onClose} className="cq-dm-thread fixed inset-0 z-[135] flex h-[100dvh] flex-col bg-black">
      <header className="cq-dm-thread-header flex shrink-0 items-center gap-3 border-b border-white/[0.08] px-3 py-2.5 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} className="cq-inbox-icon-btn" aria-label="Back">
          <ArrowLeft className="h-6 w-6" strokeWidth={1.75} />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <GroupAvatarStack avatars={memberAvatars} size={40} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-white">{group?.displayName ?? "Group chat"}</p>
            <p className="truncate text-xs text-white/45">
              {group ? `${group.memberCount} members` : "Loading…"}
            </p>
          </div>
        </div>
      </header>

      {error ? (
        <p className="shrink-0 px-4 py-2 text-xs text-amber-300/90" role="alert">
          {error}
        </p>
      ) : null}

      <div ref={listRef} className="cq-dm-thread-messages flex-1 overflow-y-auto overscroll-y-contain px-3 py-3">
        {loading ? (
          <p className="py-12 text-center text-sm text-white/40">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="py-12 text-center text-sm text-white/40">Say hi to the group.</p>
        ) : (
          <ul className="space-y-2">
            {messages.map((message) => (
              <GroupMessageBubble key={message.id} message={message} currentUserId={currentUser.id} />
            ))}
          </ul>
        )}
      </div>

      <DmThreadComposer
        input={input}
        onInputChange={setInput}
        onSubmit={handleSend}
        disabled={loading}
        sending={sending}
        imageDraft={null}
        onImageDraftChange={() => {}}
        onImageSend={() => {}}
        onImageSendError={setError}
        uploadProgress={0}
      />
    </MobileSwipeBackSurface>,
    document.body,
  );
}

function GroupMessageBubble({
  message,
  currentUserId,
}: {
  message: DirectMessageDto;
  currentUserId: string;
}) {
  const isMe = message.senderId === currentUserId;
  const senderName = message.sender?.displayName ?? "Member";
  const senderAvatar = message.sender?.avatarUrl ?? "";

  return (
    <li className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
      <div className={`flex max-w-[82%] gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
        {!isMe ? (
          <div className="mt-1 h-7 w-7 shrink-0 overflow-hidden rounded-full bg-[#262626]">
            <AvatarDisplay avatar={senderAvatar} fitParent size={28} />
          </div>
        ) : null}
        <div className="min-w-0">
          {!isMe ? (
            <p className="mb-0.5 px-1 text-[11px] font-semibold text-white/55">{senderName}</p>
          ) : null}
          <div className={`cq-dm-bubble ${isMe ? "cq-dm-bubble--sent" : "cq-dm-bubble--received"}`}>
            <p className="whitespace-pre-wrap break-words text-[15px] leading-snug">{message.content}</p>
          </div>
        </div>
      </div>
    </li>
  );
}
