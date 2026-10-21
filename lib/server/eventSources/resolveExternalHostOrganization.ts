/**
 * Resolve external_events.organization_id from a verified host name.
 * Matches a single external_organizations row for the same source.
 * Multi-host strings ("A, B") are left unresolved so we never guess.
 */

export function normalizeExternalHostName(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\s+/g, " ").toLowerCase();
}

/** True when the host string is a single organization (not a comma-joined list). */
export function isSingleExternalHostName(organizationName: string | null | undefined): boolean {
  const name = organizationName?.trim();
  if (!name) return false;
  if (name.includes(",")) return false;
  if (/\band\b/i.test(name) && name.split(/\s+and\s+/i).length > 1) {
    // "Foo and Bar" is ambiguous for FK linking; display still uses the full string.
    return false;
  }
  return true;
}

export function buildExternalOrganizationNameIndex(
  rows: Array<{ id: string; name: string | null }>,
): Map<string, string> {
  const index = new Map<string, string>();
  const collisions = new Set<string>();
  for (const row of rows) {
    const key = normalizeExternalHostName(row.name);
    if (!key || !row.id) continue;
    if (index.has(key) && index.get(key) !== row.id) {
      collisions.add(key);
      continue;
    }
    index.set(key, row.id);
  }
  Array.from(collisions).forEach((key) => index.delete(key));
  return index;
}

export function resolveExternalOrganizationIdForHost(args: {
  organizationName: string | null | undefined;
  nameIndex: Map<string, string>;
}): string | null {
  if (!isSingleExternalHostName(args.organizationName)) return null;
  const key = normalizeExternalHostName(args.organizationName);
  if (!key) return null;
  return args.nameIndex.get(key) ?? null;
}
