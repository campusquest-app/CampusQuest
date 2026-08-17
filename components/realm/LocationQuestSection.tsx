"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { CampusLocationId } from "@/lib/locations/registry";
import type { GroupedMapLocation } from "@/lib/mapLocationGroups";
import type { UserQuestBoardItem } from "@/lib/adminQuestTypes";
import { fetchQuestBoardAdminItems, completeAdminQuestRequest } from "@/lib/client/questBoardClient";
import { QuestCard } from "@/components/quests/QuestCard";
import { refreshPlayerSnapshotFromServer } from "@/lib/client/refreshPlayerSnapshot";
import { mergeLocationQuestCards } from "@/lib/realm/locationQuestDedupe";
import {
  shouldRenderQuestList,
  shouldShowQuestSkeleton,
} from "@/lib/realm/locationSheetLoading";

function QrQuestCard({ qr }: { qr: GroupedMapLocation["qrCodes"][number] }) {
  return (
    <article className="cq-quest-card group relative flex flex-col overflow-hidden rounded-2xl border border-cq-border bg-cq-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-cq-subtle">QR check-in</span>
        <span className="text-[10px] font-bold uppercase tracking-wide text-uri-keaney">Scan</span>
      </div>
      <div className="flex items-start gap-3">
        <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl border border-cq-border bg-cq-elevated text-2xl">
          📷
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-bold leading-tight text-cq-foreground">{qr.name}</h3>
          {qr.description ? <p className="mt-1 text-[12px] leading-snug text-cq-muted">{qr.description}</p> : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded-lg border border-uri-gold/35 bg-uri-gold/10 px-2 py-1 text-[11px] font-bold text-uri-gold">
          +{qr.xpReward} XP
        </span>
      </div>
      <Link
        href={qr.scanPath}
        className="cq-quest-claim mt-4 block w-full rounded-xl bg-gradient-to-b from-uri-gold to-amber-600 py-2.5 text-center text-sm font-bold text-uri-navy shadow-lg transition hover:brightness-110"
      >
        Scan QR
      </Link>
    </article>
  );
}

export type LocationQuestSectionState = {
  count: number;
  /** True only during the first unresolved fetch for the current location. */
  initialLoading: boolean;
  loaded: boolean;
};

export function LocationQuestSection({
  locationId,
  mapContent,
  reloadToken = 0,
  embedded = false,
  /** When true, fetch/report state but render nothing (parent owns layout). */
  silent = false,
  /** When false, never show skeleton cards (background refresh / empty-first paint). */
  showSkeleton = true,
  onStateChange,
}: {
  locationId: CampusLocationId;
  mapContent: Pick<GroupedMapLocation, "quests" | "qrCodes"> | null;
  reloadToken?: number;
  embedded?: boolean;
  silent?: boolean;
  showSkeleton?: boolean;
  onStateChange?: (state: LocationQuestSectionState) => void;
}) {
  const [quests, setQuests] = useState<UserQuestBoardItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const loadedLocationRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);
  const activeLocationRef = useRef(locationId);
  activeLocationRef.current = locationId;
  // Ignore the reloadToken value present at mount — locationId effect already
  // performs the first fetch. Only react to later bumps (pull-to-refresh, etc.).
  const reloadTokenAtMountRef = useRef(reloadToken);

  const load = useCallback(
    async (forLocationId: CampusLocationId, opts?: { background?: boolean }) => {
      const background =
        Boolean(opts?.background) || loadedLocationRef.current === forLocationId;
      if (!background) {
        setInitialLoading(true);
        setLoaded(false);
      }
      const requestId = ++requestIdRef.current;
      try {
        const items = await fetchQuestBoardAdminItems({ locationId: forLocationId, filter: "active" });
        if (requestId !== requestIdRef.current) return;
        if (activeLocationRef.current !== forLocationId) return;
        setQuests(items.filter((item) => item.status !== "completed"));
      } catch {
        if (requestId !== requestIdRef.current) return;
        if (activeLocationRef.current !== forLocationId) return;
        if (!background) setQuests([]);
      } finally {
        if (requestId !== requestIdRef.current) return;
        if (activeLocationRef.current !== forLocationId) return;
        loadedLocationRef.current = forLocationId;
        setLoaded(true);
        setInitialLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    loadedLocationRef.current = null;
    setQuests([]);
    setLoaded(false);
    setInitialLoading(true);
    void load(locationId, { background: false });
  }, [locationId, load]);

  useEffect(() => {
    if (reloadToken <= 0) return;
    if (reloadToken === reloadTokenAtMountRef.current) return;
    reloadTokenAtMountRef.current = reloadToken;
    void load(locationId, { background: true });
  }, [reloadToken, load, locationId]);

  const handleClaim = useCallback(
    async (item: UserQuestBoardItem) => {
      setClaimingId(item.id);
      try {
        await completeAdminQuestRequest(item.id);
        await refreshPlayerSnapshotFromServer();
        await load(locationId, { background: true });
      } finally {
        setClaimingId(null);
      }
    },
    [load, locationId],
  );

  const questCards = useMemo(
    () =>
      mergeLocationQuestCards({
        qrCodes: mapContent?.qrCodes ?? [],
        mapQuests: mapContent?.quests ?? [],
        boardQuests: quests,
        locationId,
      }),
    [locationId, mapContent?.qrCodes, mapContent?.quests, quests],
  );

  useEffect(() => {
    onStateChange?.({
      count: questCards.length,
      initialLoading,
      loaded,
    });
  }, [initialLoading, loaded, onStateChange, questCards.length]);

  if (silent) return null;

  const showLoadingSkeleton = shouldShowQuestSkeleton({
    showSkeleton,
    initialLoading,
    questCount: questCards.length,
  });
  if (
    !shouldRenderQuestList({
      showSkeleton,
      initialLoading,
      questCount: questCards.length,
    })
  ) {
    return null;
  }

  return (
    <div
      className={`cq-realm-location-quests${embedded ? " cq-realm-location-quests--embedded" : ""}`}
      aria-label="Active quests"
      aria-busy={showLoadingSkeleton}
    >
      {!embedded ? (
        <div className="cq-realm-location-quests-head">
          <Sparkles className="h-4 w-4 text-uri-keaney" aria-hidden />
          <h3 className="cq-realm-location-quests-title">Active Quests</h3>
        </div>
      ) : null}

      {showLoadingSkeleton ? (
        <div className="cq-realm-location-quests-list" aria-busy="true">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="cq-realm-location-quest-skeleton" />
          ))}
        </div>
      ) : (
        <div className="cq-realm-location-quests-list">
          {questCards.map((card) =>
            card.kind === "qr" ? (
              <QrQuestCard key={`qr-${card.qr.id}`} qr={card.qr} />
            ) : (
              <QuestCard
                key={`quest-${card.item.id}`}
                item={card.item}
                onClaim={handleClaim}
                claiming={claimingId === card.item.id}
                compact
                scanPath={card.scanPath}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}
