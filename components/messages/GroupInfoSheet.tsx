"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight, LogOut, Pencil, Plus, Trash2, UserPlus, X } from "lucide-react";
import type { InboxFriendRow } from "@/lib/inboxMessageSearch";
import {
  addMembersToGroup,
  leaveGroupConversation,
  removeMemberFromGroup,
  renameGroupConversation,
  type GroupConversationDetails,
} from "@/lib/client/groupChatClient";
import { avatarFromConnectionProfile } from "@/lib/client/socialConnectionsClient";
import { humanReadableShortName } from "@/lib/groupDisplayName";
import type { DirectMessageDto } from "@/lib/client/dmMessagesClient";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import { GroupAvatarStack } from "@/components/messages/GroupAvatarStack";
import { useRegisterImmersiveScreen } from "@/lib/client/nestedImmersiveScreen";

export function GroupInfoSheet({
  group,
  currentUserId,
  friends,
  messages,
  onClose,
  onUpdated,
  onLeft,
}: {
  group: GroupConversationDetails;
  currentUserId: string;
  friends: InboxFriendRow[];
  messages: DirectMessageDto[];
  onClose: () => void;
  onUpdated: (next: GroupConversationDetails) => void;
  onLeft: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(group.title ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedAdd, setSelectedAdd] = useState<string[]>([]);

  useRegisterImmersiveScreen();

  const isOwner = group.myRole === "owner";
  const memberIds = useMemo(() => new Set(group.members.map((m) => m.id)), [group.members]);

  const addableFriends = useMemo(
    () => friends.filter((f) => f.userId !== currentUserId && !memberIds.has(f.userId)),
    [friends, currentUserId, memberIds],
  );

  const sharedMedia = useMemo(
    () =>
      messages
        .filter((m) => m.type === "image" && m.imageUrl)
        .slice()
        .reverse()
        .slice(0, 24),
    [messages],
  );

  const avatarMembers = group.members
    .filter((m) => m.id !== currentUserId)
    .map((m) => ({ avatarUrl: m.avatarUrl, displayName: m.displayName }))
    .slice(0, 3);

  async function saveName() {
    const next = nameDraft.trim();
    if (!next || busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await renameGroupConversation(group.conversationId, next);
      onUpdated(updated);
      setEditingName(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename group.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLeave() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await leaveGroupConversation(group.conversationId);
      onLeft();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not leave group.");
      setBusy(false);
      setConfirmLeave(false);
    }
  }

  async function handleRemove(memberId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await removeMemberFromGroup(group.conversationId, memberId);
      onUpdated(updated);
      setRemoveTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove member.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddMembers() {
    if (selectedAdd.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await addMembersToGroup(group.conversationId, selectedAdd);
      onUpdated(updated);
      setSelectedAdd([]);
      setAddOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add members.");
    } finally {
      setBusy(false);
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="cq-group-info-root fixed inset-0 z-[220] flex flex-col bg-black/70" role="presentation">
      <button type="button" className="min-h-[12vh] shrink-0" aria-label="Dismiss" onClick={onClose} />
      <div
        className="cq-group-info-sheet flex min-h-0 flex-1 flex-col rounded-t-[1.35rem] border-t border-white/10 bg-[#0a0a0a]"
        role="dialog"
        aria-modal="true"
        aria-label="Group info"
      >
        <div className="flex shrink-0 justify-center pb-1 pt-3" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        <header className="flex shrink-0 items-center justify-between px-4 pb-2">
          <p className="text-[15px] font-semibold text-white">Group info</p>
          <button type="button" onClick={onClose} className="cq-dm-header-btn" aria-label="Close group info">
            <X className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="flex flex-col items-center gap-3 pb-5 pt-2">
            <GroupAvatarStack members={avatarMembers} size={84} />
            {editingName && isOwner ? (
              <div className="flex w-full max-w-sm items-center gap-2">
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  maxLength={80}
                  className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-[15px] text-white outline-none focus:border-[#0095f6]/50"
                  placeholder="Group name"
                  aria-label="Group name"
                  autoFocus
                />
                <button
                  type="button"
                  disabled={busy || !nameDraft.trim()}
                  onClick={() => void saveName()}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#0095f6] text-white disabled:opacity-40"
                  aria-label="Save group name"
                >
                  <Check className="h-5 w-5" strokeWidth={2} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="max-w-full px-2 text-center"
                onClick={() => {
                  if (!isOwner) return;
                  setNameDraft(group.title ?? "");
                  setEditingName(true);
                }}
                disabled={!isOwner}
              >
                <p className="truncate text-xl font-semibold text-white">{group.displayName}</p>
                {isOwner ? (
                  <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#0095f6]">
                    <Pencil className="h-3 w-3" strokeWidth={2} />
                    Edit name
                  </span>
                ) : null}
              </button>
            )}
            <p className="text-sm text-white/45">{group.memberCount} members</p>
          </div>

          {error ? (
            <p className="mb-3 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs text-amber-100" role="alert">
              {error}
            </p>
          ) : null}

          <section className="mb-4 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03]">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-3.5 py-3">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-white/45">Members</p>
              <button
                type="button"
                onClick={() => setAddOpen((v) => !v)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-[#0095f6]"
              >
                <UserPlus className="h-4 w-4" strokeWidth={2} />
                Add
              </button>
            </div>

            {addOpen ? (
              <div className="border-b border-white/[0.06] px-3 py-3">
                {addableFriends.length === 0 ? (
                  <p className="py-2 text-sm text-white/40">No friends left to add.</p>
                ) : (
                  <ul className="max-h-48 space-y-1 overflow-y-auto">
                    {addableFriends.map((friend) => {
                      const selected = selectedAdd.includes(friend.userId);
                      return (
                        <li key={friend.userId}>
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedAdd((prev) =>
                                selected
                                  ? prev.filter((id) => id !== friend.userId)
                                  : [...prev, friend.userId],
                              )
                            }
                            className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-white/[0.04]"
                          >
                            <div className="h-9 w-9 overflow-hidden rounded-full bg-[#262626]">
                              <AvatarDisplay avatar={avatarFromConnectionProfile(friend)} fitParent size={36} />
                            </div>
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">
                              {friend.displayName}
                            </span>
                            <span
                              className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                                selected ? "border-[#0095f6] bg-[#0095f6]" : "border-white/25"
                              }`}
                              aria-hidden
                            >
                              {selected ? <Check className="h-3 w-3 text-white" strokeWidth={3} /> : null}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {selectedAdd.length > 0 ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleAddMembers()}
                    className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0095f6] text-sm font-semibold text-white disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" strokeWidth={2} />
                    Add {selectedAdd.length} {selectedAdd.length === 1 ? "person" : "people"}
                  </button>
                ) : null}
              </div>
            ) : null}

            <ul>
              {group.members.map((member) => {
                const isSelf = member.id === currentUserId;
                const label = humanReadableShortName(member.displayName, member.username);
                return (
                  <li
                    key={member.id}
                    className="flex items-center gap-3 border-t border-white/[0.05] px-3.5 py-3 first:border-t-0"
                  >
                    <div className="h-10 w-10 overflow-hidden rounded-full bg-[#262626]">
                      <AvatarDisplay avatar={member.avatarUrl ?? ""} fitParent size={40} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-white">
                        {member.displayName || label}
                        {isSelf ? <span className="font-normal text-white/40"> · You</span> : null}
                      </p>
                      <p className="truncate text-xs text-white/40">
                        {member.role === "owner" ? "Owner" : `@${member.username}`}
                      </p>
                    </div>
                    {isOwner && !isSelf && member.role !== "owner" ? (
                      removeTarget === member.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleRemove(member.id)}
                            className="rounded-lg bg-rose-500/20 px-2.5 py-2 text-xs font-semibold text-rose-300"
                          >
                            Remove
                          </button>
                          <button
                            type="button"
                            onClick={() => setRemoveTarget(null)}
                            className="rounded-lg px-2 py-2 text-xs text-white/50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setRemoveTarget(member.id)}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-white/35 hover:bg-white/[0.05] hover:text-rose-300"
                          aria-label={`Remove ${member.displayName}`}
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                      )
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>

          {sharedMedia.length > 0 ? (
            <section className="mb-4 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03]">
              <div className="flex items-center justify-between px-3.5 py-3">
                <p className="text-[13px] font-semibold uppercase tracking-wide text-white/45">Shared media</p>
                <ChevronRight className="h-4 w-4 text-white/25" aria-hidden />
              </div>
              <div className="grid grid-cols-3 gap-0.5 px-0.5 pb-0.5">
                {sharedMedia.map((message) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={message.id}
                    src={message.imageUrl!}
                    alt=""
                    className="aspect-square w-full object-cover"
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03]">
            {confirmLeave ? (
              <div className="px-3.5 py-4">
                <p className="text-sm text-white/80">Leave this group? You won&apos;t receive new messages.</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleLeave()}
                    className="min-h-11 flex-1 rounded-xl bg-rose-500/90 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Leave group
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmLeave(false)}
                    className="min-h-11 flex-1 rounded-xl bg-white/10 text-sm font-semibold text-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmLeave(true)}
                className="flex min-h-12 w-full items-center gap-3 px-3.5 py-3 text-left text-rose-300"
              >
                <LogOut className="h-5 w-5" strokeWidth={1.75} />
                <span className="text-[15px] font-semibold">Leave group</span>
              </button>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
