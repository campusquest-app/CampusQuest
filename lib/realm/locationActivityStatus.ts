export function buildLocationActivityStatus(args: {
  quests: number;
  events: number;
  memories?: number;
  loading?: boolean;
}): string {
  if (args.loading) return "Checking what’s happening here…";

  const parts: string[] = [];
  if (args.events > 0) {
    parts.push(`${args.events} ${args.events === 1 ? "event" : "events"}`);
  }
  if (args.quests > 0) {
    parts.push(`${args.quests} ${args.quests === 1 ? "quest" : "quests"}`);
  }
  if ((args.memories ?? 0) > 0) {
    const memories = args.memories ?? 0;
    parts.push(`${memories} ${memories === 1 ? "memory" : "memories"}`);
  }

  return parts.length > 0
    ? `${parts.join(" · ")} happening here`
    : "Nothing happening here right now";
}
