#!/usr/bin/env node
/**
 * Apply landing-page intake migration + verify tables.
 *
 * Migration:
 *   supabase/migrations/20260905223000_landing_page_intake.sql
 *
 * Requires SUPABASE_DB_URL or DATABASE_URL to apply via Postgres.
 * Always verifies via service role when keys are present.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const MIGRATION_FILE = "20260905223000_landing_page_intake.sql";

function loadEnvLocal() {
  for (const name of [".env.local", ".env"]) {
    const path = resolve(root, name);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

async function verifyWithSupabaseJs() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn("Skipping Supabase JS verification (missing URL or service role key).");
    return false;
  }

  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(url, key, { auth: { persistSession: false } });

  for (const table of ["landing_page_leads", "landing_contact_submissions"]) {
    const { error } = await admin.from(table).select("id").limit(1);
    if (error) {
      console.error(`Verification failed — ${table}:`, error.message, error.code ?? "");
      return false;
    }
    console.log(`Verified: public.${table} exists (service-role select ok).`);
  }

  // Smoke: insert + delete a disposable lead (dev verification only).
  const probeEmail = `landing-intake-probe+${Date.now()}@example.com`;
  const { data: inserted, error: insertError } = await admin
    .from("landing_page_leads")
    .insert({
      email: probeEmail,
      interest_type: "student",
      source: "migration_probe",
      status: "new",
    })
    .select("id")
    .maybeSingle();

  if (insertError) {
    console.error("Probe insert failed:", insertError.message);
    return false;
  }

  const { error: dupError } = await admin.from("landing_page_leads").insert({
    email: probeEmail,
    interest_type: "student",
    source: "migration_probe",
  });
  if (!dupError || dupError.code !== "23505") {
    console.error("Expected duplicate unique violation (23505), got:", dupError);
    if (inserted?.id) await admin.from("landing_page_leads").delete().eq("id", inserted.id);
    return false;
  }
  console.log("Verified: duplicate lead rejected with 23505.");

  if (inserted?.id) {
    await admin.from("landing_page_leads").delete().eq("id", inserted.id);
  }

  const { error: contactError } = await admin
    .from("landing_contact_submissions")
    .insert({
      email: probeEmail,
      name: "Probe",
      message: "Migration probe contact message.",
      reason: "other",
      source: "migration_probe",
    })
    .select("id")
    .maybeSingle()
    .then(async (res) => {
      if (res.data?.id) {
        await admin.from("landing_contact_submissions").delete().eq("id", res.data.id);
      }
      return res;
    });

  if (contactError) {
    console.error("Probe contact insert failed:", contactError.message);
    return false;
  }
  console.log("Verified: contact insert works.");

  // Anon client should not see rows (RLS).
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (anon) {
    const publicClient = createClient(url, anon, { auth: { persistSession: false } });
    const { data: leaked, error: leakError } = await publicClient.from("landing_page_leads").select("id").limit(1);
    if (leakError && /permission denied|RLS|not found/i.test(leakError.message)) {
      console.log("Verified: anon cannot select landing_page_leads (", leakError.code ?? "rls", ").");
    } else if (!leakError && (!leaked || leaked.length === 0)) {
      console.log("Verified: anon select returns empty (RLS deny-as-empty).");
    } else if (leakError) {
      console.log("Verified: anon select blocked:", leakError.message);
    } else {
      console.error("SECURITY: anon was able to select landing leads.");
      return false;
    }
  }

  return true;
}

async function applyWithPg() {
  const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.log("\nNo SUPABASE_DB_URL or DATABASE_URL in environment.");
    console.log("Apply manually via Supabase SQL Editor or: supabase db push");
    console.log(`  supabase/migrations/${MIGRATION_FILE}`);
    return false;
  }

  let pg;
  try {
    pg = await import("pg");
  } catch {
    console.error("\nInstall pg to apply via CLI: npm install --save-dev pg");
    return false;
  }

  const path = resolve(root, "supabase/migrations", MIGRATION_FILE);
  if (!existsSync(path)) throw new Error(`Migration not found: ${path}`);
  const sql = readFileSync(path, "utf8");
  const client = new pg.default.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log(`Applied ${MIGRATION_FILE}`);
    return true;
  } finally {
    await client.end();
  }
}

async function main() {
  loadEnvLocal();
  const applied = await applyWithPg();
  const verified = await verifyWithSupabaseJs();
  if (!applied && !verified) {
    console.error("\nLanding intake not ready. Apply the migration, then re-run.");
    process.exit(1);
  }
  if (!verified) {
    console.error("\nMigration may be applied, but verification failed.");
    process.exit(1);
  }
  console.log("\nLanding page intake ready.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
