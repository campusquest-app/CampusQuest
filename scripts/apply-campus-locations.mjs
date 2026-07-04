#!/usr/bin/env node
/**
 * Apply campus_locations migration and verify the catalog table.
 *
 * Migration: supabase/migrations/20260716120000_campus_locations.sql
 *
 * Requires SUPABASE_DB_URL (Session pooler or direct Postgres URL), e.g.:
 *   postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
 *
 * Or run: supabase db push
 * Or paste the SQL in Supabase Dashboard → SQL Editor.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const MIGRATION_FILE = "20260716120000_campus_locations.sql";

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

function migrationPath() {
  return resolve(root, "supabase/migrations", MIGRATION_FILE);
}

async function verifyWithSupabaseJs() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn("Skipping Supabase JS verification (missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY).");
    return false;
  }

  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await admin.from("campus_locations").select("slug").limit(1);
  if (error) {
    console.error("Verification failed — campus_locations:", error.message, error.code ?? "");
    return false;
  }
  console.log(`Verified: public.campus_locations exists (${data?.length ? "has rows" : "empty"}).`);
  return true;
}

async function applyWithPg() {
  const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.log("\nNo SUPABASE_DB_URL or DATABASE_URL in environment.");
    console.log("Apply manually: supabase db push");
    console.log(`  or SQL Editor: ${migrationPath()}`);
    return false;
  }

  let pg;
  try {
    pg = await import("pg");
  } catch {
    console.error("\nInstall pg to apply via CLI: npm install --save-dev pg");
    return false;
  }

  const path = migrationPath();
  if (!existsSync(path)) {
    throw new Error(`Migration not found: ${path}`);
  }

  const client = new pg.default.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const sql = readFileSync(path, "utf8");
    console.log(`Applying ${MIGRATION_FILE}…`);
    await client.query(sql);
    console.log("Applied campus_locations migration successfully.");
    return true;
  } finally {
    await client.end();
  }
}

async function main() {
  loadEnvLocal();
  console.log("Campus locations migration apply + verify\n");

  const applied = await applyWithPg();
  const ok = await verifyWithSupabaseJs();

  if (applied && ok) {
    process.exit(0);
  }
  if (!applied && ok) {
    console.log("campus_locations schema already looks good.");
    process.exit(0);
  }

  console.error("\ncampus_locations is not ready. Run supabase db push or apply the migration SQL, then re-run.");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
