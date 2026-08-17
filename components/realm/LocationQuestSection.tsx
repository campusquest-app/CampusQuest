"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { CampusLocationId } from "@/lib/locations/registry";
import type { GroupedMapLocation } from "@/lib/mapLocationGroups";
import type { UserQuestBoardItem } from "@/lib/adminQuestTypes";
import { fetchQuestBoardAdminItems, completeAdminQuestRequest } from "@/lib/client/questBoardClient";
import { QuestCard } from "@/components/quests/QuestCard";
import { refreshPlayerSnapshotFromServer } from "@/lib/client/refreshPlayerSnapshot";
import { mergeLocationQuestCards } from "@/lib/realm/locationQuestDedupe";

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

export function LocationQuestSection({
  locationId,
  mapContent,
  reloadToken = 0,
  embedded = false,
  onStateChange,
}: {
  locationId: CampusLocationId;
  mapContent: Pick<GroupedMapLocation, "quests" | "qrCodes"> | null;
  reloadToken?: number;
  embedded?: boolean;
  onStateChange?: (state: { count: number; loading: boolean }) => void;
}) {
  const [quests, setQuests] = useState<UserQuestBoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const items = await fetchQuestBoardAdminItems({ locationId, filter: "active" });
      setQuests(items.filter((item) => item.status !== "completed"));
    } catch {
      setQuests([]);
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const handleClaim = useCallback(
    async (item: UserQuestBoardItem) => {
      setClaimingId(item.id);
      try {
        await completeAdminQuestRequest(item.id);
        await refreshPlayerSnapshotFromServer();
        await load();
      } finally {
        setClaimingId(null);
      }
    },
    [load],
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
    onStateChange?.({ count: questCards.length, loading });
  }, [loading, onStateChange, questCards.length]);

  if (!loading && questCards.length === 0) return null;

  return (
    <div
      className={`cq-realm-location-quests cq-realm-fade-in${
        embedded ? " cq-realm-location-quests--embedded" : ""
      }`}
      aria-label="Active quests"
    >
      {!embedded ? (
        <div className="cq-realm-location-quests-head">
          <Sparkles className="h-4 w-4 text-uri-keaney" aria-hidden />
          <h3 className="cq-realm-location-quests-title">Active Quests</h3>
        </div>
      ) : null}

      {loading ? (
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
