"use client";

import { postAuthed, fetchAuthed, patchAuthed } from "@/lib/client/dashboardApi";

export type GroupMemberSummary = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: "owner" | "member";
};

export type GroupConversationDetails = {
  type: "group";
  conversationId: string;
  title: string | null;
  displayName: string;
  memberCount: number;
  members: GroupMemberSummary[];
  myRole: "owner" | "member";
  createdAt: string;
  updatedAt: string;
};

export async function createGroupConversation(args: {
  memberIds: string[];
  title?: string;
}): Promise<GroupConversationDetails> {
  const payload = await postAuthed<{ conversation: GroupConversationDetails }, typeof args>(
    "/api/social/conversations/group",
    args,
  );
  return payload.conversation;
}

export async function fetchGroupConversation(conversationId: string): Promise<GroupConversationDetails> {
  const payload = await fetchAuthed<{ conversation: GroupConversationDetails }>(
    `/api/social/conversations/${conversationId}`,
  );
  if (payload.conversation.type !== "group") {
    throw new Error("Not a group conversation.");
  }
  return payload.conversation;
}

export async function renameGroupConversation(conversationId: string, title: string): Promise<GroupConversationDetails> {
  const payload = await patchAuthed<{ conversation: GroupConversationDetails }, { title: string }>(
    `/api/social/conversations/${conversationId}`,
    { title },
  );
  return payload.conversation;
}

export async function leaveGroupConversation(conversationId: string): Promise<void> {
  await postAuthed(`/api/social/conversations/${conversationId}/leave`, {});
}
