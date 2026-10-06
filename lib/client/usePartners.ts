"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAuthed } from "@/lib/client/dashboardApi";
import type { Partner, PartnersResponse } from "@/lib/partners/types";

export type PartnersLoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; partners: Partner[] };

export function usePartners(): { state: PartnersLoadState; reload: () => void } {
  const [state, setState] = useState<PartnersLoadState>({ status: "loading" });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetchAuthed<PartnersResponse>("/api/partners", { signal: controller.signal })
      .then((data) => {
        setState({ status: "ready", partners: Array.isArray(data?.partners) ? data.partners : [] });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: error instanceof Error && error.message ? error.message : "Could not load partners.",
        });
      });
    return () => controller.abort();
  }, [nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { state, reload };
}
