export type EventKeyFact = {
  id: string;
  label: string;
  value: string;
};

function firstMatch(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  if (!match) return null;
  const value = (match[1] ?? match[0]).replace(/\s+/g, " ").trim();
  return value || null;
}

/**
 * Only emit facts the source text or structured fields explicitly establish.
 * Do not infer Free / Food / Open to all / Registration / Accessibility from silence.
 */
export function extractEventKeyFacts(input: {
  description?: string | null;
  isPaid?: boolean | null;
  ticketLink?: string | null;
}): EventKeyFact[] {
  const facts: EventKeyFact[] = [];
  const description = input.description ?? "";

  if (input.isPaid === true) {
    facts.push({ id: "cost", label: "Cost", value: "Paid" });
  } else if (input.isPaid === false) {
    facts.push({ id: "cost", label: "Cost", value: "Free" });
  } else {
    const priced = firstMatch(description, /\b(?:admission|tickets?|cost)\s+(?:is\s+)?(\$[\d.,]+(?:\s*(?:USD|per person))?)/i);
    if (priced) facts.push({ id: "cost", label: "Cost", value: priced });
  }

  if (input.ticketLink?.trim()) {
    facts.push({ id: "registration", label: "Registration", value: "Registration link available" });
  } else if (/\b(?:registration required|rsvp required|pre-?registration required|must register)\b/i.test(description)) {
    facts.push({ id: "registration", label: "Registration required", value: "Yes" });
  }

  const audience = firstMatch(
    description,
    /\b(open to all(?: students)?|open to the campus community|uri students only|students only)\b/i,
  );
  if (audience) facts.push({ id: "audience", label: "Who can attend", value: audience });

  if (/\b(?:food (?:will be )?provided|refreshments (?:will be )?provided|pizza will be served|free (?:pizza|lunch|dinner))\b/i.test(description)) {
    facts.push({ id: "food", label: "Food", value: "Provided" });
  }

  if (/\b(?:giveaways?|free t-?shirts?|swag bags?)\b/i.test(description)) {
    facts.push({ id: "giveaways", label: "Giveaways", value: "Yes" });
  }

  const accessibility = firstMatch(
    description,
    /\b(wheelchair accessible|asl interpret(?:er|ation)|ada accessible|accessible entrance)\b/i,
  );
  if (accessibility) facts.push({ id: "accessibility", label: "Accessibility", value: accessibility });

  const bring = firstMatch(description, /\b(?:what to bring|bring your(?: own)?)\s*:?\s*([^.!\n]{3,80})/i);
  if (bring) facts.push({ id: "bring", label: "What to bring", value: bring });

  const contact = firstMatch(description, /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i);
  if (contact) facts.push({ id: "contact", label: "Contact", value: contact });

  return facts;
}

/** Bullet / numbered lists already in the source description. Never invent agenda items. */
export function extractWhatToExpect(description?: string | null): string[] {
  const text = description?.trim() ?? "";
  if (!text) return [];

  const bullets: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.+\S)\s*$/);
    if (!match) continue;
    const item = match[1].replace(/\s+/g, " ").trim();
    if (item.length >= 2 && item.length <= 120) bullets.push(item);
  }
  if (bullets.length >= 2) return Array.from(new Set(bullets)).slice(0, 8);

  const including = text.match(/\b(?:including|featuring|highlights include)\s*:?\s*([^.!?\n]{20,400})/i);
  if (!including?.[1]) return [];
  const parts = including[1]
    .split(/,|\band\b/i)
    .map((part) => part.replace(/\s+/g, " ").trim().replace(/[.]+$/, ""))
    .filter((part) => part.length >= 3 && part.length <= 80);
  return parts.length >= 3 ? Array.from(new Set(parts)).slice(0, 8) : [];
}

export function eventDescriptionParagraphs(description?: string | null): string[] {
  const text = description?.replace(/\r\n/g, "\n").trim() ?? "";
  if (!text) return [];
  const blocks = text
    .split(/\n{2,}/)
    .flatMap((block) => (block.includes("\n") && block.length > 280 ? block.split(/\n/) : [block]))
    .map((block) => block.replace(/[ \t]+\n/g, "\n").trim())
    .filter(Boolean);
  return blocks;
}

export function eventCardSummary(description?: string | null, maxLength = 110): string | null {
  const first = eventDescriptionParagraphs(description)[0];
  if (!first) return null;
  const compact = first.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}
