/** One row per business for a Community visit. Repeating a business in the same visit does not add another view. */
export function uniquePartnerIds(partnerIds: readonly string[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const partnerId of partnerIds) {
    if (!partnerId || seen.has(partnerId)) continue;
    seen.add(partnerId);
    ids.push(partnerId);
  }
  return ids;
}

/**
 * Dashboard totals. The same visit id is idempotent, including a retried request.
 * A different visit id counts again. Featured and Explore copies of one business share one id.
 */
export function countBusinessViews(visits: { visitId: string; partnerIds: readonly string[] }[]): Record<string, number> {
  const seen = new Set<string>();
  const counts: Record<string, number> = {};
  for (const visit of visits) {
    for (const partnerId of uniquePartnerIds(visit.partnerIds)) {
      const key = `${visit.visitId}\0${partnerId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      counts[partnerId] = (counts[partnerId] ?? 0) + 1;
    }
  }
  return counts;
}
