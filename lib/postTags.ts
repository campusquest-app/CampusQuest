/** Shared types + pure helpers for Quad post tags/mentions (client + server safe). */

export const TAG_ENTITY_TYPES = ["user", "organization", "event", "external_event"] as const;
export type TagEntityType = (typeof TAG_ENTITY_TYPES)[number];

export const TAG_SOURCES = ["composer", "photo", "mention"] as const;
export type TagSource = (typeof TAG_SOURCES)[number];

export const TAG_STATUSES = ["pending", "approved", "rejected", "removed"] as const;
export type TagStatus = (typeof TAG_STATUSES)[number];

export const MAX_STRUCTURED_TAGS_PER_POST = 20;
export const MAX_PHOTO_TAGS_PER_MEDIA = 20;
export const MAX_MENTIONS_PER_CAPTION = 20;
export const TAG_SEARCH_LIMIT = 10;

export type TagEntityRef = {
  entityType: TagEntityType;
  entityId: string;
};

export type ComposerTagSelection = TagEntityRef & {
  displayLabel: string;
  subtitle?: string | null;
  avatarUrl?: string | null;
  mentionSlug?: string | null;
};

export type PhotoTagDraft = TagEntityRef & {
  mediaKey: string;
  positionX: number;
  positionY: number;
  displayLabel: string;
};

export type CaptionMentionDraft = TagEntityRef & {
  displayText: string;
  startIndex: number;
  endIndex: number;
};

export type PostTagRow = {
  id: string;
  post_id: string;
  entity_type: TagEntityType;
  entity_id: string;
  tag_source: TagSource;
  media_key: string | null;
  position_x: number | null;
  position_y: number | null;
  status: TagStatus;
  created_by: string;
  created_at: string;
  removed_at: string | null;
};

export type PostMentionRow = {
  id: string;
  post_id: string;
  entity_type: TagEntityType;
  entity_id: string;
  display_text: string;
  start_index: number;
  end_index: number;
};

export function tagEntityKey(ref: TagEntityRef): string {
  return `${ref.entityType}:${ref.entityId}`;
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function isTagEntityType(value: string): value is TagEntityType {
  return (TAG_ENTITY_TYPES as readonly string[]).includes(value);
}

/** Format “With A, B and N others” for feed cards. */
export function formatWithTaggedLine(labels: string[]): string | null {
  const clean = labels.map((l) => l.trim()).filter(Boolean);
  if (clean.length === 0) return null;
  if (clean.length === 1) return `With ${clean[0]}`;
  if (clean.length === 2) return `With ${clean[0]} and ${clean[1]}`;
  return `With ${clean[0]}, ${clean[1]} and ${clean.length - 2} others`;
}

/**
 * Detect active @mention query at cursor.
 * Returns query text without @ and the range to replace.
 */
export function detectActiveMention(
  text: string,
  cursor: number,
): { query: string; start: number; end: number } | null {
  const safeCursor = Math.max(0, Math.min(cursor, text.length));
  const before = text.slice(0, safeCursor);
  const match = before.match(/(^|[\s([{])@([a-zA-Z0-9_]{0,64})$/);
  if (!match) return null;
  const atIndex = before.lastIndexOf("@");
  if (atIndex < 0) return null;
  return {
    query: match[2] ?? "",
    start: atIndex,
    end: safeCursor,
  };
}

/** Insert a mention token at the active range; returns new text + cursor. */
export function insertMentionAtCursor(args: {
  text: string;
  cursor: number;
  mentionText: string;
}): { text: string; cursor: number; start: number; end: number } | null {
  const active = detectActiveMention(args.text, args.cursor);
  if (!active) return null;
  const token = args.mentionText.startsWith("@") ? args.mentionText : `@${args.mentionText}`;
  const after = args.text.slice(active.end);
  const needsSpace = !after.startsWith(" ") && !after.startsWith("\n");
  const withSpace = needsSpace ? `${token} ` : token;
  const next = args.text.slice(0, active.start) + withSpace + after;
  const nextCursor = active.start + withSpace.length;
  return {
    text: next,
    cursor: nextCursor,
    start: active.start,
    end: active.start + token.length,
  };
}

export function dedupeTagRefs<T extends TagEntityRef>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = tagEntityKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** Whether a viewer may see a post that appears in a Tagged grid. */
export function canViewerSeeTaggedPost(args: {
  viewerId: string;
  authorId: string;
  visibility: "public" | "friends" | string;
  friendAuthorIds: Iterable<string>;
}): boolean {
  if (args.authorId === args.viewerId) return true;
  if (args.visibility === "public") return true;
  if (args.visibility === "friends") {
    const friends = args.friendAuthorIds instanceof Set
      ? args.friendAuthorIds
      : new Set(args.friendAuthorIds);
    return friends.has(args.authorId);
  }
  return false;
}
