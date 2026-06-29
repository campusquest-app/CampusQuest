/**
 * Audit & clean up Torch Bearer concurrency-test users (remote Supabase).
 *
 * Test-account criteria (BOTH must hold):
 *   - email ends with "@cq-smoke.invalid"
 *   - email local-part starts with "torch-conc-"
 *
 * Hard-protected accounts (never deleted, abort if matched):
 *   - campusquest@campusquestapp.com
 *   - nicklockhart22@uri.edu
 *
 * Audit-only by default. To actually delete, set APPLY=true:
 *   npx tsx scripts/cleanup-torch-bearer-test-users.ts            # audit
 *   APPLY=true npx tsx scripts/cleanup-torch-bearer-test-users.ts # delete
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { USER_DATA_DELETION_STEPS } from "../lib/server/adminUserDeletion";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

const PREFIX = "[cq][torch-cleanup]";
const APPLY = process.env.APPLY === "true";

const TEST_EMAIL_DOMAIN = "@cq-smoke.invalid";
const TEST_LOCAL_PREFIX = "torch-conc-";
const PROTECTED_EMAILS = new Set([
  "campusquest@campusquestapp.com",
  "nicklockhart22@uri.edu",
]);

type AuthUserLite = { id: string; email: string | null };

function isTestAccount(email: string | null): boolean {
  if (!email) return false;
  const lower = email.trim().toLowerCase();
  if (PROTECTED_EMAILS.has(lower)) return false;
  const local = lower.split("@")[0] ?? "";
  return lower.endsWith(TEST_EMAIL_DOMAIN) && local.startsWith(TEST_LOCAL_PREFIX);
}

function abort(msg: string): never {
  console.error(`${PREFIX} ABORT ${msg}`);
  process.exit(1);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) abort("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Enumerate all auth users and match test accounts.
  const matched: AuthUserLite[] = [];
  const protectedSeen: string[] = [];
  let page = 1;
  let scanned = 0;

  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) abort(`listUsers page ${page}: ${error.message}`);
    const users = data?.users ?? [];
    scanned += users.length;
    for (const u of users) {
      const email = u.email ?? null;
      const lower = email?.trim().toLowerCase() ?? "";
      if (PROTECTED_EMAILS.has(lower)) protectedSeen.push(lower);
      if (isTestAccount(email)) matched.push({ id: u.id, email });
    }
    if (users.length < 200) break;
    page += 1;
  }

  console.info(`${PREFIX} Scanned ${scanned} auth users; matched ${matched.length} test account(s).`);
  console.info(`${PREFIX} Protected accounts present and untouched: ${protectedSeen.join(", ") || "none seen"}`);

  // 2. Re-verify every match satisfies the strict criteria; abort if any does not.
  for (const u of matched) {
    if (!isTestAccount(u.email)) {
      abort(`Matched account ${u.email} failed strict re-validation. No deletions performed.`);
    }
    const lower = u.email!.toLowerCase();
    if (PROTECTED_EMAILS.has(lower)) {
      abort(`Protected account ${lower} appeared in deletion set. Aborting.`);
    }
  }

  // Snapshot beta_founders before.
  const { data: foundersBefore, error: fbErr } = await admin
    .from("beta_founders")
    .select("user_id, founder_number")
    .order("founder_number", { ascending: true });
  if (fbErr) abort(`beta_founders snapshot: ${fbErr.message}`);

  const matchedIds = new Set(matched.map((m) => m.id));
  const freedNumbers = (foundersBefore ?? [])
    .filter((r) => matchedIds.has(r.user_id))
    .map((r) => r.founder_number)
    .sort((a, b) => a - b);
  const realFoundersBefore = (foundersBefore ?? []).filter((r) => !matchedIds.has(r.user_id));

  console.info(`${PREFIX} beta_founders rows owned by test users (numbers to free): ${freedNumbers.join(", ") || "none"}`);
  console.info(`${PREFIX} Real founders (kept): ${realFoundersBefore.map((r) => r.founder_number).sort((a, b) => a - b).join(", ") || "none"}`);

  if (matched.length === 0) {
    console.info(`${PREFIX} Nothing to clean up. Done.`);
    return;
  }

  if (!APPLY) {
    console.info(`${PREFIX} AUDIT ONLY — set APPLY=true to delete these ${matched.length} account(s):`);
    for (const u of matched) console.info(`${PREFIX}   - ${u.email} (${u.id})`);
    return;
  }

  // 3 + 4. Delete related data in FK-safe order, then the auth user.
  let deleted = 0;
  const removedTotals: Record<string, number> = {};

  for (const u of matched) {
    for (const step of USER_DATA_DELETION_STEPS) {
      for (const column of step.columns) {
        const { count, error } = await admin
          .from(step.table)
          .delete({ count: "exact" })
          .eq(column, u.id);
        if (error) {
          const benign =
            error.code === "42P01" ||
            error.code === "PGRST205" ||
            /does not exist/i.test(error.message ?? "") ||
            /could not find the table/i.test(error.message ?? "");
          if (!benign) abort(`delete ${step.table}.${column} for ${u.email}: ${error.message}`);
          continue;
        }
        if (count && count > 0) {
          const key = `${step.table}.${column}`;
          removedTotals[key] = (removedTotals[key] ?? 0) + count;
        }
      }
    }

    const { error: authErr } = await admin.auth.admin.deleteUser(u.id);
    if (authErr) abort(`auth deleteUser ${u.email}: ${authErr.message}`);
    deleted += 1;
  }

  console.info(`${PREFIX} Deleted ${deleted} test auth user(s).`);
  console.info(`${PREFIX} Related rows removed:`, removedTotals);

  // 5. Verify no remaining matches.
  const remaining: string[] = [];
  page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) abort(`post-verify listUsers page ${page}: ${error.message}`);
    const users = data?.users ?? [];
    for (const u of users) {
      if (isTestAccount(u.email ?? null)) remaining.push(u.email ?? u.id);
    }
    if (users.length < 200) break;
    page += 1;
  }
  if (remaining.length > 0) abort(`Test accounts still present after cleanup: ${remaining.join(", ")}`);

  // Orphan checks: any profiles / beta_founders rows for deleted ids.
  const idList = [...matchedIds];
  const { data: orphanProfiles } = await admin.from("profiles").select("id").in("id", idList);
  const { data: orphanFounders } = await admin.from("beta_founders").select("user_id").in("user_id", idList);
  const { data: orphanStats } = await admin.from("user_stats").select("user_id").in("user_id", idList);

  const orphans: string[] = [];
  if ((orphanProfiles ?? []).length) orphans.push(`profiles(${orphanProfiles!.length})`);
  if ((orphanFounders ?? []).length) orphans.push(`beta_founders(${orphanFounders!.length})`);
  if ((orphanStats ?? []).length) orphans.push(`user_stats(${orphanStats!.length})`);
  if (orphans.length > 0) abort(`Orphaned rows remain: ${orphans.join(", ")}`);

  // beta_founders now contains only real users.
  const { data: foundersAfter } = await admin
    .from("beta_founders")
    .select("user_id, founder_number")
    .order("founder_number", { ascending: true });
  const afterNums = (foundersAfter ?? []).map((r) => r.founder_number).sort((a, b) => a - b);

  console.info(`${PREFIX} ───────── SUMMARY ─────────`);
  console.info(`${PREFIX} Test users deleted: ${deleted}`);
  console.info(`${PREFIX} Founder numbers freed: ${freedNumbers.join(", ") || "none"}`);
  console.info(`${PREFIX} Remaining real founders: ${afterNums.join(", ") || "none"} (${afterNums.length} total)`);
  console.info(`${PREFIX} Orphaned rows: none`);
  console.info(`${PREFIX} Protected accounts untouched: ${[...PROTECTED_EMAILS].join(", ")}`);
  console.info(`${PREFIX} PASS — cleanup complete; freed numbers are now reusable via smallest-free-slot.`);
}

main().catch((err) => {
  console.error(`${PREFIX} Unhandled error`, err);
  process.exit(1);
});
