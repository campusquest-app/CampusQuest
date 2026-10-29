/** Current anonymity notice. Bump this to show the notice again. */
export const ANONYMOUS_NOTICE_VERSION = 1;

export const ANONYMOUS_NOTICE_FEATURE_KEY = "anonymous_posting";

export const ANONYMOUS_STUDENT_NAME = "Anonymous Student";

/** Stable generic avatar. It is not derived from the account. */
export const ANONYMOUS_STUDENT_AVATAR = "👤";

export const ANONYMOUS_ACCOUNTABILITY_LINE =
  "Anonymous to students. Accountable to CampusQuest. Community rules apply.";

export const ANONYMOUS_IDENTITY_HINT =
  "Your text, photos, videos, or location tags could reveal your identity.";

export const ANONYMOUS_AUDIENCE_COPY =
  "Everyone on the Campus Feed can see this post. It is not limited to people you follow.";

export const ANONYMOUS_COMMENT_COPY =
  "Commenting uses your profile. Your name will appear on this comment.";

export function anonymousNoticeSatisfied(acceptedVersion: number | null | undefined): boolean {
  return acceptedVersion === ANONYMOUS_NOTICE_VERSION;
}

export function anonymousStoragePath(extension: string): string {
  const ext = extension.replace(/^\./, "").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
  return `anon/${crypto.randomUUID()}.${ext}`;
}

export function storagePathRevealsAccount(path: string, userId: string): boolean {
  const normalized = path.trim().toLowerCase();
  return normalized.includes(userId.trim().toLowerCase());
}

export type AnonymousPostRequest = {
  anonymous?: boolean;
  feedDestination?: string | null;
  visibility?: string | null;
  postedAsType?: string | null;
  tagCount?: number;
  mentionCount?: number;
  photoTagCount?: number;
};

/** Server-side scope checks for a requested anonymous post. Null means allowed. */
export function anonymousPostRequestError(input: AnonymousPostRequest): string | null {
  if (!input.anonymous) return null;
  if ((input.feedDestination ?? "campus") !== "campus") {
    return "Anonymous posts can only be published to the Campus Feed.";
  }
  if (input.visibility === "friends") {
    return "Anonymous posts are visible to the Campus Feed, not only people you follow.";
  }
  if (input.postedAsType && input.postedAsType !== "personal") {
    return "Anonymous posts use the Anonymous Student identity, not an organization or business.";
  }
  const tags = (input.tagCount ?? 0) + (input.mentionCount ?? 0) + (input.photoTagCount ?? 0);
  if (tags > 0) {
    return "Anonymous posts can’t tag or mention anyone.";
  }
  return null;
}

export function anonymousAuthorPresentation(viewerIsAuthor: boolean): {
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorAvatar: string;
  isAnonymous: true;
  viewerIsAuthor: boolean;
  authorStreakDays?: undefined;
  authorVerifiedBadge: false;
} {
  return {
    authorId: "",
    authorName: ANONYMOUS_STUDENT_NAME,
    authorUsername: "",
    authorAvatar: ANONYMOUS_STUDENT_AVATAR,
    isAnonymous: true,
    viewerIsAuthor,
    authorVerifiedBadge: false,
  };
}
