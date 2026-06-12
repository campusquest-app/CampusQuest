"use client";

import { fetchAuthed } from "@/lib/client/dashboardApi";
import { getCommentsByNoteId } from "@/lib/feedStore";
import type { RealmMoment } from "@/lib/realm/locations";

export type RealmMomentApiResponse = {
  id: string;
  postId: string;
  userId: string;
  locationId: string;
  locationName: string;
  latitude: number | null;
  longitude: number | null;
  expiresAt: string;
  createdAt: string;
  body: string;
  mediaUrl: string | null;
  username: string;
  displayName: string;
  authorAvatar: string;
  postedAgoLabel: string;
  expiresInLabel: string;
  likeCount: number;
  sparkCount: number;
};

export function mapApiMomentToRealmMoment(row: RealmMomentApiResponse): RealmMoment {
  const commentCount = getCommentsByNoteId(row.postId).length;
  return {
    id: row.id,
    postId: row.postId,
    authorUserId: row.userId,
    imageUrl: row.mediaUrl ?? undefined,
    caption: row.body,
    username: row.username,
    displayName: row.displayName,
    authorAvatar: row.authorAvatar,
    timestamp: row.postedAgoLabel,
    postedAgoLabel: row.postedAgoLabel,
    expiresInLabel: row.expiresInLabel,
    likeCount: row.likeCount,
    sparkCount: row.sparkCount,
    commentCount,
    createdAt: row.createdAt,
  };
}

export async function fetchRealmMoments(locationId?: string): Promise<RealmMomentApiResponse[]> {
  const qs = locationId ? `?locationId=${encodeURIComponent(locationId)}` : "";
  const data = await fetchAuthed<{ moments: RealmMomentApiResponse[] }>(`/api/realm/moments${qs}`);
  return data.moments;
}
