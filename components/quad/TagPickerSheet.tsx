"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { useDebouncedValue } from "@/lib/client/useDebouncedValue";
import { searchTagEntities, TAG_SEARCH_DEBOUNCE_MS, type TagSearchResult } from "@/lib/client/tagSearchClient";
import { tagEntityKey, type ComposerTagSelection } from "@/lib/postTags";
import { AvatarDisplay } from "@/components/AvatarDisplay";

type Filter = "all" | "people" | "organizations" | "events";

export function TagPickerSheet({
  open,
  selected,
  onChange,
  onClose,
  onDone,
  mode = "multi",
}: {
  open: boolean;
  selected: ComposerTagSelection[];
  onChange: (next: ComposerTagSelection[]) => void;
  onClose: () => void;
  onDone: () => void;
  /** Single-pick mode closes after one selection (photo tagging). */
  mode?: "multi" | "single";
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TagSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounced = useDebouncedValue(query.trim(), TAG_SEARCH_DEBOUNCE_MS);
  const selectedKeys = useMemo(() => new Set(selected.map(tagEntityKey)), [selected]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (debounced.length < 1) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void searchTagEntities(debounced, filter)
      .then((rows) => {
        if (cancelled) return;
        setResults(rows);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setResults([]);
        setError(err instanceof Error ? err.message : "Search failed.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, filter, open]);

  if (!open) return null;

  function toggle(hit: TagSearchResult) {
    const key = `${hit.entityType}:${hit.entityId}`;
    const nextItem: ComposerTagSelection = {
      entityType: hit.entityType,
      entityId: hit.entityId,
      displayLabel:
        hit.entityType === "user" ? `@${hit.mentionSlug}` : hit.displayLabel,
      subtitle: hit.subtitle,
      avatarUrl: hit.avatarUrl,
      mentionSlug: hit.mentionSlug,
    };
    if (mode === "single") {
      onChange([nextItem]);
      onDone();
      return;
    }
    if (selectedKeys.has(key)) {
      onChange(selected.filter((s) => tagEntityKey(s) !== key));
      return;
    }
    if (selected.length >= 20) return;
    onChange([...selected, nextItem]);
  }

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "people", label: "People" },
    { id: "organizations", label: "Organizations" },
    { id: "events", label: "Events" },
  ];

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="add-tags-title">
      <button type="button" className="absolute inset-0 bg-black/70" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 flex max-h-[min(92dvh,100%)] w-full max-w-lg flex-col rounded-t-3xl border border-white/15 bg-uri-navy shadow-2xl sm:rounded-2xl pb-[env(safe-area-inset-bottom)]">
        <header className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
          <button type="button" onClick={onClose} className="min-h-[44px] px-2 text-sm text-white/70">
            Cancel
          </button>
          <h2 id="add-tags-title" className="font-display text-base font-bold text-white">
            Add tags
          </h2>
          <button type="button" onClick={onDone} className="min-h-[44px] px-2 text-sm font-semibold text-uri-keaney">
            Done
          </button>
        </header>

        <div className="flex gap-1 overflow-x-auto px-3 pt-3" role="tablist" aria-label="Tag filters">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`min-h-[40px] shrink-0 rounded-full px-3 text-xs font-semibold ${
                filter === f.id ? "bg-uri-keaney text-uri-navy" : "bg-white/10 text-white/75"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="px-3 pt-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search CampusQuest"
              className="w-full min-h-[44px] rounded-xl border border-white/15 bg-white/10 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-white/40"
            />
          </label>
        </div>

        {selected.length > 0 ? (
          <div className="border-b border-white/10 px-3 py-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/50">Selected</p>
            <div className="flex flex-wrap gap-2">
              {selected.map((s) => (
                <button
                  key={tagEntityKey(s)}
                  type="button"
                  onClick={() => onChange(selected.filter((x) => tagEntityKey(x) !== tagEntityKey(s)))}
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-full border border-uri-keaney/40 bg-uri-keaney/15 px-2.5 text-xs text-uri-keaney"
                >
                  {s.displayLabel}
                  <X className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {loading ? <p className="px-2 py-4 text-sm text-white/50">Searching…</p> : null}
          {error ? <p className="px-2 py-2 text-sm text-amber-400">{error}</p> : null}
          {!loading && debounced.length > 0 && results.length === 0 ? (
            <p className="px-2 py-4 text-sm text-white/50">No matches found.</p>
          ) : null}
          <ul className="space-y-1" role="listbox" aria-label="Search results">
            {results.map((hit) => {
              const key = `${hit.entityType}:${hit.entityId}`;
              const isSelected = selectedKeys.has(key);
              const kind = String(hit.meta?.kind ?? hit.entityType);
              return (
                <li key={key}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => toggle(hit)}
                    className={`flex w-full min-h-[56px] items-center gap-3 rounded-xl px-2 py-2 text-left ${
                      isSelected ? "bg-uri-keaney/15" : "hover:bg-white/5"
                    }`}
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10">
                      {hit.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={hit.avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : hit.entityType === "user" ? (
                        <AvatarDisplay avatar="🎓" size={40} />
                      ) : (
                        <span className="text-lg" aria-hidden>
                          {hit.entityType === "organization" ? "🏛️" : "📅"}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{hit.displayLabel}</p>
                      <p className="truncate text-xs text-white/55">
                        {kind}
                        {hit.subtitle ? ` · ${hit.subtitle}` : ""}
                      </p>
                    </div>
                    {isSelected ? (
                      <Check className="h-5 w-5 shrink-0 text-uri-keaney" aria-hidden />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
