import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Production regression: "marketplace_listings select" and "marketplace_offers select parties"
 * subqueried each other's RLS-protected table, so every authenticated marketplace read failed
 * with 42P17 (surfaced as GET /api/marketplace/listings?campusFeed=1 → 400).
 */

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

/** Body of the most recent CREATE POLICY for this name across all migrations. */
function latestPolicyBody(policy: string): { file: string; body: string } {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  let latest: { file: string; body: string } | null = null;
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const start = sql.lastIndexOf(`create policy "${policy}"`);
    if (start === -1) continue;
    latest = { file, body: sql.slice(start, sql.indexOf(";", start)) };
  }
  expect(latest, `policy ${policy} not found`).not.toBeNull();
  return latest!;
}

describe("marketplace RLS has no listing ↔ offer policy cycle", () => {
  it("listing visibility does not read marketplace_offers under RLS", () => {
    const { body } = latestPolicyBody("marketplace_listings select");
    expect(body).not.toMatch(/from\s+public\.marketplace_offers/i);
    // Same visibility rules as before.
    expect(body).toMatch(/status = 'active'/);
    expect(body).toMatch(/seller_id = auth\.uid\(\)/);
    expect(body).toMatch(/is_student_business_manager\(business_id\)/);
    expect(body).toMatch(/is_marketplace_offer_buyer\(id\)/);
  });

  it("offer visibility does not read marketplace_listings under RLS", () => {
    const { body } = latestPolicyBody("marketplace_offers select parties");
    expect(body).not.toMatch(/from\s+public\.marketplace_listings/i);
    expect(body).toMatch(/buyer_id = auth\.uid\(\)/);
    expect(body).toMatch(/is_marketplace_listing_seller_or_manager\(listing_id\)/);
  });

  it("helpers are SECURITY DEFINER with a pinned search_path and authenticated-only execute", () => {
    const sql = fs.readFileSync(
      path.join(MIGRATIONS_DIR, latestPolicyBody("marketplace_listings select").file),
      "utf8",
    );
    for (const fn of ["is_marketplace_offer_buyer", "is_marketplace_listing_seller_or_manager"]) {
      const def = sql.match(new RegExp(`create or replace function public\\.${fn}\\([\\s\\S]*?\\$\\$;`))?.[0] ?? "";
      expect(def).toMatch(/security definer/);
      expect(def).toMatch(/set search_path = public/);
      expect(def).toMatch(/auth\.uid\(\)/);
      expect(sql).toContain(`revoke all on function public.${fn}(uuid) from public;`);
      expect(sql).toContain(`grant execute on function public.${fn}(uuid) to authenticated;`);
    }
  });
});
