"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAuthed } from "@/lib/client/dashboardApi";
import type { GroupedMapLocation } from "@/lib/mapLocationGroups";

export function useGroupedMapLocations() {
  const [groups, setGroups] = useState<GroupedMapLocation[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const data = await fetchAuthed<{ groups: GroupedMapLocation[] }>("/api/quests/map-pins");
      setGroups(data.groups ?? []);
    } catch {
      setGroups([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void reload();
    const interval = window.setInterval(() => void reload(), 60_000);
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [reload]);

  return { groups, loaded, reload };
}
