#!/usr/bin/env node
/**
 * Provision (or reset) the permanent QA onboarding test account.
 *
 * - Creates auth user qa-signup@campusquest.app if missing (email pre-confirmed).
 * - Flags its profile: is_test_user = true, is_hidden = true, is_internal_tester = true, role = 'qa'.
 *   (is_internal_tester / role 'qa' permanently bypass the campus email verification gate.)
 * - Resets all onboarding/progress state so the next sign-in starts at Sign Up.
 * - Never deletes the account; auth credentials are preserved.
 *
 * Usage: node scripts/ensure-qa-account.mjs
 * Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *           QA_TEST_ACCOUNT_PASSWORD (only on first creation)
 *
 * Run the migration first: supabase/migrations/20260721150000_qa_test_account.sql
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

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

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = (process.env.QA_TEST_ACCOUNT_EMAIL ?? "qa-signup@campusquest.app").toLowerCase();

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function findUserIdByEmail() {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const match = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (match) return match.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

let userId = await findUserIdByEmail();
let created = false;

if (!userId) {
  const password = process.env.QA_TEST_ACCOUNT_PASSWORD;
  if (!password) {
    console.error("QA account does not exist yet — set QA_TEST_ACCOUNT_PASSWORD to create it.");
    process.exit(1);
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "CampusQuest QA", is_test_user: true },
  });
  if (error || !data.user) {
    console.error(`createUser failed: ${error?.message ?? "unknown"}`);
    process.exit(1);
  }
  userId = data.user.id;
  created = true;
  console.log(`Created QA auth user ${email} (${userId}).`);
} else {
  console.log(`QA auth user already exists: ${email} (${userId}).`);
}

const qaProfile = {
  id: userId,
  username: "campusquestqa",
  display_name: "CampusQuest QA",
  bio: "",
  role: "qa",
  is_test_user: true,
  is_hidden: true,
  is_internal_tester: true,
  onboarding_completed: false,
  onboarding_completed_at: null,
  onboarding_character_completed: false,
  avatar_custom_json: null,
  avatar_url: null,
  character_class_id: null,
  starter_weapon: null,
  scholar_guild_id: null,
};
let { error: profileError } = await admin.from("profiles").upsert(qaProfile, { onConflict: "id" });
if (profileError && /is_internal_tester/.test(profileError.message ?? "")) {
  // Pre-migration schema — role 'qa' still grants the campus-gate bypass.
  delete qaProfile.is_internal_tester;
  ({ error: profileError } = await admin.from("profiles").upsert(qaProfile, { onConflict: "id" }));
}
if (profileError) {
  console.error(`Profile upsert failed: ${profileError.message}`);
  console.error(
    "Did you apply supabase/migrations/20260721150000_qa_test_account.sql and 20260721160000_internal_tester_access.sql?",
  );
  process.exit(1);
}

await admin.from("user_stats").upsert(
  { user_id: userId, level: 1, total_xp: 0, strength: 0, stamina: 0, knowledge: 0, social: 0, focus: 0 },
  { onConflict: "user_id" },
);

for (const [table, column] of [
  ["user_onboarding_preferences", "user_id"],
  ["user_legal_consents", "user_id"],
  ["beginner_quest_claims", "user_id"],
  ["xp_logs", "user_id"],
  ["user_quests", "user_id"],
  ["quest_completions", "user_id"],
]) {
  const { error } = await admin.from(table).delete().eq(column, userId);
  if (error && error.code !== "42P01") {
    console.warn(`Cleanup of ${table} skipped: ${error.message}`);
  }
}

console.log(`QA account ready (created=${created}). Next sign-in starts at the first Sign Up screen.`);
