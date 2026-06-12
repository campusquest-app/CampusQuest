"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import type { AdminSectionId, ModerationTabId, OrganizationsTabId } from "@/lib/admin/navigation";
import {
  ADMIN_SEARCH_DEBOUNCE_MS,
  ADMIN_SEARCH_MIN_CHARS,
  loadRecentAdminSearches,
  parseAdminSearchQuery,
  saveRecentAdminSearch,
} from "@/lib/admin/searchQuery";
import type {
  AdminGlobalSearchResults,
  AdminSearchAuditResult,
  AdminSearchEventResult,
  AdminSearchMessageResult,
  AdminSearchOrganizationResult,
  AdminSearchReportResult,
  AdminSearchUserResult,
} from "@/lib/server/adminGlobalSearch";

export type AdminSearchNavigatePayload = {
  section: AdminSectionId;
  moderationTab?: ModerationTabId;
  organizationsTab?: OrganizationsTabId;
  safetyQuery?: string;
  auditQuery?: string;
  organizationId?: string;
};

type FlatResult =
  | { key: string; category: "Users"; item: AdminSearchUserResult }
  | { key: string; category: "Organizations"; item: AdminSearchOrganizationResult }
  | { key: string; category: "Events"; item: AdminSearchEventResult }
  | { key: string; category: "Reports"; item: AdminSearchReportResult }
  | { key: string; category: "Messages"; item: AdminSearchMessageResult }
  | { key: string; category: "Audit Logs"; item: AdminSearchAuditResult };

export function AdminGlobalSearch({ onNavigate }: { onNavigate: (payload: AdminSearchNavigatePayload) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminGlobalSearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selected, setSelected] = useState<FlatResult | null>(null);
  const [recents, setRecents] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRecents(loadRecentAdminSearches());
  }, []);

  const parsed = useMemo(() => parseAdminSearchQuery(query), [query]);

  const flatResults = useMemo<FlatResult[]>(() => {
    if (!results) return [];
    return [
      ...results.users.map((item) => ({ key: `user-${item.id}`, category: "Users" as const, item })),
      ...results.organizations.map((item) => ({ key: `org-${item.id}`, category: "Organizations" as const, item })),
      ...results.events.map((item) => ({ key: `event-${item.id}`, category: "Events" as const, item })),
      ...results.reports.map((item) => ({ key: `report-${item.id}`, category: "Reports" as const, item })),
      ...results.messages.map((item) => ({ key: `message-${item.id}`, category: "Messages" as const, item })),
      ...results.auditLogs.map((item) => ({ key: `audit-${item.id}`, category: "Audit Logs" as const, item })),
    ];
  }, [results]);

  const hasResults = flatResults.length > 0;
  const showPanel = open && (query.length >= ADMIN_SEARCH_MIN_CHARS || recents.length > 0);

  const runSearch = useCallback(async (raw: string) => {
    const nextParsed = parseAdminSearchQuery(raw);
    if (nextParsed.query.length < ADMIN_SEARCH_MIN_CHARS && !/^[0-9a-f-]{36}$/i.test(nextParsed.query)) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAuthed<{ results: AdminGlobalSearchResults }>(
        `/api/internal/admin/search?q=${encodeURIComponent(raw.trim())}`,
      );
      setResults(data.results);
      setActiveIndex(0);
      setSelected(null);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Search failed.");
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (query.trim().length < ADMIN_SEARCH_MIN_CHARS) {
      setResults(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void runSearch(query);
    }, ADMIN_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, open, runSearch]);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setSelected(null);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function closeSearch() {
    setOpen(false);
    setSelected(null);
  }

  function chooseResult(result: FlatResult) {
    saveRecentAdminSearch(query);
    setRecents(loadRecentAdminSearches());
    setSelected(result);
  }

  function navigateFromResult(result: FlatResult) {
    saveRecentAdminSearch(query);
    if (result.category === "Users") {
      onNavigate({ section: "moderation", moderationTab: "safety", safetyQuery: result.item.username });
    } else if (result.category === "Organizations") {
      onNavigate({
        section: "organizations",
        organizationsTab: result.item.imported ? "requests" : "controls",
        organizationId: result.item.imported ? undefined : result.item.id,
      });
    } else if (result.category === "Events") {
      onNavigate({ section: "moderation", moderationTab: "content" });
    } else if (result.category === "Reports") {
      onNavigate({
        section: "moderation",
        moderationTab: result.item.reportType === "message" ? "messages" : "content",
      });
    } else if (result.category === "Messages") {
      onNavigate({ section: "moderation", moderationTab: "messages" });
    } else {
      onNavigate({ section: "audit", auditQuery: result.item.actionType });
    }
    closeSearch();
  }

  async function suspendUser(user: AdminSearchUserResult) {
    const reason = window.prompt("Suspension reason:", "") ?? "";
    await postAuthed("/api/internal/admin/moderation/users/status", {
      userId: user.id,
      status: "suspended",
      reason: reason.trim() || undefined,
    });
    void runSearch(query);
  }

  async function banUser(user: AdminSearchUserResult) {
    const reason = window.prompt("Ban reason:", "") ?? "";
    await postAuthed("/api/internal/admin/moderation/users/status", {
      userId: user.id,
      status: "banned",
      reason: reason.trim() || undefined,
    });
    void runSearch(query);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (selected) {
        setSelected(null);
        return;
      }
      closeSearch();
      inputRef.current?.blur();
      return;
    }
    if (!showPanel || flatResults.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, flatResults.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const result = flatResults[activeIndex];
      if (!result) return;
      if (selected) navigateFromResult(selected);
      else navigateFromResult(result);
    }
  }

  return (
    <div ref={panelRef} className="cq-admin-global-search relative z-50">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" aria-hidden />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search users, organizations, events, reports, emails..."
          className="cq-admin-global-search__input w-full rounded-2xl border border-white/15 bg-black/25 py-3 pl-10 pr-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-uri-keaney/45"
          aria-expanded={showPanel}
          aria-controls="cq-admin-search-panel"
          role="combobox"
        />
        {parsed.scope !== "all" && query ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-cyan-400/30 px-2 py-0.5 text-[10px] font-semibold text-cyan-200">
            {parsed.scope}
          </span>
        ) : null}
      </div>

      {showPanel ? (
        <>
          <button
            type="button"
            aria-label="Close search"
            className="cq-admin-global-search__backdrop fixed inset-0 z-40 bg-black/60 lg:hidden"
            onClick={closeSearch}
          />
          <div
            id="cq-admin-search-panel"
            className="cq-admin-global-search__panel fixed inset-x-0 top-[4.5rem] z-50 flex max-h-[calc(100vh-4.5rem)] flex-col overflow-hidden border-t border-white/12 bg-uri-navy shadow-2xl lg:absolute lg:inset-x-auto lg:top-[calc(100%+0.5rem)] lg:max-h-[32rem] lg:rounded-2xl lg:border"
          >
          <div className="min-h-0 flex-1 overflow-y-auto">
            {query.length < ADMIN_SEARCH_MIN_CHARS && recents.length > 0 ? (
              <div className="border-b border-white/10 p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/45">Recent searches</p>
                <div className="flex flex-wrap gap-2">
                  {recents.map((recent) => (
                    <button
                      key={recent}
                      type="button"
                      onClick={() => setQuery(recent)}
                      className="rounded-full border border-white/12 px-2.5 py-1 text-[11px] text-white/70 hover:bg-white/8"
                    >
                      {recent}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {loading ? <p className="p-4 text-sm text-white/55">Searching…</p> : null}
            {error ? <p className="p-4 text-sm text-rose-200">{error}</p> : null}

            {!loading && query.length >= ADMIN_SEARCH_MIN_CHARS && !hasResults ? (
              <p className="p-4 text-sm text-white/55">
                No matching users, organizations, events, or reports found.
              </p>
            ) : null}

            {selected ? (
              <div className="border-b border-white/10 p-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/45">Quick actions</p>
                {selected.category === "Users" ? (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-white">
                      {selected.item.displayName} <span className="text-white/55">@{selected.item.username}</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="cq-admin-action cq-admin-action--default" onClick={() => navigateFromResult(selected)}>
                        View in User Safety
                      </button>
                      <button type="button" className="cq-admin-action cq-admin-action--default" onClick={() => onNavigate({ section: "moderation", moderationTab: "messages" })}>
                        View Reports
                      </button>
                      <button type="button" className="cq-admin-action cq-admin-action--default" onClick={() => onNavigate({ section: "audit", auditQuery: selected.item.username })}>
                        View Audit History
                      </button>
                      <button type="button" className="cq-admin-action cq-admin-action--default" onClick={() => void suspendUser(selected.item)}>
                        Suspend
                      </button>
                      <button type="button" className="cq-admin-action cq-admin-action--danger" onClick={() => void banUser(selected.item)}>
                        Ban
                      </button>
                    </div>
                  </div>
                ) : null}
                {selected.category === "Organizations" ? (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="cq-admin-action cq-admin-action--default" onClick={() => navigateFromResult(selected)}>
                      View Organization
                    </button>
                    {!selected.item.imported ? (
                      <>
                        <button type="button" className="cq-admin-action cq-admin-action--default" onClick={() => onNavigate({ section: "organizations", organizationsTab: "controls", organizationId: selected.item.id })}>
                          Transfer Ownership
                        </button>
                        <button type="button" className="cq-admin-action cq-admin-action--default" onClick={() => onNavigate({ section: "organizations", organizationsTab: "controls", organizationId: selected.item.id })}>
                          Freeze / Remove
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : null}
                {selected.category === "Events" ? (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="cq-admin-action cq-admin-action--default" onClick={() => navigateFromResult(selected)}>
                      View Event
                    </button>
                    {!selected.item.imported ? (
                      <>
                        <button type="button" className="cq-admin-action cq-admin-action--danger" onClick={() => onNavigate({ section: "moderation", moderationTab: "content" })}>
                          Remove Event
                        </button>
                        <button type="button" className="cq-admin-action cq-admin-action--default" onClick={() => onNavigate({ section: "moderation", moderationTab: "content" })}>
                          Restore Event
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : null}
                {selected.category === "Reports" ? (
                  <button type="button" className="cq-admin-action cq-admin-action--default" onClick={() => navigateFromResult(selected)}>
                    Open Report Queue
                  </button>
                ) : null}
                <button type="button" className="text-xs text-white/50 hover:text-white/75" onClick={() => setSelected(null)}>
                  ← Back to results
                </button>
              </div>
            ) : null}

            {!selected ? (
              <>
                {(
                  [
                    ["Users", results?.users ?? []],
                    ["Organizations", results?.organizations ?? []],
                    ["Events", results?.events ?? []],
                    ["Reports", results?.reports ?? []],
                    ["Messages", results?.messages ?? []],
                    ["Audit Logs", results?.auditLogs ?? []],
                  ] as const
                ).map(([category, items]) =>
                  items.length === 0 ? null : (
                    <div key={category}>
                      <p className="sticky top-0 z-10 border-b border-white/10 bg-uri-navy/95 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-white/45">
                        {category} ({items.length})
                      </p>
                      {items.map((item) => {
                        const flat = flatResults.find((entry) => entry.item === item);
                        if (!flat) return null;
                        const index = flatResults.indexOf(flat);
                        return (
                          <div
                            key={flat.key}
                            className={`cq-admin-search-result flex items-center gap-2 px-4 py-3 ${index === activeIndex ? "cq-admin-search-result--active" : ""}`}
                          >
                            <button
                              type="button"
                              onClick={() => navigateFromResult(flat)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <ResultRow result={flat} />
                            </button>
                            <button
                              type="button"
                              aria-label="Quick actions"
                              onClick={() => chooseResult(flat)}
                              className="shrink-0 rounded-lg border border-white/12 px-2 py-1 text-[10px] font-semibold text-white/55 hover:bg-white/8 hover:text-white/80"
                            >
                              Actions
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ),
                )}
              </>
            ) : null}
          </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ResultRow({ result }: { result: FlatResult }) {
  if (result.category === "Users") {
    const user = result.item;
    return (
      <div>
        <p className="text-sm font-semibold text-white">👤 {user.displayName}</p>
        <p className="text-xs text-white/60">@{user.username}{user.level ? ` · Level ${user.level}` : ""}{user.verified ? " · Verified" : ""}</p>
        {user.email ? <p className="text-[11px] text-white/45">{user.email}</p> : null}
      </div>
    );
  }
  if (result.category === "Organizations") {
    const org = result.item;
    return (
      <div>
        <p className="text-sm font-semibold text-white">🏛 {org.name}</p>
        <p className="text-xs text-white/60">{org.category ?? "Organization"}{org.ownerUsername ? ` · @${org.ownerUsername}` : ""}</p>
      </div>
    );
  }
  if (result.category === "Events") {
    const event = result.item;
    return (
      <div>
        <p className="text-sm font-semibold text-white">📅 {event.title}</p>
        <p className="text-xs text-white/60">{event.organizer ?? "Campus event"}{event.startsAt ? ` · ${new Date(event.startsAt).toLocaleDateString()}` : ""}</p>
      </div>
    );
  }
  if (result.category === "Reports") {
    const report = result.item;
    return (
      <div>
        <p className="text-sm font-semibold text-white">🧯 Report #{report.id.slice(0, 8)}</p>
        <p className="text-xs text-white/60">{report.reason} · {report.status} · {report.reportType}</p>
      </div>
    );
  }
  if (result.category === "Messages") {
    const message = result.item;
    return (
      <div>
        <p className="text-sm font-semibold text-white">💬 Message</p>
        <p className="text-xs text-white/60 line-clamp-1">{message.contentPreview}</p>
      </div>
    );
  }
  const audit = result.item;
  return (
    <div>
      <p className="text-sm font-semibold text-white">🧾 {audit.actionType}</p>
      <p className="text-xs text-white/60">{audit.adminLabel ?? "Admin"}{audit.targetLabel ? ` → ${audit.targetLabel}` : ""}</p>
    </div>
  );
}
