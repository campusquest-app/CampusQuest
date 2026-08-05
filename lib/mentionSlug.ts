/** Normalize a mention slug: lowercase, underscores, strip unsupported chars. */

export function normalizeMentionSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

export function allocateUniqueSlug(base: string, taken: Set<string>): string {
  const normalized = normalizeMentionSlug(base) || "entity";
  if (!taken.has(normalized)) return normalized;
  for (let i = 2; i < 10_000; i += 1) {
    const candidate = `${normalized}_${i}`.slice(0, 64);
    if (!taken.has(candidate)) return candidate;
  }
  return `${normalized}_${Date.now()}`.slice(0, 64);
}
