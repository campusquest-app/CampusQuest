#!/usr/bin/env node
/**
 * Seed (or remove) the isolated App Store review demo content for the
 * designated reviewer account. Idempotent. See docs/store-reviewer-account.md.
 *
 * Usage:
 *   node scripts/seed-review-demo.mjs --confirm           # create / refresh demo content
 *   node scripts/seed-review-demo.mjs --remove --confirm  # delete demo content + fictional users
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, and the
 * 20261015120000_review_demo_isolation.sql migration applied.
 *
 * Login also gap-fills missing catalog/social fixtures. It does not wipe the
 * reviewer's onboarding, connections, messages, or notifications.
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

const args = new Set(process.argv.slice(2));
const remove = args.has("--remove");
if (!args.has("--confirm")) {
  console.error("Refusing to write without --confirm. See the usage notes at the top of this script.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const { APP_REVIEW_ACCOUNT_EMAIL } = await import("../lib/appReviewAccount.ts");
const { seedReviewDemoContent, removeReviewDemoContent } = await import("../lib/reviewDemoSeed.ts");
const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function findReviewerId() {
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const match = data.users.find((u) => (u.email ?? "").toLowerCase() === APP_REVIEW_ACCOUNT_EMAIL);
    if (match) return match.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

try {
  if (remove) {
    const result = await removeReviewDemoContent(admin);
    console.log(`Review demo content removed (fictional profiles deleted: ${result.removedProfiles}).`);
  } else {
    const reviewerId = await findReviewerId();
    if (!reviewerId) {
      console.error("Reviewer account not found — run scripts/ensure-qa-account.mjs first.");
      process.exit(1);
    }
    const result = await seedReviewDemoContent({
      admin,
      reviewerUserId: reviewerId,
      expectedReviewerEmail: APP_REVIEW_ACCOUNT_EMAIL,
      school: {
        name: (process.env.PILOT_SCHOOL_NAME ?? "University of Rhode Island").trim(),
        domain: (process.env.PILOT_SCHOOL_DOMAIN ?? "uri.edu").trim().toLowerCase(),
      },
    });
    console.log(
      `Review demo content ready: ${result.profiles} profiles, ${result.posts} posts, ${result.events} events, ` +
        `${result.organizations} organizations, ${result.messages} messages, ${result.notifications} notifications.`,
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
