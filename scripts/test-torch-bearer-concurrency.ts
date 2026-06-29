/**
 * Torch Bearer founder-number concurrency smoke test (remote Supabase).
 *
 * Creates N test users, awards Torch Bearer badges in parallel via the
 * award_torch_bearer_badge RPC, verifies all founder numbers are unique,
 * then deletes the test users.
 *
 * Run: npx tsx scripts/test-torch-bearer-concurrency.ts
 * Optional: CONCURRENCY=20 npx tsx scripts/test-torch-bearer-concurrency.ts
 */
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

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

const PREFIX = "[cq][torch-bearer-concurrency]";
const CONCURRENCY = Math.min(30, Math.max(2, Number(process.env.CONCURRENCY ?? 15)));

function fail(msg: string): never {
  console.error(`${PREFIX} FAIL ${msg}`);
  process.exit(1);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    fail("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const runId = randomUUID().slice(0, 8);
  const userIds: string[] = [];

  console.info(`${PREFIX} Creating ${CONCURRENCY} test users (run ${runId})…`);

  for (let i = 0; i < CONCURRENCY; i += 1) {
    const email = `torch-conc-${runId}-${i}@cq-smoke.invalid`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: `SmokeTest!${runId}${i}`,
      email_confirm: true,
      user_metadata: { display_name: `Torch Conc ${runId}-${i}` },
    });
    if (error || !data.user?.id) {
      fail(`createUser ${i}: ${error?.message ?? "no user id"}`);
    }
    const userId = data.user.id;
    userIds.push(userId);

    const username = `tc_${runId}_${i}`.slice(0, 30);
    const { error: profileError } = await admin.from("profiles").insert({
      id: userId,
      username,
      display_name: `Torch Conc ${runId}-${i}`,
      bio: "",
      role: "student",
    });
    if (profileError) {
      fail(`profile insert ${i}: ${profileError.message}`);
    }

    const { error: statsError } = await admin.from("user_stats").insert({
      user_id: userId,
      level: 1,
      total_xp: 0,
      strength: 0,
      stamina: 0,
      knowledge: 0,
      social: 0,
      focus: 0,
    });
    if (statsError) {
      fail(`user_stats insert ${i}: ${statsError.message}`);
    }
  }

  console.info(`${PREFIX} Awarding badges in parallel (${CONCURRENCY} concurrent RPC calls)…`);

  const awardResults = await Promise.all(
    userIds.map(async (userId, index) => {
      const { data, error } = await admin.rpc("award_torch_bearer_badge", {
        p_user_id: userId,
        p_allow_admin: false,
      });
      if (error) {
        return { userId, index, error: error.message, founderNumber: null as number | null, newlyAwarded: false };
      }
      const row = Array.isArray(data) ? data[0] : data;
      return {
        userId,
        index,
        error: null as string | null,
        founderNumber: typeof row?.founder_number === "number" ? row.founder_number : null,
        newlyAwarded: Boolean(row?.newly_awarded),
      };
    }),
  );

  const errors = awardResults.filter((r) => r.error);
  if (errors.length > 0) {
    console.error(`${PREFIX} RPC errors:`, errors.slice(0, 5));
    fail(`${errors.length} RPC call(s) failed`);
  }

  const numbers = awardResults
    .map((r) => r.founderNumber)
    .filter((n): n is number => typeof n === "number");

  const unique = new Set(numbers);
  if (numbers.length !== unique.size) {
    const dupes = numbers.filter((n, i) => numbers.indexOf(n) !== i);
    fail(`Duplicate founder numbers assigned: ${[...new Set(dupes)].join(", ")}`);
  }

  const founderByUser = new Map(
    awardResults
      .filter((r) => typeof r.founderNumber === "number")
      .map((r) => [r.userId, r.founderNumber as number]),
  );

  if (founderByUser.size !== awardResults.filter((r) => r.newlyAwarded).length) {
    fail("newly_awarded count mismatch");
  }

  console.info(`${PREFIX} Assigned founder numbers: ${[...unique].sort((a, b) => a - b).join(", ")}`);
  console.info(`${PREFIX} All ${numbers.length} numbers are unique.`);

  // Idempotency: second parallel pass must not re-award or change numbers.
  const secondPass = await Promise.all(
    userIds.map((userId) =>
      admin.rpc("award_torch_bearer_badge", { p_user_id: userId, p_allow_admin: false }),
    ),
  );

  for (let i = 0; i < secondPass.length; i += 1) {
    const userId = userIds[i]!;
    const { data, error } = secondPass[i]!;
    if (error) fail(`idempotency RPC ${i}: ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.newly_awarded) {
      fail(`User ${i} was newly awarded twice`);
    }
    const expected = founderByUser.get(userId);
    if (typeof row?.founder_number === "number" && expected != null && row.founder_number !== expected) {
      fail(`User ${i} founder number changed on second call (${expected} → ${row.founder_number})`);
    }
  }

  console.info(`${PREFIX} Idempotency check passed (second pass returned existing numbers).`);

  // DB-level duplicate check for these users only.
  const { data: rows, error: queryError } = await admin
    .from("beta_founders")
    .select("user_id, founder_number")
    .in("user_id", userIds);

  if (queryError) fail(`beta_founders query: ${queryError.message}`);

  const dbNumbers = (rows ?? []).map((r) => r.founder_number);
  const dbUnique = new Set(dbNumbers);
  if (dbNumbers.length !== dbUnique.size) {
    fail("Duplicate founder_number rows in beta_founders for test users");
  }

  console.info(`${PREFIX} Cleaning up ${userIds.length} test users…`);
  for (const userId of userIds) {
    const { error: delError } = await admin.auth.admin.deleteUser(userId);
    if (delError) {
      console.warn(`${PREFIX} WARN could not delete ${userId}: ${delError.message}`);
    }
  }

  console.info(`${PREFIX} PASS — ${CONCURRENCY} concurrent awards, zero duplicate founder numbers.`);
}

main().catch((err) => {
  console.error(`${PREFIX} Unhandled error`, err);
  process.exit(1);
});
