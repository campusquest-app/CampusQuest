"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AdminRouteSessionGate } from "@/components/AdminRouteSessionGate";
import { QuestQrPrintPoster } from "@/components/admin/QuestQrPrintPoster";
import type { AdminQuestLinkedQr, AdminQuestRow } from "@/lib/adminQuestTypes";
import { fetchAuthed } from "@/lib/client/dashboardApi";
import { resolveQuestQrScanUrl } from "@/lib/client/qrCodeAdminClient";

type QuestListItem = {
  quest: AdminQuestRow;
  linkedQr: AdminQuestLinkedQr | null;
};

export default function QuestQrPrintPage() {
  // useSearchParams requires a Suspense boundary for static prerendering.
  return (
    <Suspense fallback={<main className="min-h-screen bg-uri-navy" />}>
      <QuestQrPrintContent />
    </Suspense>
  );
}

function QuestQrPrintContent() {
  const searchParams = useSearchParams();
  const questId = searchParams.get("questId") ?? "";
  const [item, setItem] = useState<QuestListItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!questId) {
      setError("Missing questId.");
      return;
    }
    let cancelled = false;
    void fetchAuthed<{ quests: QuestListItem[] }>("/api/internal/admin/quests")
      .then((data) => {
        if (cancelled) return;
        const match = (data.quests ?? []).find((row) => row.quest.id === questId) ?? null;
        if (!match?.linkedQr) {
          setError("Quest QR code not found.");
          return;
        }
        setItem(match);
        window.setTimeout(() => window.print(), 350);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load quest.");
      });
    return () => {
      cancelled = true;
    };
  }, [questId]);

  const posterData = useMemo(() => {
    if (!item?.linkedQr) return null;
    const scanUrl = resolveQuestQrScanUrl(item.linkedQr);
    if (!scanUrl) return null;
    return {
      questName: item.quest.name,
      locationName: item.quest.location_name,
      xpReward: item.quest.xp_reward,
      scanUrl,
    };
  }, [item]);

  return (
    <AdminRouteSessionGate title="Print quest QR">
      <main className="min-h-screen bg-uri-navy px-4 py-8 print:bg-white print:py-4">
        <div className="mx-auto max-w-lg space-y-4 print:max-w-none">
          <Link
            href="/internal/admin"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-white/90 hover:bg-white/10 print:hidden"
          >
            ← Admin
          </Link>

          {error ? <p className="text-sm text-rose-200 print:text-rose-700">{error}</p> : null}
          {!posterData && !error ? <p className="text-sm text-white/60 print:text-black/60">Loading printable QR…</p> : null}
          {posterData ? <QuestQrPrintPoster data={posterData} /> : null}

          <div className="flex justify-center gap-2 print:hidden">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white"
            >
              Print
            </button>
          </div>
        </div>
      </main>
    </AdminRouteSessionGate>
  );
}
