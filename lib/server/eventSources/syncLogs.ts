import { createAdminClient } from "@/lib/server/supabase";
import type { EventSourceType } from "@/lib/eventSources/types";

type AdminClient = ReturnType<typeof createAdminClient>;

export type SyncLogPatch = {
  status: "success" | "failed";
  events_created: number;
  events_updated: number;
  orgs_created: number;
  orgs_updated: number;
  events_received?: number;
  duplicates_merged?: number;
  error_count?: number;
  error_message?: string | null;
};

export async function startProviderSyncLog(
  admin: AdminClient,
  source: EventSourceType | string,
  syncType: string,
) {
  const { data, error } = await admin
    .from("sync_logs")
    .insert({
      source,
      sync_type: syncType,
      status: "running",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not start sync log.");
  return data as { id: string };
}

export async function finishProviderSyncLog(admin: AdminClient, logId: string, patch: SyncLogPatch) {
  await admin
    .from("sync_logs")
    .update({
      status: patch.status,
      events_created: patch.events_created,
      events_updated: patch.events_updated,
      orgs_created: patch.orgs_created,
      orgs_updated: patch.orgs_updated,
      events_received: patch.events_received ?? 0,
      duplicates_merged: patch.duplicates_merged ?? 0,
      error_count: patch.error_count ?? 0,
      error_message: patch.error_message ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", logId);
}

export type LatestSourceSync = {
  source: string;
  lastSuccessfulSync: string | null;
  lastAttemptedSync: string | null;
  lastStatus: string | null;
  lastError: string | null;
  eventsReceived: number;
  eventsCreated: number;
  eventsUpdated: number;
  duplicatesMerged: number;
};

export async function getLatestSyncBySource(admin: AdminClient, source: string): Promise<LatestSourceSync> {
  const { data } = await admin
    .from("sync_logs")
    .select(
      "status, started_at, finished_at, error_message, events_created, events_updated, events_received, duplicates_merged",
    )
    .eq("source", source)
    .order("started_at", { ascending: false })
    .limit(20);

  const rows = data ?? [];
  const last = rows[0] ?? null;
  const lastSuccess = rows.find((row) => row.status === "success") ?? null;
  return {
    source,
    lastSuccessfulSync: lastSuccess?.finished_at ?? lastSuccess?.started_at ?? null,
    lastAttemptedSync: last?.started_at ?? null,
    lastStatus: last?.status ?? null,
    lastError: last?.status === "failed" ? (last.error_message as string | null) ?? null : null,
    eventsReceived: Number(last?.events_received ?? 0),
    eventsCreated: Number(last?.events_created ?? 0),
    eventsUpdated: Number(last?.events_updated ?? 0),
    duplicatesMerged: Number(last?.duplicates_merged ?? 0),
  };
}
