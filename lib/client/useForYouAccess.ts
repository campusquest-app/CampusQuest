"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiRequestError, fetchAuthed } from "@/lib/client/dashboardApi";
import type { ForYouAccessStatus } from "@/lib/basic/forYouAccess";

export function useForYouAccess(): { status: ForYouAccessStatus; reload: () => void } {
  const [status, setStatus] = useState<ForYouAccessStatus>("loading");
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => {
    setStatus("loading");
    setNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await fetchAuthed<{ entitled: true }>("/api/events/for-you");
        if (!cancelled) setStatus("active");
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiRequestError && error.code === "UPGRADE_REQUIRED") {
          setStatus("inactive");
          return;
        }
        setStatus((current) => (current === "active" || current === "inactive" ? current : "unknown"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  useEffect(() => {
    function refreshWhenVisible() {
      if (document.visibilityState === "hidden") return;
      setNonce((value) => value + 1);
    }
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  return { status, reload };
}
