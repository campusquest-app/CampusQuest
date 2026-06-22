#!/usr/bin/env node
/**
 * Apply supabase/migrations/20260629120000_admin_quest_system_bootstrap.sql
 *
 * Requires SUPABASE_DB_URL (Session pooler or direct Postgres URL), e.g.:
 *   postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
 *
 * Or run the same file in Supabase Dashboard → SQL Editor.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvLocal() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) return;
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

function migrationPath() {
  return resolve(root, "supabase/migrations/20260629120000_admin_quest_system_bootstrap.sql");
}

async function verifyWithSupabaseJs() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;

  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await admin.from("admin_quests").select("id").limit(1);
  if (error) {
    console.error("Verification failed:", error.message);
    return false;
  }
  console.log("Verified: public.admin_quests table exists.");
  return true;
}

async function applyWithPg(sql) {
  const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.log("\nNo SUPABASE_DB_URL or DATABASE_URL in environment.");
    console.log("Apply manually: Supabase Dashboard → SQL Editor → paste:");
    console.log(`  ${migrationPath()}\n`);
    return false;
  }

  let pg;
  try {
    pg = await import("pg");
  } catch {
    console.error("\nInstall pg to apply via CLI: npm install --save-dev pg");
    return false;
  }

  const client = new pg.default.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log("Applied admin_quest_system migration successfully.");
    return true;
  } finally {
    await client.end();
  }
}

async function main() {
  loadEnvLocal();
  const sqlPath = migrationPath();
  if (!existsSync(sqlPath)) {
    throw new Error(`Migration not found: ${sqlPath}`);
  }
  const sql = readFileSync(sqlPath, "utf8");
  console.log(`Using migration: ${sqlPath}\n`);

  const applied = await applyWithPg(sql);
  if (applied) {
    await verifyWithSupabaseJs();
    process.exit(0);
  }

  const ok = await verifyWithSupabaseJs();
  if (ok) {
    console.log("admin_quests table already exists — no SUPABASE_DB_URL needed.");
    process.exit(0);
  }

  console.error(
    "\nadmin_quests table is missing. Run the migration SQL in Supabase Dashboard, then restart `npm run dev`.",
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
