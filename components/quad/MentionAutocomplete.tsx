"use client";

import { useEffect, useState } from "react";
import { useDebouncedValue } from "@/lib/client/useDebouncedValue";
import { searchTagEntities, TAG_SEARCH_DEBOUNCE_MS, type TagSearchResult } from "@/lib/client/tagSearchClient";

export function MentionAutocomplete({
  query,
  open,
  onSelect,
}: {
  query: string;
  open: boolean;
  onSelect: (hit: TagSearchResult) => void;
}) {
  const debounced = useDebouncedValue(query, TAG_SEARCH_DEBOUNCE_MS);
  const [results, setResults] = useState<TagSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void searchTagEntities(debounced || "", "all", 8)
      .then((rows) => {
        if (!cancelled) setResults(rows);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, open]);

  if (!open) return null;

  return (
    <div
      className="absolute bottom-full left-0 right-0 z-30 mb-1 max-h-56 overflow-y-auto rounded-xl border border-white/15 bg-uri-navy shadow-xl"
      role="listbox"
      aria-label="Mention suggestions"
    >
      {loading ? <p className="px-3 py-2 text-xs text-white/50">Searching…</p> : null}
      {!loading && results.length === 0 ? (
        <p className="px-3 py-2 text-xs text-white/50">No matches</p>
      ) : null}
      {results.map((hit) => (
        <button
          key={`${hit.entityType}:${hit.entityId}`}
          type="button"
          role="option"
          aria-selected={false}
          className="flex w-full min-h-[44px] items-center justify-between gap-2 px-3 py-2 text-left hover:bg-white/10"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelect(hit)}
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-white">
              {hit.entityType === "user" ? `@${hit.mentionSlug}` : hit.displayLabel}
            </span>
            <span className="block truncate text-[11px] text-white/50">
              {String(hit.meta?.kind ?? hit.entityType)}
              {hit.subtitle ? ` · ${hit.subtitle}` : ""}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
