/**
 * Human-readable short label for group titles.
 * Prefer display names; never dump raw joined username lists.
 */
export function humanReadableShortName(displayName: string, username?: string | null): string {
  const raw = (displayName || username || "").trim();
  if (!raw) return "Member";

  if (/\s/.test(raw)) {
    return raw.split(/\s+/)[0]!;
  }

  // Handle-like values: claire.boulanger → Claire
  if (/^[a-z0-9._-]+$/i.test(raw) && /[._-]/.test(raw)) {
    const first = raw.split(/[._-]/)[0]!;
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  }

  return raw;
}

/**
 * Build a clean group title from a saved name or member list.
 * Examples: "Study Group", "Claire and Sam", "Claire, Sam, and 2 others"
 */
export function buildGroupDisplayName(args: {
  title: string | null | undefined;
  members: Array<{ id: string; displayName: string; username?: string | null }>;
  viewerId: string;
}): string {
  const trimmed = args.title?.trim();
  if (trimmed) return trimmed;

  const others = args.members.filter((m) => m.id !== args.viewerId);
  const labels = others
    .map((m) => humanReadableShortName(m.displayName, m.username))
    .filter(Boolean);

  if (labels.length === 0) return "Group chat";
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  if (labels.length === 3) return `${labels[0]}, ${labels[1]}, and ${labels[2]}`;
  return `${labels[0]}, ${labels[1]}, and ${labels.length - 2} others`;
}
