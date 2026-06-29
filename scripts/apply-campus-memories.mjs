#!/usr/bin/env node
/**
 * Apply Campus Memories migrations in order and verify upload prerequisites.
 *
 * Migrations applied (when SUPABASE_DB_URL or DATABASE_URL is set):
 *   1. 20260704120000_campus_memories.sql
 *   2. 20260706130000_campus_memories_location_id.sql
 *   3. 20260707120000_campus_memories_upload_bootstrap.sql
 *
 * Also verifies quad-post-images storage bucket via service role.
 *
 * Requires SUPABASE_DB_URL (Session pooler or direct Postgres URL), e.g.:
 *   postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
 *
 * Or run the same files in Supabase Dashboard → SQL Editor.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const MIGRATION_FILES = [
  "20260704120000_campus_memories.sql",
  "20260706130000_campus_memories_location_id.sql",
  "20260707120000_campus_memories_upload_bootstrap.sql",
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

function migrationPaths() {
  const dir = resolve(root, "supabase/migrations");
  return MIGRATION_FILES.map((file) => resolve(dir, file));
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

  const tableCheck = await admin.from("campus_memories").select("id, location_id").limit(1);
  if (tableCheck.error) {
    console.error("Verification failed — campus_memories:", tableCheck.error.message, tableCheck.error.code ?? "");
    return false;
  }
  console.log("Verified: public.campus_memories table exists (with location_id column).");

  const { data: buckets, error: bucketError } = await admin.storage.listBuckets();
  if (bucketError) {
    console.error("Verification failed — storage.listBuckets:", bucketError.message);
    return false;
  }
  const bucket = buckets?.find((b) => b.id === "quad-post-images");
  if (!bucket) {
    console.error('Verification failed — storage bucket "quad-post-images" is missing.');
    return false;
  }
  if (!bucket.public) {
    console.warn('Warning: bucket "quad-post-images" exists but is not public — image URLs may not work.');
  } else {
    console.log('Verified: storage bucket "quad-post-images" exists and is public.');
  }

  return true;
}

async function applyWithPg() {
  const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.log("\nNo SUPABASE_DB_URL or DATABASE_URL in environment.");
    console.log("Apply manually in Supabase Dashboard → SQL Editor, in order:");
    for (const path of migrationPaths()) {
      console.log(`  ${path}`);
    }
    console.log("");
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
    for (const path of migrationPaths()) {
      if (!existsSync(path)) {
        throw new Error(`Migration not found: ${path}`);
      }
      const sql = readFileSync(path, "utf8");
      console.log(`Applying ${path.split("/").pop()}…`);
      await client.query(sql);
    }
    console.log("Applied Campus Memories migrations successfully.");
    return true;
  } finally {
    await client.end();
  }
}

async function main() {
  loadEnvLocal();
  console.log("Campus Memories migration apply + verify\n");

  const applied = await applyWithPg();
  const ok = await verifyWithSupabaseJs();

  if (applied && ok) {
    process.exit(0);
  }
  if (!applied && ok) {
    console.log("Campus Memories schema and storage bucket already look good.");
    process.exit(0);
  }

  console.error(
    "\nCampus Memories is not fully ready. Apply the migration SQL files above, then re-run this script.",
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
