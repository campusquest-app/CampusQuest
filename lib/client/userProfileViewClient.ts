"use client";

import { fetchAuthed } from "@/lib/client/dashboardApi";
import {
  buildLocalCharacterFromServer,
  type MeProfileRow,
  type MeStatsRow,
} from "@/lib/client/profileCharacter";
import { quadPostRowToFieldNote } from "@/lib/quadFieldNote";
import type { Character, FieldNote } from "@/lib/types";

export type ProfileRelationshipStatus =
  | "self"
  | "connected"
  | "pending_outgoing"
  | "pending_incoming"
  | "none"
  | "blocked";

export type ProfileViewUser = {
  id: string;
  displayName: string;
  username: string;
  avatar: string;
  level: number;
  title: string | null;
  guild: string | null;
  bio: string | null;
  classId: string | null;
  starterWeapon: string | null;
  streakDays: number;
  equippedTitleId: string | null;
};

export type UserProfileViewPayload = {
  user: ProfileViewUser;
  relationshipStatus: ProfileRelationshipStatus;
  canViewPrivateContent: boolean;
  requestId: string | null;
  counts: {
    posts: number;
    friends: number | null;
    mutualFriends: number;
  };
  posts: unknown[];
  profile: MeProfileRow | null;
  stats: MeStatsRow | null;
};

export function buildCharacterFromProfileView(
  payload: UserProfileViewPayload,
  viewerId: string,
): Character {
  if (payload.canViewPrivateContent && payload.profile && payload.stats) {
    return buildLocalCharacterFromServer(payload.profile, payload.stats);
  }

  return {
    id: payload.user.id,
    name: payload.user.displayName,
    username: payload.user.username,
    avatar: payload.user.avatar,
    level: payload.user.level,
    totalXP: 0,
    stats: { strength: 0, stamina: 0, knowledge: 0, social: 0, focus: 0 },
    streakDays: payload.user.streakDays,
    classId: payload.user.classId ?? undefined,
    starterWeapon: payload.user.starterWeapon ?? undefined,
    equippedTitleId: payload.user.equippedTitleId ?? undefined,
    achievements: [],
    unlockedCosmetics: [],
    createdAt: Date.now(),
    lastActivityDate: null,
    ...(payload.user.bio ? { bio: payload.user.bio } : {}),
  };
}

export function mapProfileViewPosts(payload: UserProfileViewPayload, viewerId: string): FieldNote[] {
  if (!payload.canViewPrivateContent) return [];
  return (payload.posts ?? []).map((row) => quadPostRowToFieldNote(row as Parameters<typeof quadPostRowToFieldNote>[0], viewerId));
}

export async function fetchUserProfileView(userId: string): Promise<UserProfileViewPayload> {
  return fetchAuthed<UserProfileViewPayload>(`/api/users/${userId}/profile`);
}
