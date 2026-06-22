"use client";

import { useEffect, useState } from "react";
import {
  searchUsers,
  USER_SEARCH_DEBOUNCE_MS,
  USER_SEARCH_MIN_LEN,
  type UserSearchResult,
} from "@/lib/client/userSearchClient";
import { useDebouncedValue } from "@/lib/client/useDebouncedValue";

export function useUserSearchSuggestions(
  query: string,
  options?: {
    debounceMs?: number;
    enabled?: boolean;
    limit?: number;
    filterResults?: (results: UserSearchResult[]) => UserSearchResult[];
  },
) {
  const debounceMs = options?.debounceMs ?? USER_SEARCH_DEBOUNCE_MS;
  const enabled = options?.enabled ?? true;
  const trimmedQuery = query.trim();
  const debouncedQuery = useDebouncedValue(trimmedQuery, debounceMs);

  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showSuggestions = enabled && trimmedQuery.length >= USER_SEARCH_MIN_LEN;
  const awaitingDebounce = showSuggestions && trimmedQuery !== debouncedQuery;

  useEffect(() => {
    if (!showSuggestions) {
      setResults([]);
      setLoading(false);
      setSearched(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setSearched(false);

    void searchUsers(debouncedQuery, options?.limit)
      .then((rows) => {
        if (cancelled) return;
        const filtered = options?.filterResults ? options.filterResults(rows) : rows;
        setResults(filtered);
        setSearched(true);
        setError(null);
      })
      .catch((fetchError) => {
        if (cancelled) return;
        const message = fetchError instanceof Error ? fetchError.message : "Could not search users.";
        console.error("[cq][user-search] suggestions failed", fetchError);
        setResults([]);
        setSearched(true);
        setError(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, options?.filterResults, options?.limit, showSuggestions]);

  return {
    results,
    loading: loading || awaitingDebounce,
    searched,
    error,
    showSuggestions,
  };
}
