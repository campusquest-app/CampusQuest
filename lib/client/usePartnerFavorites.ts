"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiRequestError } from "@/lib/client/dashboardApi";
import { errorMessage, fetchPartnerFavorites, removePartnerFavorite, savePartnerFavorite } from "@/lib/client/partnersApi";

export type PartnerFavoritesStatus = "loading" | "ready" | "unavailable" | "error";

export type PartnerFavoritesState = {
  status: PartnerFavoritesStatus;
  ids: ReadonlySet<string>;
  pending: ReadonlySet<string>;
  message: string | null;
};

export type PartnerFavoritesController = PartnerFavoritesState & {
  isSaved: (partnerId: string) => boolean;
  toggle: (partnerId: string) => void;
  clearMessage: () => void;
};

function isUnavailable(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.status === 503 || error.status === 401);
}

/** Saved businesses for the signed-in user, persisted in Supabase. Optimistic with rollback on failure. */
export function usePartnerFavorites(): PartnerFavoritesController {
  const [status, setStatus] = useState<PartnerFavoritesStatus>("loading");
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const [message, setMessage] = useState<string | null>(null);
  const idsRef = useRef(ids);
  idsRef.current = ids;

  useEffect(() => {
    let cancelled = false;
    fetchPartnerFavorites()
      .then((data) => {
        if (cancelled) return;
        setIds(new Set(Array.isArray(data?.partnerIds) ? data.partnerIds : []));
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus(isUnavailable(error) ? "unavailable" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback((partnerId: string) => {
    const wasSaved = idsRef.current.has(partnerId);
    const apply = (saved: boolean) =>
      setIds((current) => {
        const next = new Set(current);
        if (saved) next.add(partnerId);
        else next.delete(partnerId);
        return next;
      });
    apply(!wasSaved);
    setMessage(null);
    setPending((current) => new Set(current).add(partnerId));
    const request = wasSaved ? removePartnerFavorite(partnerId) : savePartnerFavorite(partnerId);
    request
      .then((data) => {
        if (Array.isArray(data?.partnerIds)) setIds(new Set(data.partnerIds));
        setStatus("ready");
      })
      .catch((error: unknown) => {
        apply(wasSaved);
        if (isUnavailable(error)) setStatus("unavailable");
        setMessage(
          errorMessage(error, wasSaved ? "Couldn\u2019t remove this business. Try again." : "Couldn\u2019t save this business. Try again."),
        );
      })
      .finally(() => {
        setPending((current) => {
          const next = new Set(current);
          next.delete(partnerId);
          return next;
        });
      });
  }, []);

  const isSaved = useCallback((partnerId: string) => ids.has(partnerId), [ids]);
  const clearMessage = useCallback(() => setMessage(null), []);

  return { status, ids, pending, message, isSaved, toggle, clearMessage };
}
