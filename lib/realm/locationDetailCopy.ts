import type { RealmLocation, RealmLocationId } from "@/lib/realm/locations";

/** Natural campus blurbs for location detail — not fantasy flavor. */
const NATURAL_DESCRIPTIONS: Partial<Record<RealmLocationId, string>> = {
  "the-quad": "Open green space at the center of campus life.",
  "butterfield-dining": "All-you-care-to-eat dining on Butterfield Road — breakfast through dinner.",
  "mainfare-dining": "Hope Commons dining — Mainfare stations, late plates, and campus meals.",
  "dining-hall": "Grab a meal, meet friends, and fuel up between classes.",
  "memorial-union": "The heart of campus. Eat, relax, study, meet friends.",
  library: "Quiet floors, study rooms, and late-night focus energy.",
  "rec-center": "Work out, play intramurals, and stay active on campus.",
  "engineering-hall": "Labs, projects, and the home of Rhody engineering.",
  "business-building": "Classes, career events, and College of Business energy.",
  "rams-den": "Casual bites, coffee, and a place to hang between classes.",
};

export type LocationMetaPill = {
  id: string;
  label: string;
  tone: "blue" | "gold" | "purple" | "green" | "neutral";
};

export function resolveLocationDetailDescription(args: {
  location: RealmLocation | null;
  displayName: string;
  address?: string | null;
}): string {
  const fromData = args.location?.description?.trim();
  if (fromData) return fromData;

  if (args.location?.id) {
    const natural = NATURAL_DESCRIPTIONS[args.location.id]?.trim();
    if (natural) return natural;
  }

  const address = args.address?.trim();
  if (address) return address;

  return `${args.displayName} on the URI Kingston campus.`;
}

export function buildLocationMetaPills(args: {
  location: RealmLocation | null;
  eventCount: number;
  memoryCount: number;
}): LocationMetaPill[] {
  const pills: LocationMetaPill[] = [];
  const id = args.location?.id;
  const category = args.location?.category?.trim();

  if (category) {
    pills.push({
      id: "category",
      label: formatCategoryLabel(category),
      tone: "blue",
    });
  } else if (args.location?.major) {
    pills.push({ id: "hub", label: "Central Hub", tone: "blue" });
  }

  if (
    id === "butterfield-dining" ||
    id === "mainfare-dining" ||
    id === "dining-hall" ||
    id === "rams-den" ||
    id === "memorial-union" ||
    /food|dining|eat/i.test(category ?? "")
  ) {
    pills.push({ id: "food", label: "Food & Dining", tone: "gold" });
  }

  if (args.eventCount > 0) {
    pills.push({ id: "events", label: "Events", tone: "purple" });
  }

  if (args.memoryCount > 0 && pills.length < 3) {
    pills.push({ id: "memories", label: "Memories", tone: "green" });
  }

  // Cap to three pills so the hero stays readable.
  return pills.slice(0, 3);
}

function formatCategoryLabel(category: string): string {
  const normalized = category.trim().replace(/[_-]+/g, " ");
  if (!normalized) return "Location";
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
