import { fetchAuthed } from "@/lib/client/dashboardApi";
import type { TagEntityType } from "@/lib/postTags";

export type TagSearchResult = {
  entityType: TagEntityType;
  entityId: string;
  displayLabel: string;
  subtitle: string | null;
  mentionSlug: string;
  avatarUrl: string | null;
  meta?: Record<string, string | boolean | null>;
};

export const TAG_SEARCH_DEBOUNCE_MS = 250;

export async function searchTagEntities(
  query: string,
  filter: "all" | "people" | "organizations" | "events" = "all",
  limit = 10,
): Promise<TagSearchResult[]> {
  const qs = new URLSearchParams({
    q: query.trim(),
    filter,
    limit: String(limit),
  });
  const data = await fetchAuthed<{ results: TagSearchResult[] }>(`/api/quad/tags/search?${qs}`);
  return data.results ?? [];
}
