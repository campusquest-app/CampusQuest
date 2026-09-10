#!/usr/bin/env node
/**
 * CI gate: automatic repair may execute only the allowlisted identity RPC body.
 * The surrounding migration file may recreate RLS policies; that is operator-applied SQL,
 * not auto-repair.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260910180000_provider_self_healing.sql"),
  "utf8",
);

const prohibited = [
  { id: "DROP TABLE", pattern: /\bdrop\s+table\b/i },
  { id: "DROP SCHEMA", pattern: /\bdrop\s+schema\b/i },
  { id: "TRUNCATE", pattern: /\btruncate\b(?!\s+_cq_ext_event_dupes\b)/i },
  { id: "DISABLE RLS", pattern: /\bdisable\s+row\s+level\s+security\b/i },
  { id: "DROP POLICY", pattern: /\bdrop\s+policy\b/i },
  { id: "RESET DATABASE", pattern: /\bdrop\s+database\b/i },
  { id: "GRANT SERVICE ROLE", pattern: /\bgrant\b[\s\S]{0,80}\bservice_role\b/i },
  { id: "ALTER TYPE DESTRUCTIVE", pattern: /\balter\s+column\b[\s\S]{0,80}\btype\b/i },
];

const match = migration.match(
  /create(?:\s+or\s+replace)?\s+function\s+(?:public\.)?cq_repair_external_identity_invariant\s*\([^)]*\)([\s\S]*?)\$\$;/i,
);
if (!match) {
  console.error("Could not extract cq_repair_external_identity_invariant body.");
  process.exit(1);
}

const body = match[1];
const hits = prohibited.filter((rule) => rule.pattern.test(body)).map((rule) => rule.id);
if (hits.length > 0) {
  console.error("Automatic repair RPC contains prohibited operations:", hits.join(", "));
  process.exit(1);
}

if (!/create unique index if not exists external_organizations_source_external_id_uidx/i.test(body)) {
  console.error("Repair RPC is missing organizations UNIQUE(source, external_id) index.");
  process.exit(1);
}

console.log("Migration safety: cq_repair_external_identity_invariant is allowlisted.");
