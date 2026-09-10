import { sanitizeTechnicalDiagnostics } from "@/lib/eventSources/providerHealth";
import { EVENT_SCHEMA_INCOMPATIBLE_CODE } from "@/lib/server/eventSources/schemaHealth";

export const PROVIDER_INCIDENT_TYPES = [
  "provider_fetch_failure",
  "schema_incompatible",
  "missing_migration",
  "configuration_missing",
  "authentication_failure",
  "parser_failure",
  "rate_limit",
  "database_failure",
  "deployment_required",
  "unknown",
] as const;

export type ProviderIncidentType = (typeof PROVIDER_INCIDENT_TYPES)[number];

export const PROVIDER_INCIDENT_STATUSES = [
  "detected",
  "diagnosing",
  "repairing",
  "awaiting_deployment",
  "verifying",
  "resolved",
  "manual_review_required",
  "failed_repair",
] as const;

export type ProviderIncidentStatus = (typeof PROVIDER_INCIDENT_STATUSES)[number];

export type ClassifiedProviderIncident = {
  type: ProviderIncidentType;
  errorCode: string;
  autoRepairable: boolean;
  summary: string;
};

export function classifyProviderIncident(raw: string | null | undefined): ClassifiedProviderIncident {
  const technical = sanitizeTechnicalDiagnostics((raw ?? "").trim());
  const text = technical.toLowerCase();

  if (!technical) {
    return {
      type: "unknown",
      errorCode: "UNKNOWN",
      autoRepairable: false,
      summary: "No error details were recorded.",
    };
  }

  if (/could not find the function|pgrst202|42883|health rpc missing/i.test(technical)) {
    return {
      type: "missing_migration",
      errorCode: EVENT_SCHEMA_INCOMPATIBLE_CODE,
      autoRepairable: false,
      summary: "Identity-invariant health/repair RPC is missing. Apply the self-healing migration once.",
    };
  }

  if (
    technical.includes(EVENT_SCHEMA_INCOMPATIBLE_CODE) ||
    /no unique or exclusion constraint matching the on conflict/i.test(technical) ||
    /42p10/.test(text)
  ) {
    const table = /external_organizations/i.test(technical) || /^org\s+/i.test(technical)
      ? "external_organizations"
      : /external_events/i.test(technical)
        ? "external_events"
        : "external_events/organizations";
    return {
      type: "schema_incompatible",
      errorCode: EVENT_SCHEMA_INCOMPATIBLE_CODE,
      autoRepairable: true,
      summary: `${EVENT_SCHEMA_INCOMPATIBLE_CODE}: ${table} requires UNIQUE(source, external_id).`,
    };
  }

  if (
    /inventory collapsed|athletics-only|suspicious_empty_catalog|suspicious_inventory_drop|last-known-good/i.test(
      technical,
    )
  ) {
    return {
      type: "provider_fetch_failure",
      errorCode: "PROVIDER_FETCH_FAILURE",
      autoRepairable: true,
      summary: "Provider catalog was unhealthy. Existing inventory is preserved.",
    };
  }

  if (/feed_not_configured|uri_athletics_feed_url|not configured/i.test(technical)) {
    return {
      type: "configuration_missing",
      errorCode: "CONFIGURATION_MISSING",
      autoRepairable: false,
      summary: "Set URI_ATHLETICS_FEED_URL to the official GoRhody ICS feed. Existing Athletics events are preserved.",
    };
  }

  if (/unauthorized|401|403|authentication|invalid cron secret|missing bearer/i.test(technical)) {
    return {
      type: "authentication_failure",
      errorCode: "AUTHENTICATION_FAILURE",
      autoRepairable: false,
      summary: "Provider or internal authentication failed after limited retries.",
    };
  }

  if (/rate limit|429|only request this after/i.test(technical)) {
    return {
      type: "rate_limit",
      errorCode: "RATE_LIMIT",
      autoRepairable: true,
      summary: "Upstream rate-limited the request. Retry with backoff.",
    };
  }

  if (/malformed|could not be parsed|parser/i.test(technical)) {
    return {
      type: "parser_failure",
      errorCode: "PARSER_FAILURE",
      autoRepairable: false,
      summary: "Upstream payload could not be parsed. Existing inventory is preserved.",
    };
  }

  if (/deadlock|could not serialize|connection terminated|57014|40001|40p01/i.test(text)) {
    return {
      type: "database_failure",
      errorCode: "DATABASE_FAILURE",
      autoRepairable: true,
      summary: "Temporary database error. Existing inventory is preserved.",
    };
  }

  if (/fetch failed|econnreset|etimedout|enotfound|http\s*[45]\d\d|timed out|network/i.test(technical)) {
    return {
      type: "provider_fetch_failure",
      errorCode: "PROVIDER_FETCH_FAILURE",
      autoRepairable: true,
      summary: "Upstream fetch failed. Existing inventory is preserved.",
    };
  }

  return {
    type: "unknown",
    errorCode: "UNKNOWN",
    autoRepairable: false,
    summary: "Unrecognized provider failure. No destructive repair will run.",
  };
}

export function isAutoRepairEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = (env.CQ_AUTO_REPAIR_ENABLED ?? "true").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off";
}

/** Permanent errors: diagnose immediately instead of hammering the sync endpoint. */
export function shouldSkipWatchdogRetries(type: ProviderIncidentType): boolean {
  return (
    type === "schema_incompatible" ||
    type === "missing_migration" ||
    type === "configuration_missing" ||
    type === "parser_failure" ||
    type === "deployment_required"
  );
}
