"use client";

import { Search, X } from "lucide-react";

export function PeopleSearchField({
  value,
  onChange,
  inputId = "cq-people-search",
}: {
  value: string;
  onChange: (value: string) => void;
  inputId?: string;
}) {
  const hasText = value.length > 0;

  return (
    <div className="cq-people-search">
      <Search className="cq-people-search-icon" aria-hidden strokeWidth={2} />
      <input
        id={inputId}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search names or usernames"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        className="cq-people-search-input"
        aria-label="Search names or usernames"
      />
      {hasText ? (
        <button
          type="button"
          className="cq-people-search-clear"
          onClick={() => onChange("")}
          aria-label="Clear search"
        >
          <X className="h-4 w-4" aria-hidden strokeWidth={2.25} />
        </button>
      ) : null}
    </div>
  );
}
