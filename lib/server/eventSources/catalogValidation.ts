/**
 * Validate a fetched provider catalog before any inventory write.
 * Count checks live in syncSafety; this verifies representative records.
 */

const PAST_GRACE_MS = 2 * 60 * 60 * 1000;
const SAMPLE_TARGET = 20;
const MIN_UPCOMING_RATIO = 0.3;

export type ProviderCatalogRecord = {
  externalId?: string | null;
  title?: string | null;
  startsAt?: string | null;
  locationName?: string | null;
  venueName?: string | null;
  address?: string | null;
  eventUrl?: string | null;
};

export type CatalogValidationResult = {
  valid: boolean;
  reason: "validation_failed" | null;
  detail: string | null;
  sampled: number;
};

function pickRepresentativeRecords<T>(records: T[], target = SAMPLE_TARGET): T[] {
  if (records.length <= target) return records;
  const sample: T[] = [];
  const seen = new Set<number>();
  const push = (index: number) => {
    const clamped = Math.min(Math.max(index, 0), records.length - 1);
    if (seen.has(clamped)) return;
    seen.add(clamped);
    const row = records[clamped];
    if (row) sample.push(row);
  };
  push(0);
  push(records.length - 1);
  const step = Math.max(1, Math.floor(records.length / target));
  for (let i = 0; i < records.length && sample.length < target; i += step) {
    push(i);
  }
  return sample;
}

function isValidIsoDate(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

function locationIfPresent(value: string | null | undefined): boolean {
  if (value == null) return true;
  return value.trim().length > 0;
}

export function validateProviderCatalogRecords(
  records: ProviderCatalogRecord[],
  nowMs = Date.now(),
): CatalogValidationResult {
  if (records.length === 0) {
    return { valid: true, reason: null, detail: null, sampled: 0 };
  }

  const sample = pickRepresentativeRecords(records);
  for (const record of sample) {
    if (!record.externalId?.trim()) {
      return {
        valid: false,
        reason: "validation_failed",
        detail: "Representative record is missing a source ID.",
        sampled: sample.length,
      };
    }
    if (!record.title?.trim()) {
      return {
        valid: false,
        reason: "validation_failed",
        detail: "Representative record is missing a title.",
        sampled: sample.length,
      };
    }
    if (!isValidIsoDate(record.startsAt)) {
      return {
        valid: false,
        reason: "validation_failed",
        detail: "Representative record has an invalid or missing start date.",
        sampled: sample.length,
      };
    }
    if (
      !locationIfPresent(record.locationName) ||
      !locationIfPresent(record.venueName) ||
      !locationIfPresent(record.address)
    ) {
      return {
        valid: false,
        reason: "validation_failed",
        detail: "Representative record has an empty location field.",
        sampled: sample.length,
      };
    }
  }

  const upcomingCutoff = nowMs - PAST_GRACE_MS;
  const upcomingCount = records.filter((record) => {
    if (!record.startsAt) return false;
    const ms = Date.parse(record.startsAt);
    return Number.isFinite(ms) && ms >= upcomingCutoff;
  }).length;
  const upcomingRatio = upcomingCount / records.length;
  if (records.length >= 10 && upcomingRatio < MIN_UPCOMING_RATIO) {
    return {
      valid: false,
      reason: "validation_failed",
      detail: `Catalog dates are implausible (${upcomingCount}/${records.length} upcoming).`,
      sampled: sample.length,
    };
  }

  return { valid: true, reason: null, detail: null, sampled: sample.length };
}
