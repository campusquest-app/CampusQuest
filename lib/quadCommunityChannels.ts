/**
 * Dedicated community feed channels (client + server safe).
 * The main Campus Feed remains `public` / The Quad.
 */
export const QUAD_COMMUNITY_CHANNELS = [
  "student_organizations",
  "greek_life",
  "athletics",
] as const;

export type QuadCommunityChannel = (typeof QUAD_COMMUNITY_CHANNELS)[number];

export function isQuadCommunityChannel(value: string | null | undefined): value is QuadCommunityChannel {
  return QUAD_COMMUNITY_CHANNELS.includes(value as QuadCommunityChannel);
}

export const QUAD_COMMUNITY_FEED_LABELS: Record<
  QuadCommunityChannel,
  { label: string; hint: string; emptyTitle: string; emptyBody: string }
> = {
  student_organizations: {
    label: "Organizations",
    hint: "Student clubs and campus orgs",
    emptyTitle: "No organization posts yet",
    emptyBody: "Posts from students in Student Organizations, and posts tagging clubs, will show up here.",
  },
  greek_life: {
    label: "Greek Life",
    hint: "Fraternity and sorority community",
    emptyTitle: "No Greek Life posts yet",
    emptyBody: "Posts from Greek Life students, and posts tagging fraternities or sororities, will show up here.",
  },
  athletics: {
    label: "Athletics",
    hint: "Sports, club sports, and Rams",
    emptyTitle: "No athletics posts yet",
    emptyBody: "Posts from Athletics community members, and posts tagging sports orgs, will show up here.",
  },
};
