"use client";

import type { FieldNote } from "@/lib/types";
import { isPersistedQuadPostId } from "@/lib/quadFieldNote";
import { avatarPayloadForDisplay, getMomentCaption } from "@/lib/realm/momentDisplay";
import type { RealmMoment } from "@/lib/realm/locations";
import { postAuthed } from "@/lib/client/dashboardApi";

export type DirectMessageType = "text" | "image" | "shared_post";
export type SharedPostType = "quad" | "memory";

export type SharedPostPreview = {
  postId: string;
  postType: SharedPostType;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorAvatar: string;
  caption: string;
  imageUrl: string | null;
  locationName: string | null;
  unavailable?: boolean;
  locked?: boolean;
};

export type DirectMessageDto = {
  id: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  type: DirectMessageType;
  content: string;
  imageUrl: string | null;
  sharedPostId: string | null;
  sharedPostType: SharedPostType | null;
  metadata: Record<string, unknown>;
  sharedPostPreview: SharedPostPreview | null;
  previewText: string;
  createdAt: string;
  readAt: string | null;
  isFavorited?: boolean;
  pending?: boolean;
  failed?: boolean;
  uploadProgress?: number;
};

export type SharePostTarget = {
  postId: string;
  postType: SharedPostType;
  authorName: string;
  authorUsername: string;
  authorAvatar: string;
  caption: string;
  imageUrl?: string | null;
  locationName?: string | null;
};

export function conversationPreviewText(
  message: { content: string; previewText?: string; type?: DirectMessageType } | null,
): string {
  if (!message) return "No messages yet";
  return message.previewText || message.content || "No messages yet";
}

export function buildShareTargetFromFieldNote(
  note: FieldNote,
  postType: SharedPostType = "quad",
): SharePostTarget | null {
  if (!(note.isPersisted ?? isPersistedQuadPostId(note.id))) return null;
  return {
    postId: note.id,
    postType,
    authorName: note.authorName,
    authorUsername: note.authorUsername,
    authorAvatar: note.authorAvatar,
    caption: note.body,
    imageUrl: note.proofUrl?.trim() || null,
    locationName: note.locationName ?? null,
  };
}

export function buildShareTargetFromRealmMoment(
  moment: RealmMoment,
  locationName: string,
): SharePostTarget | null {
  if (!moment.postId || !isPersistedQuadPostId(moment.postId)) return null;
  return {
    postId: moment.postId,
    postType: "memory",
    authorName: moment.displayName,
    authorUsername: moment.username,
    authorAvatar: avatarPayloadForDisplay(moment.authorAvatar),
    caption: getMomentCaption(moment),
    imageUrl: typeof moment.imageUrl === "string" ? moment.imageUrl.trim() || null : null,
    locationName,
  };
}

export async function uploadDmImage(args: {
  conversationId: string;
  imageDataUrl: string;
}): Promise<string> {
  const data = await postAuthed<{ imageUrl: string }, { conversationId: string; imageDataUrl: string }>(
    "/api/messages/upload-image",
    args,
  );
  if (!data.imageUrl?.trim()) throw new Error("Image upload failed.");
  return data.imageUrl.trim();
}

export async function sendRichDirectMessage(args: {
  conversationId: string;
  content?: string;
  type?: DirectMessageType;
  imageUrl?: string;
  sharedPostId?: string;
  sharedPostType?: SharedPostType;
  metadata?: Record<string, unknown>;
}): Promise<DirectMessageDto> {
  const data = await postAuthed<{ message: DirectMessageDto }, typeof args>(
    `/api/social/conversations/${args.conversationId}/messages`,
    args,
  );
  return data.message;
}

export async function sharePostToConversations(args: {
  postId: string;
  postType: SharedPostType;
  conversationIds: string[];
  optionalText?: string;
  locationName?: string | null;
}): Promise<DirectMessageDto[]> {
  const data = await postAuthed<{ messages: DirectMessageDto[] }, typeof args>("/api/messages/share-post", args);
  return data.messages ?? [];
}

export function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read image."));
    };
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}
