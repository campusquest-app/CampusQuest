"use client";

import { AvatarDisplay } from "@/components/AvatarDisplay";
import {
  avatarFromUserSearchResult,
  userSearchConnectionLabel,
  type UserSearchResult,
} from "@/lib/client/userSearchClient";

export function UserSearchSuggestions({
  results,
  loading,
  searched,
  onSelect,
  renderAction,
  emptyMessage = "No users found.",
  listId,
}: {
  results: UserSearchResult[];
  loading: boolean;
  searched: boolean;
  onSelect: (user: UserSearchResult) => void;
  renderAction?: (user: UserSearchResult) => React.ReactNode;
  emptyMessage?: string;
  listId?: string;
}) {
  if (loading) {
    return <p className="cq-user-search-message">Searching…</p>;
  }

  if (searched && results.length === 0) {
    return <p className="cq-user-search-message">{emptyMessage}</p>;
  }

  return (
    <ul id={listId} className="cq-user-search-list" role="listbox" aria-label="User search suggestions">
      {results.map((row) => {
        const connectionLabel = userSearchConnectionLabel(row.connectionStatus);

        return (
          <li key={row.userId} className="cq-user-search-row" role="option">
            <button type="button" onClick={() => onSelect(row)} className="cq-user-search-row-main touch-manipulation">
              <div className="cq-avatar-slot h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/10 bg-[#262626]">
                <AvatarDisplay avatar={avatarFromUserSearchResult(row)} fitParent size={40} />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-semibold text-white">{row.displayName}</p>
                <p className="truncate text-xs text-white/45">@{row.username}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-white/45">
                  <span>Lv.{row.level}</span>
                  {connectionLabel ? <span className="text-uri-keaney/90">{connectionLabel}</span> : null}
                  {row.mutualFriendsCount > 0 ? (
                    <span>
                      {row.mutualFriendsCount} mutual connection{row.mutualFriendsCount === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </div>
              </div>
            </button>
            {renderAction ? renderAction(row) : null}
          </li>
        );
      })}
    </ul>
  );
}
