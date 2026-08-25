import type { FieldNote } from "@/lib/types";
import type { UserQuestBoardItem } from "@/lib/adminQuestTypes";
import type { RecommendationEntity } from "@/lib/recommendations/types";

export function campusEventToRecommendationEntity(event: {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  location?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  rsvpCount?: number;
  hostOrganization?: { id: string; name: string } | null;
  campusId?: string | null;
}): RecommendationEntity {
  return {
    id: event.id,
    kind: "event",
    title: event.title,
    description: event.description ?? "",
    category: event.category ?? null,
    tags: [],
    organizationId: event.hostOrganization?.id ?? null,
    organizationName: event.hostOrganization?.name ?? null,
    locationName: event.location ?? null,
    campusId: event.campusId ?? "uri",
    startsAtMs: event.startsAt ? Date.parse(event.startsAt) : null,
    endsAtMs: event.endsAt ? Date.parse(event.endsAt) : null,
    popularityCount: event.rsvpCount ?? 0,
  };
}

export function externalEventToRecommendationEntity(event: {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  tags?: string[] | null;
  location?: string | null;
  venueName?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  organizationName?: string | null;
  campusId?: string | null;
}): RecommendationEntity {
  return {
    id: event.id,
    kind: "event",
    title: event.title,
    description: event.description ?? "",
    category: event.category ?? null,
    tags: event.tags ?? [],
    organizationName: event.organizationName ?? null,
    locationName: event.venueName || event.location || null,
    campusId: event.campusId ?? "uri",
    startsAtMs: event.startsAt ? Date.parse(event.startsAt) : null,
    endsAtMs: event.endsAt ? Date.parse(event.endsAt) : null,
  };
}

export function fieldNoteToRecommendationEntity(note: FieldNote): RecommendationEntity {
  const tagLabels = (note.tags ?? []).map((tag) => tag.displayLabel).filter(Boolean);
  return {
    id: note.id,
    kind: "post",
    title: note.body.slice(0, 140),
    description: note.body,
    tags: tagLabels,
    locationName: note.locationName ?? null,
    campusId: "uri",
    createdAtMs: note.createdAt,
    engagementCount:
      (note.nodCount ?? 0) +
      (note.hypeCount ?? 0) * 2 +
      (note.verifyCount ?? 0) +
      (note.assistCount ?? 0) +
      (note.commentCount ?? 0),
  };
}

export function organizationToRecommendationEntity(org: {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  tags?: string[];
  memberCount?: number;
  followerCount?: number;
  campusId?: string | null;
}): RecommendationEntity {
  return {
    id: org.id,
    kind: "organization",
    title: org.name,
    description: org.description ?? "",
    category: org.category ?? null,
    tags: org.tags ?? [],
    organizationId: org.id,
    organizationName: org.name,
    campusId: org.campusId ?? "uri",
    popularityCount: (org.memberCount ?? 0) + (org.followerCount ?? 0),
  };
}

export function questToRecommendationEntity(quest: UserQuestBoardItem): RecommendationEntity {
  return {
    id: quest.id,
    kind: "quest",
    title: quest.name,
    description: quest.description,
    category: quest.questType,
    locationName: quest.locationName,
    campusId: "uri",
    startsAtMs: quest.startsAt ? Date.parse(quest.startsAt) : null,
    endsAtMs: quest.endsAt ? Date.parse(quest.endsAt) : null,
  };
}

/** Map pin events share scoring with Events For You. */
export function mapEventPinToRecommendationEntity(
  event: {
    id: string;
    title: string;
    category?: string | null;
    locationText?: string | null;
    organizationName?: string | null;
    startsAt: string;
    endsAt: string | null;
    source?: string | null;
  },
  locationName: string,
): RecommendationEntity {
  if (event.source === "urinvolved") {
    return externalEventToRecommendationEntity({
      id: event.id,
      title: event.title,
      category: event.category,
      location: event.locationText,
      venueName: locationName,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      organizationName: event.organizationName,
    });
  }
  return campusEventToRecommendationEntity({
    id: event.id,
    title: event.title,
    category: event.category,
    location: locationName || event.locationText,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    hostOrganization: event.organizationName
      ? { id: event.organizationName, name: event.organizationName }
      : null,
  });
}

export function locationToRecommendationEntity(location: {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  major?: boolean;
  campusId?: string | null;
}): RecommendationEntity {
  return {
    id: location.id,
    kind: "location",
    title: location.name,
    description: location.description ?? "",
    category: location.category ?? null,
    campusId: location.campusId ?? "uri",
    campusMajor: location.major === true,
    featured: location.major === true,
  };
}
