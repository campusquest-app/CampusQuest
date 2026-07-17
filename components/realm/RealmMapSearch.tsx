"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Building2, Calendar, Footprints, Search, Users, X } from "lucide-react";
import {
  MAP_SEARCH_DEBOUNCE_MS,
  MAP_SEARCH_RESULT_LIMIT,
  buildMapSearchCatalog,
  mapSearchKindLabel,
  searchMapCatalog,
  type MapSearchBuildingSource,
  type MapSearchClubSource,
  type MapSearchResult,
  type MapSearchResultKind,
} from "@/lib/realm/mapAutocomplete";
import type { GroupedMapLocation } from "@/lib/mapLocationGroups";
import { fetchAuthed } from "@/lib/client/dashboardApi";

function ResultIcon({ kind }: { kind: MapSearchResultKind }) {
  const className = "cq-realm-map-search-result-icon";
  switch (kind) {
    case "building":
      return <Building2 className={className} aria-hidden />;
    case "event":
      return <Calendar className={className} aria-hidden />;
    case "club":
      return <Users className={className} aria-hidden />;
    case "quest":
      return <Footprints className={className} aria-hidden />;
  }
}

export function RealmMapSearch({
  buildings,
  groups,
  onSelect,
  disabled = false,
  onActiveChange,
}: {
  buildings: MapSearchBuildingSource[];
  groups: GroupedMapLocation[];
  onSelect: (result: MapSearchResult) => void;
  disabled?: boolean;
  /** True while the search field is focused or the results dropdown is open. */
  onActiveChange?: (active: boolean) => void;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [clubs, setClubs] = useState<MapSearchClubSource[]>([]);
  const [clubsError, setClubsError] = useState(false);
  const clubsLoadedRef = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), MAP_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (clubsLoadedRef.current) return;
    clubsLoadedRef.current = true;
    let cancelled = false;

    void (async () => {
      try {
        const [internal, external] = await Promise.all([
          fetchAuthed<{ organizations: Array<{ id: string; name: string; category?: string | null }> }>(
            "/api/organizations",
          ).catch(() => ({ organizations: [] })),
          fetchAuthed<{
            organizations: Array<{ id: string; name: string; category?: string | null }>;
          }>("/api/external/organizations").catch(() => ({ organizations: [] })),
        ]);
        if (cancelled) return;
        const next: MapSearchClubSource[] = [
          ...(internal.organizations ?? []).map((org) => ({
            id: org.id,
            name: org.name,
            category: org.category ?? null,
            source: "internal" as const,
          })),
          ...(external.organizations ?? []).map((org) => ({
            id: org.id,
            name: org.name,
            category: org.category ?? null,
            source: "external" as const,
          })),
        ];
        setClubs(next);
        setClubsError(false);
      } catch {
        if (!cancelled) setClubsError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const catalog = useMemo(
    () => buildMapSearchCatalog({ buildings, groups, clubs }),
    [buildings, groups, clubs],
  );

  const results = useMemo(() => {
    try {
      return searchMapCatalog(catalog, debouncedQuery, MAP_SEARCH_RESULT_LIMIT);
    } catch {
      return [];
    }
  }, [catalog, debouncedQuery]);

  const showDropdown = open && debouncedQuery.trim().length >= 1;
  const searchActive = focused || showDropdown;

  useEffect(() => {
    onActiveChange?.(searchActive);
  }, [searchActive, onActiveChange]);

  useEffect(() => {
    if (debouncedQuery.trim().length >= 1) setOpen(true);
  }, [debouncedQuery, results.length]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const clear = useCallback(() => {
    setQuery("");
    setDebouncedQuery("");
    setOpen(false);
    inputRef.current?.focus();
  }, []);

  const handleSelect = useCallback(
    (result: MapSearchResult) => {
      setQuery(result.title);
      setOpen(false);
      inputRef.current?.blur();
      try {
        onSelect(result);
      } catch (error) {
        console.warn("[cq:map-search] selection failed", error);
      }
    },
    [onSelect],
  );

  return (
    <div ref={rootRef} className="cq-realm-map-search" role="search">
      <div className="cq-realm-map-search-field">
        <Search className="cq-realm-map-search-icon" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          value={query}
          disabled={disabled}
          placeholder="Search buildings, clubs, events..."
          className="cq-realm-map-search-input"
          aria-label="Search campus map"
          aria-expanded={showDropdown}
          aria-controls={listId}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          onChange={(event) => {
            setQuery(event.target.value);
            if (event.target.value.trim().length >= 1) setOpen(true);
            else setOpen(false);
          }}
          onFocus={() => {
            setFocused(true);
            if (query.trim().length >= 1) setOpen(true);
          }}
          onBlur={() => {
            // Delay so result button clicks register before blur collapses chrome.
            window.setTimeout(() => setFocused(false), 180);
          }}
        />
        {query ? (
          <button type="button" onClick={clear} className="cq-realm-map-search-clear" aria-label="Clear search">
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {showDropdown ? (
        <div className="cq-realm-map-search-dropdown" role="presentation">
          {results.length === 0 ? (
            <p className="cq-realm-map-search-empty" role="status">
              No results found
              {clubsError ? " · clubs unavailable" : ""}
            </p>
          ) : (
            <ul id={listId} className="cq-realm-map-search-results" role="listbox">
              {results.map((result) => (
                <li key={result.dedupeKey} role="option">
                  <button
                    type="button"
                    className="cq-realm-map-search-result touch-manipulation"
                    onClick={() => handleSelect(result)}
                  >
                    <span className="cq-realm-map-search-result-leading">
                      <ResultIcon kind={result.kind} />
                    </span>
                    <span className="cq-realm-map-search-result-copy">
                      <span className="cq-realm-map-search-result-main">{result.title}</span>
                      <span className="cq-realm-map-search-result-sub">{result.subtitle}</span>
                    </span>
                    <span className="cq-realm-map-search-result-type">{mapSearchKindLabel(result.kind)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
