/**
 * Leftover helper for the unused public.cq_basic_access table.
 * CampusQuest 1.0 does not sell Basic, subscriptions, or any paid digital
 * feature. Do not use this module to gate For You or any user-facing surface.
 */

export type BasicAccessRow = {
  starts_at: string;
  ends_at: string;
  early_access: boolean;
};

export type BasicEntitlement = {
  /** True while starts_at <= now < ends_at. */
  active: boolean;
  /** True only when the stored flag is set and the access window is active. */
  earlyAccess: boolean;
  startsAt: string | null;
  endsAt: string | null;
  /** False when the access row could not be read. A missing row is known. */
  known: boolean;
};

export const INACTIVE_BASIC_ENTITLEMENT: BasicEntitlement = {
  active: false,
  earlyAccess: false,
  startsAt: null,
  endsAt: null,
  known: true,
};

export function basicEntitlement(row: BasicAccessRow | null, now: Date): BasicEntitlement {
  if (!row) return INACTIVE_BASIC_ENTITLEMENT;
  const startsMs = new Date(row.starts_at).getTime();
  const endsMs = new Date(row.ends_at).getTime();
  const nowMs = now.getTime();
  const active = !Number.isNaN(startsMs) && !Number.isNaN(endsMs) && startsMs <= nowMs && nowMs < endsMs;
  return {
    active,
    earlyAccess: active && row.early_access === true,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    known: true,
  };
}

export function unknownBasicEntitlement(): BasicEntitlement {
  return { ...INACTIVE_BASIC_ENTITLEMENT, known: false };
}
