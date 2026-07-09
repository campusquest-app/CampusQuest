#!/usr/bin/env node
/**
 * Apply XP/profile security hardening migrations.
 *
 * Migrations:
 *   supabase/migrations/20260707180000_profile_xp_security_hardening.sql
 *   supabase/migrations/20260707183000_user_quests_rls_hardening.sql
 *
 * Requires SUPABASE_DB_URL (Session pooler or direct Postgres URL).
 * Or run: supabase db push
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const MIGRATION_FILES = [
  "20260707180000_profile_xp_security_hardening.sql",
  "20260707183000_user_quests_rls_hardening.sql",
];

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

  const { error } = await admin.from("security_events").select("id").limit(1);
  if (error) {
    console.error("Verification failed — security_events:", error.message, error.code ?? "");
    return false;
  }
  console.log("Verified: public.security_events exists.");
  return true;
}

async function applyWithPg() {
  const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.log("\nNo SUPABASE_DB_URL or DATABASE_URL in environment.");
    console.log("Apply manually: supabase db push");
    for (const file of MIGRATION_FILES) {
      console.log(`  or SQL Editor: supabase/migrations/${file}`);
    }
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
    for (const file of MIGRATION_FILES) {
      const path = resolve(root, "supabase/migrations", file);
      if (!existsSync(path)) {
        throw new Error(`Migration not found: ${path}`);
      }
      const sql = readFileSync(path, "utf8");
      console.log(`Applying ${file}…`);
      await client.query(sql);
      console.log(`Applied ${file}.`);
    }
    return true;
  } finally {
    await client.end();
  }
}

async function main() {
  loadEnvLocal();
  console.log("Profile XP security migrations apply + verify\n");

  const applied = await applyWithPg();
  const ok = await verifyWithSupabaseJs();

  if (applied && ok) {
    process.exit(0);
  }
  if (!applied && ok) {
    console.log("Security schema already looks applied.");
    process.exit(0);
  }

  console.error("\nSecurity migrations not ready. Set SUPABASE_DB_URL in .env.local, then re-run.");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
