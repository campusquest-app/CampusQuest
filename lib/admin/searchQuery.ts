export type AdminSearchScope = "all" | "users" | "organizations" | "events" | "reports" | "messages" | "audit";

export type ParsedAdminSearch = {
  scope: AdminSearchScope;
  query: string;
  raw: string;
};

const COMMAND_PREFIXES: Array<{ prefix: string; scope: AdminSearchScope }> = [
  { prefix: "user:", scope: "users" },
  { prefix: "org:", scope: "organizations" },
  { prefix: "event:", scope: "events" },
  { prefix: "email:", scope: "users" },
  { prefix: "report:", scope: "reports" },
  { prefix: "audit:", scope: "audit" },
  { prefix: "message:", scope: "messages" },
];

export function parseAdminSearchQuery(rawInput: string): ParsedAdminSearch {
  const raw = rawInput.trim();
  const lower = raw.toLowerCase();

  for (const { prefix, scope } of COMMAND_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return { scope, query: raw.slice(prefix.length).trim(), raw };
    }
  }

  return { scope: "all", query: raw, raw };
}

export const ADMIN_SEARCH_RECENTS_KEY = "cq-admin-search-recents";
export const ADMIN_SEARCH_MIN_CHARS = 2;
export const ADMIN_SEARCH_DEBOUNCE_MS = 250;

export function loadRecentAdminSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(ADMIN_SEARCH_RECENTS_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function saveRecentAdminSearch(term: string) {
  if (typeof window === "undefined" || term.trim().length < ADMIN_SEARCH_MIN_CHARS) return;
  const next = [term.trim(), ...loadRecentAdminSearches().filter((item) => item !== term.trim())].slice(0, 8);
  localStorage.setItem(ADMIN_SEARCH_RECENTS_KEY, JSON.stringify(next));
}
