import { createAdminClient } from "@/lib/server/supabase";
import { sanitizeTechnicalDiagnostics } from "@/lib/eventSources/providerHealth";
import type {
  ProviderIncidentStatus,
  ProviderIncidentType,
} from "@/lib/server/eventSources/incidentTypes";

type AdminClient = ReturnType<typeof createAdminClient>;

export type ProviderIncidentRow = {
  id: string;
  provider: string;
  incident_type: ProviderIncidentType;
  error_code: string | null;
  error_message: string | null;
  technical_details: string | null;
  detected_at: string;
  last_success_at: string | null;
  attempted_at: string | null;
  resolved_at: string | null;
  status: ProviderIncidentStatus;
  repair_action: string | null;
  repair_attempts: number;
  deployment_commit: string | null;
  inventory_before: Record<string, unknown>;
  inventory_after: Record<string, unknown>;
  metadata: Record<string, unknown>;
  updated_at: string;
};

function mapRow(row: Record<string, unknown>): ProviderIncidentRow {
  return {
    id: String(row.id),
    provider: String(row.provider),
    incident_type: row.incident_type as ProviderIncidentType,
    error_code: (row.error_code as string | null) ?? null,
    error_message: (row.error_message as string | null) ?? null,
    technical_details: (row.technical_details as string | null) ?? null,
    detected_at: String(row.detected_at),
    last_success_at: (row.last_success_at as string | null) ?? null,
    attempted_at: (row.attempted_at as string | null) ?? null,
    resolved_at: (row.resolved_at as string | null) ?? null,
    status: row.status as ProviderIncidentStatus,
    repair_action: (row.repair_action as string | null) ?? null,
    repair_attempts: Number(row.repair_attempts ?? 0),
    deployment_commit: (row.deployment_commit as string | null) ?? null,
    inventory_before: (row.inventory_before as Record<string, unknown>) ?? {},
    inventory_after: (row.inventory_after as Record<string, unknown>) ?? {},
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

function isMissingRelation(error: { message?: string; code?: string } | null | undefined): boolean {
  const message = (error?.message ?? "").toLowerCase();
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    (message.includes("provider_incidents") &&
      (message.includes("does not exist") || message.includes("could not find")))
  );
}

export async function createProviderIncident(
  admin: AdminClient,
  input: {
    provider: string;
    incidentType: ProviderIncidentType;
    errorCode?: string | null;
    errorMessage?: string | null;
    technicalDetails?: string | null;
    lastSuccessAt?: string | null;
    inventoryBefore?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    status?: ProviderIncidentStatus;
  },
): Promise<ProviderIncidentRow | null> {
  const now = new Date().toISOString();
  const row = {
    provider: input.provider,
    incident_type: input.incidentType,
    error_code: input.errorCode ?? null,
    error_message: sanitizeTechnicalDiagnostics(input.errorMessage ?? "") || null,
    technical_details: sanitizeTechnicalDiagnostics(input.technicalDetails ?? "") || null,
    last_success_at: input.lastSuccessAt ?? null,
    status: input.status ?? "detected",
    inventory_before: input.inventoryBefore ?? {},
    metadata: input.metadata ?? {},
    detected_at: now,
    updated_at: now,
  };
  try {
    const { data, error } = await admin.from("provider_incidents").insert(row).select("*").maybeSingle();
    if (error) {
      if (error.code === "23505") return null;
      if (!isMissingRelation(error)) {
        console.warn("[cq:provider-recovery]", {
          system: "provider-recovery",
          result: "incident_insert_failed",
          error: error.message,
        });
      }
      return null;
    }
    return data ? mapRow(data as Record<string, unknown>) : null;
  } catch (error) {
    console.warn("[cq:provider-recovery]", {
      system: "provider-recovery",
      result: "incident_insert_threw",
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function updateProviderIncident(
  admin: AdminClient,
  id: string,
  patch: Partial<{
    status: ProviderIncidentStatus;
    repair_action: string | null;
    repair_attempts: number;
    attempted_at: string | null;
    resolved_at: string | null;
    inventory_after: Record<string, unknown>;
    metadata: Record<string, unknown>;
    error_message: string | null;
    technical_details: string | null;
    deployment_commit: string | null;
  }>,
): Promise<void> {
  try {
    const sanitized = { ...patch, updated_at: new Date().toISOString() };
    if (typeof sanitized.error_message === "string") {
      sanitized.error_message = sanitizeTechnicalDiagnostics(sanitized.error_message);
    }
    if (typeof sanitized.technical_details === "string") {
      sanitized.technical_details = sanitizeTechnicalDiagnostics(sanitized.technical_details);
    }
    const { error } = await admin.from("provider_incidents").update(sanitized).eq("id", id);
    if (error && !isMissingRelation(error)) {
      console.warn("[cq:provider-recovery]", {
        system: "provider-recovery",
        incident_id: id,
        result: "incident_update_failed",
        error: error.message,
      });
    }
  } catch (error) {
    console.warn("[cq:provider-recovery]", {
      system: "provider-recovery",
      incident_id: id,
      result: "incident_update_threw",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function listProviderIncidents(
  admin: AdminClient,
  opts?: { provider?: string; limit?: number },
): Promise<ProviderIncidentRow[]> {
  try {
    let query = admin.from("provider_incidents").select("*").order("detected_at", { ascending: false });
    if (opts?.provider) query = query.eq("provider", opts.provider);
    query = query.limit(opts?.limit ?? 25);
    const { data, error } = await query;
    if (error) {
      if (!isMissingRelation(error)) {
        console.warn("[cq:provider-recovery]", { result: "incident_list_failed", error: error.message });
      }
      return [];
    }
    return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
  } catch {
    return [];
  }
}

export async function findRecentActiveIncident(
  admin: AdminClient,
  provider: string,
  withinMs = 6 * 60 * 60 * 1000,
): Promise<ProviderIncidentRow | null> {
  try {
    const cutoff = new Date(Date.now() - withinMs).toISOString();
    const { data, error } = await admin
      .from("provider_incidents")
      .select("*")
      .eq("provider", provider)
      .in("status", [
        "detected",
        "diagnosing",
        "repairing",
        "awaiting_deployment",
        "verifying",
        "manual_review_required",
        "failed_repair",
      ])
      .gte("detected_at", cutoff)
      .order("detected_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return mapRow(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function findOpenRepairIncident(
  admin: AdminClient,
  provider: string,
): Promise<ProviderIncidentRow | null> {
  try {
    const { data, error } = await admin
      .from("provider_incidents")
      .select("*")
      .eq("provider", provider)
      .in("status", ["diagnosing", "repairing", "awaiting_deployment", "verifying"])
      .order("detected_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return mapRow(data as Record<string, unknown>);
  } catch {
    return null;
  }
}
