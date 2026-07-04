/** Generate a URL-safe slug from a human-readable location name. */
export function normalizeLocationSlug(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || "location";
}

/** Append a numeric suffix when the base slug is already taken. */
export function dedupeLocationSlug(base: string, taken: Set<string>): string {
  const normalized = normalizeLocationSlug(base);
  if (!taken.has(normalized)) return normalized;
  for (let i = 2; i < 100; i++) {
    const candidate = `${normalized}-${i}`.slice(0, 64);
    if (!taken.has(candidate)) return candidate;
  }
  return `${normalized}-${Date.now().toString(36).slice(-4)}`.slice(0, 64);
}
