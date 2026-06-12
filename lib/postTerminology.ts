/** User-facing label for Quad social content (internal type remains `FieldNote`). */
export const POST_SINGULAR_LABEL = "Post";
export const POST_PLURAL_LABEL = "Posts";

const POST_QUERY_ALIASES = ["post", "posts", "field note", "field notes"] as const;

/** Expand a search query so legacy "field note" terms match "post" content. */
export function expandPostSearchTerms(query: string): string[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  const terms = new Set<string>([normalized]);

  const mentionsPost = normalized.includes("post");
  const mentionsFieldNote = normalized.includes("field note") || normalized.includes("fieldnote");

  if (mentionsPost || mentionsFieldNote) {
    for (const alias of POST_QUERY_ALIASES) {
      terms.add(alias);
    }
  }

  return Array.from(terms);
}

export function textMatchesPostSearch(text: string, query: string): boolean {
  const haystack = text.toLowerCase();
  return expandPostSearchTerms(query).some((term) => haystack.includes(term));
}
