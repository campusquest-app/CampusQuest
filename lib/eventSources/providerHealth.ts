/**
 * Human-readable connection / health status for Event Sources admin cards.
 * Distinguishes configured feeds, successful inventory, failures, and staleness.
 */

export type ProviderHealthStatus =
  | "connected"
  | "syncing"
  | "warning"
  | "failed"
  | "stale"
  | "configuration_required"
  | "not_connected";

export type ProviderHealthInput = {
  source: string;
  configured: boolean;
  activeEventsCount: number;
  lastSuccessfulSync: string | null;
  lastAttemptedSync: string | null;
  lastStatus: string | null;
  lastError: string | null;
  /** When true, a sync request is in-flight for this provider in the UI. */
  syncing?: boolean;
  /** Override stale threshold (ms). Default 48h. */
  staleAfterMs?: number;
  nowMs?: number;
};

const DEFAULT_STALE_MS = 48 * 60 * 60 * 1000;

export function resolveProviderHealth(input: ProviderHealthInput): {
  status: ProviderHealthStatus;
  label: string;
  message: string;
} {
  const now = input.nowMs ?? Date.now();
  const staleAfterMs = input.staleAfterMs ?? DEFAULT_STALE_MS;
  const hasInventory = input.activeEventsCount > 0;
  const lastSuccessMs = input.lastSuccessfulSync ? Date.parse(input.lastSuccessfulSync) : NaN;
  const hasRecentSuccess =
    Number.isFinite(lastSuccessMs) && now - lastSuccessMs <= staleAfterMs;
  const lastStatus = (input.lastStatus ?? "").toLowerCase();
  const lastError = (input.lastError ?? "").trim();
  const skipConfiguredNoise =
    lastError === "feed_not_configured" || /not configured/i.test(lastError);

  if (input.syncing) {
    return {
      status: "syncing",
      label: "Syncing",
      message: "A sync is currently running for this provider.",
    };
  }

  // Missing env/feed config must never read as Stale — that blocks operators from
  // noticing URI_ATHLETICS_FEED_URL (etc.) needs to be set.
  if (!input.configured) {
    const needsConfig =
      input.source === "athletics" ||
      hasInventory ||
      Number.isFinite(lastSuccessMs) ||
      skipConfiguredNoise;
    if (needsConfig) {
      return {
        status: "configuration_required",
        label: "Configuration Required",
        message:
          input.source === "athletics"
            ? "Set URI_ATHLETICS_FEED_URL to the official GoRhody ICS feed, then use Retry Sync."
            : "Provider feed is not configured. Imported data is preserved until a feed is set.",
      };
    }
    return {
      status: "not_connected",
      label: "Not Connected",
      message: "No usable provider feed is configured.",
    };
  }

  if (lastStatus === "failed" && !skipConfiguredNoise) {
    return {
      status: "failed",
      label: "Failed",
      message: "The last sync attempt failed. Open technical details or retry.",
    };
  }

  if (hasRecentSuccess) {
    return {
      status: "connected",
      label: "Connected",
      message: "Feed is configured and syncing successfully.",
    };
  }

  if (hasInventory && Number.isFinite(lastSuccessMs)) {
    if (now - lastSuccessMs > staleAfterMs) {
      return {
        status: "stale",
        label: "Stale",
        message: "Imported events exist, but the last successful sync is older than expected.",
      };
    }
    return {
      status: "connected",
      label: "Connected",
      message: "Provider has successfully imported events.",
    };
  }

  if (hasInventory && !Number.isFinite(lastSuccessMs)) {
    return {
      status: "warning",
      label: "Warning",
      message: "Imported events exist, but no successful sync timestamp is recorded.",
    };
  }

  if (!hasRecentSuccess) {
    if (Number.isFinite(lastSuccessMs)) {
      return {
        status: "stale",
        label: "Stale",
        message: "Feed is configured but has not synced successfully within the expected interval.",
      };
    }
    return {
      status: "warning",
      label: "Warning",
      message: "Feed is configured but has not completed a successful sync yet.",
    };
  }

  return {
    status: "not_connected",
    label: "Not Connected",
    message: "No usable provider feed is configured.",
  };
}

/** Cron: /api/cron/sync-urinvolved at 0 3 * * * (03:00 UTC daily). */
export function estimateNextDailyCronUtc(args: {
  lastSuccessfulSync?: string | null;
  /** When false, caller should display "Not scheduled". */
  scheduled?: boolean;
  cronHourUtc?: number;
  cronMinuteUtc?: number;
  nowMs?: number;
}): string | null {
  if (args.scheduled === false) return null;
  const hour = args.cronHourUtc ?? 3;
  const minute = args.cronMinuteUtc ?? 0;
  const now = args.nowMs ?? Date.now();
  const next = new Date(now);
  next.setUTCHours(hour, minute, 0, 0);
  if (next.getTime() <= now) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.toISOString();
}

function sanitizeTechnicalDiagnostics(raw: string): string {
  return raw
    .replace(/(api[_-]?key|token|secret|password|authorization)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[redacted-connection]")
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted-jwt]");
}

function inferConflictTable(technical: string): "external_organizations" | "external_events" {
  if (/^Org\s+/i.test(technical) || /\bOrg\s+\d+/i.test(technical)) {
    return "external_organizations";
  }
  return "external_events";
}

export function formatAdminSyncErrorSummary(raw: string | null | undefined): {
  title: string;
  summary: string;
  technical: string | null;
} {
  const technical = sanitizeTechnicalDiagnostics((raw ?? "").trim()) || null;
  if (!technical) {
    return { title: "Sync healthy", summary: "No recent sync errors.", technical: null };
  }
  if (/no unique or exclusion constraint matching the ON CONFLICT/i.test(technical)) {
    const tableMatch = technical.match(/\[(external_organizations|external_events)\s+conflict target\s+([^\]]+)\]/i);
    const table = tableMatch?.[1] ?? inferConflictTable(technical);
    const conflictTarget = tableMatch?.[2] ?? "source,external_id";
    return {
      title: "URInvolved Sync Failed",
      summary: `Some records could not be imported. Failing table: ${table}. Conflict target: (${conflictTarget}).`,
      technical,
    };
  }
  if (/\[external_organizations\s+conflict target/i.test(technical)) {
    return {
      title: "URInvolved Sync Failed",
      summary: "Organization import failed (table: external_organizations, conflict target: source,external_id).",
      technical,
    };
  }
  if (/\[external_events\s+conflict target/i.test(technical)) {
    return {
      title: "URInvolved Sync Failed",
      summary: "Event import failed (table: external_events, conflict target: source,external_id).",
      technical,
    };
  }
  if (/rate limit|only request this after/i.test(technical)) {
    return {
      title: "Sync rate limited",
      summary: "The upstream provider asked us to wait before requesting again.",
      technical,
    };
  }
  return {
    title: "Sync Failed",
    summary: "Some records could not be imported.",
    technical,
  };
}
