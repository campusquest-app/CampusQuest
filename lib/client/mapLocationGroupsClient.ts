"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAuthed } from "@/lib/client/dashboardApi";
import type { GroupedMapLocation } from "@/lib/mapLocationGroups";
import { dedupeLogicalMapEvents } from "@/lib/realm/dedupeLogicalEvents";
import { filterVisibleMapEvents } from "@/lib/realm/eventVisibility";
import { markRealmMapStep } from "@/lib/realm/realmMapLifecycle";

/**
 * Drop events past their 24h post-end visibility window. The server already
 * filters, but this re-applies the rule with the current clock on every
 * reload (map load, foreground return, 60s poll) so stale cached responses
 * can't resurrect expired pins.
 */
function withVisibleEvents(groups: GroupedMapLocation[]): GroupedMapLocation[] {
  const now = new Date();
  return groups.map((group) =>
    group.events.length > 0
      ? { ...group, events: dedupeLogicalMapEvents(filterVisibleMapEvents(group.events, now)) }
      : group,
  );
}

export function useGroupedMapLocations(options?: { active?: boolean }) {
  const active = options?.active ?? true;
  const [groups, setGroups] = useState<GroupedMapLocation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const reload = useCallback(async (signal?: AbortSignal) => {
    markRealmMapStep("data-fetch-start", { source: "map-pins" });
    try {
      const data = await fetchAuthed<{ groups: GroupedMapLocation[] }>("/api/quests/map-pins", { signal });
      if (signal?.aborted) return;
      setGroups(withVisibleEvents(data.groups ?? []));
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setGroups([]);
    } finally {
      if (!signal?.aborted) {
        setLoaded(true);
        markRealmMapStep("data-fetch-end", { source: "map-pins" });
      }
    }
  }, []);

  useEffect(() => {
    if (!active) {
      abortRef.current?.abort();
      abortRef.current = null;
      return undefined;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    void reload(controller.signal);

    const interval = window.setInterval(() => {
      const poll = new AbortController();
      abortRef.current?.abort();
      abortRef.current = poll;
      void reload(poll.signal);
    }, 60_000);

    const onFocus = () => {
      const focus = new AbortController();
      abortRef.current?.abort();
      abortRef.current = focus;
      void reload(focus.signal);
    };
    window.addEventListener("focus", onFocus);

    // Mobile browsers fire visibilitychange (not focus) when the app returns
    // to the foreground — recompute event visibility immediately.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") onFocus();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      controller.abort();
      abortRef.current = null;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [reload, active]);

  return { groups, loaded, reload };
}
