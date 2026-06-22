"use client";

import { useEffect, useId, useRef } from "react";
import { useUserSearchSuggestions } from "@/lib/client/useUserSearchSuggestions";
import type { UserSearchResult } from "@/lib/client/userSearchClient";
import { UserSearchSuggestions } from "@/components/ui/UserSearchSuggestions";

export function UserSearchInput({
  value,
  onChange,
  onSelectUser,
  placeholder = "Search by name or username…",
  className = "",
  inputClassName = "cq-search-input w-full px-3 py-2.5 rounded-xl focus:outline-none",
  ariaLabel = "Search users",
  autoComplete = "off",
  autoFocus = false,
  enabled = true,
  inputId,
  filterResults,
  renderAction,
  emptyMessage,
  onError,
  panelClassName = "",
}: {
  value: string;
  onChange: (value: string) => void;
  onSelectUser: (user: UserSearchResult) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  ariaLabel?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  enabled?: boolean;
  inputId?: string;
  filterResults?: (results: UserSearchResult[]) => UserSearchResult[];
  renderAction?: (user: UserSearchResult) => React.ReactNode;
  emptyMessage?: string;
  onError?: (message: string | null) => void;
  panelClassName?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const { results, loading, searched, error, showSuggestions } = useUserSearchSuggestions(value, {
    enabled,
    filterResults,
  });

  useEffect(() => {
    onError?.(error);
  }, [error, onError]);

  useEffect(() => {
    if (!showSuggestions) return undefined;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target || rootRef.current?.contains(target)) return;
      if (document.activeElement instanceof HTMLElement && rootRef.current?.contains(document.activeElement)) {
        document.activeElement.blur();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [showSuggestions]);

  return (
    <div ref={rootRef} className={`cq-user-search ${className}`.trim()}>
      <input
        id={inputId}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        spellCheck={false}
        className={inputClassName}
        aria-label={ariaLabel}
        aria-expanded={showSuggestions}
        aria-controls={showSuggestions ? listId : undefined}
      />

      {showSuggestions ? (
        <div className={`cq-user-search-panel ${panelClassName}`.trim()} role="presentation">
          <UserSearchSuggestions
            listId={listId}
            results={results}
            loading={loading}
            searched={searched}
            onSelect={onSelectUser}
            renderAction={renderAction}
            emptyMessage={emptyMessage}
          />
        </div>
      ) : null}
    </div>
  );
}
