/**
 * Local/hosted Supabase QR reward verification (no secrets printed).
 * Run: npx tsx scripts/verify-qr-reward.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { normalizeQrScanInput } from "../lib/client/normalizeQrScanInput";
import { campusQrScanSchema } from "../lib/server/validation";
import { resolveQrActivityLink } from "../lib/server/qrActivityLink";

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

const PREFIX = "[cq][qr-scan] verify";

function log(stage: string, payload: Record<string, unknown>) {
  console.info(`${PREFIX} ${stage}`, payload);
}

function check(name: string, ok: boolean, detail?: string) {
  const status = ok ? "PASS" : "FAIL";
  console.info(`${PREFIX} ${status} ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

async function main() {
  let passed = 0;
  let failed = 0;
  const mark = (ok: boolean) => (ok ? (passed += 1) : (failed += 1));

  const formats = [
    "GYM",
    "https://campusquest.app/scan?code=GYM",
    "http://localhost:3000/scan?code=GYM",
    "campusquest://scan?code=GYM",
    JSON.stringify({ type: "campusquest_activity", activityId: "GYM" }),
  ];
  for (const raw of formats) {
    const n = normalizeQrScanInput(raw);
    mark(check(`normalize: ${raw.slice(0, 40)}`, n?.code === "GYM", n?.code ?? "null"));
  }

  mark(check("schema GYM", campusQrScanSchema.safeParse({ code: "GYM" }).success));

  const migrationPath = resolve(
    process.cwd(),
    "supabase/migrations/20260601120000_qr_tables_bootstrap.sql",
  );
  mark(check("migration file exists", existsSync(migrationPath)));

  if (existsSync(migrationPath)) {
    const sql = readFileSync(migrationPath, "utf8");
    mark(check("migration seeds GYM", /'GYM'/.test(sql) && /xp_reward/.test(sql)));
    mark(check("migration xp 80 for GYM", /'GYM'[\s\S]*?80/.test(sql) || /xp_reward,\s*\n\s*80/.test(sql)));
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  mark(check("NEXT_PUBLIC_SUPABASE_URL set", Boolean(url)));
  mark(check("SUPABASE_SERVICE_ROLE_KEY set", Boolean(serviceKey)));
  mark(check("NEXT_PUBLIC_SUPABASE_ANON_KEY set", Boolean(anonKey)));

  const link = resolveQrActivityLink({
    code: "GYM",
    activityName: "Hitting the Gym",
    locationName: "URI Gym",
  });
  mark(
    check(
      "GYM stat mapping Strength +2",
      link?.stat === "strength" && link?.statGain === 2,
      link ? `${link.stat} +${link.statGain}` : "no link",
    ),
  );

  if (!url || !serviceKey) {
    console.info(`${PREFIX} skip supabase lookup — missing env`);
    console.info(`${PREFIX} done passed=${passed} failed=${failed}`);
    process.exit(failed > 0 ? 1 : 0);
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: gym, error } = await admin
    .from("qr_codes")
    .select("code, title, xp_reward, is_active, activity_name, type, cooldown_hours, max_scans_per_day")
    .eq("code", "GYM")
    .maybeSingle();

  log("supabase_lookup", {
    found: Boolean(gym),
    lookupError: error?.message ?? null,
    lookupCode: error?.code ?? null,
  });

  if (error) {
    const tablesMissing =
      /(schema cache|Could not find the table)/i.test(error.message ?? "") &&
      /qr_codes/i.test(error.message ?? "");
    mark(check("qr_codes table exists", !tablesMissing, error.message));
  } else {
    mark(check("qr_codes table exists", true));
  }

  mark(check("GYM row exists", Boolean(gym)));
  if (gym) {
    mark(check("GYM is_active", gym.is_active === true));
    mark(check("GYM xp_reward is 80", Number(gym.xp_reward) === 80, String(gym.xp_reward)));
    log("gym_row", {
      code: gym.code,
      xp_reward: gym.xp_reward,
      is_active: gym.is_active,
      activity_name: gym.activity_name,
      type: gym.type,
    });
  }

  const { data: unknown } = await admin
    .from("qr_codes")
    .select("code")
    .eq("code", "UNKNOWN_TEST")
    .maybeSingle();
  mark(check("UNKNOWN_TEST not in qr_codes", !unknown));

  console.info(`${PREFIX} done passed=${passed} failed=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(`${PREFIX} fatal`, e instanceof Error ? e.message : e);
  process.exit(1);
});
