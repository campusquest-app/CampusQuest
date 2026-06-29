/**
 * Verify Torch Bearer founder numbering integrity (remote or local Supabase).
 *
 * Run after applying 20260706120000_torch_bearer_renumber_founders.sql:
 *   npx tsx scripts/verify-torch-bearer-founders.ts
 */
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

const PREFIX = "[cq][torch-verify]";

function abort(msg: string): never {
  console.error(`${PREFIX} FAIL: ${msg}`);
  process.exit(1);
}

function ok(msg: string) {
  console.info(`${PREFIX} OK: ${msg}`);
}

type FounderRow = {
  user_id: string;
  founder_number: number;
  awarded_at: string;
};

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  game_state_json: Record<string, unknown> | null;
};

function computeNextFounderNumber(used: Set<number>): number | null {
  for (let g = 1; g <= 30; g += 1) {
    if (!used.has(g)) return g;
  }
  return null;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) abort("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: founders, error: fErr } = await admin
    .from("beta_founders")
    .select("user_id, founder_number, awarded_at")
    .order("founder_number", { ascending: true });

  if (fErr) abort(`beta_founders query: ${fErr.message}`);

  const rows = (founders ?? []) as FounderRow[];
  const numbers = rows.map((r) => r.founder_number);
  const used = new Set(numbers);

  // ── Duplicate check ───────────────────────────────────────────────────────
  const seen = new Map<number, number>();
  for (const n of numbers) {
    seen.set(n, (seen.get(n) ?? 0) + 1);
  }
  const dupes = [...seen.entries()].filter(([, c]) => c > 1);
  if (dupes.length) {
    abort(`Duplicate founder numbers: ${dupes.map(([n, c]) => `#${n}×${c}`).join(", ")}`);
  }
  ok("No duplicate founder numbers");

  // ── Contiguity check (1..N with no gaps) ──────────────────────────────────
  const sorted = [...numbers].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i += 1) {
    if (sorted[i] !== i + 1) {
      abort(`Gap detected: expected #${i + 1} at position ${i}, found ${sorted[i] ?? "missing"}`);
    }
  }
  if (rows.length > 0) {
    ok(`Founder numbers contiguous 1..${rows.length}`);
  } else {
    ok("No founders yet (empty roster)");
  }

  // ── Next slot (matches award_torch_bearer_badge algorithm) ───────────────
  const next = computeNextFounderNumber(used);
  ok(`Next available founder number: ${next ?? "none (all 30 claimed)"}`);

  // ── Profile game_state sync ───────────────────────────────────────────────
  const userIds = rows.map((r) => r.user_id);
  const profileMap = new Map<string, ProfileRow>();

  if (userIds.length) {
    const { data: profiles, error: pErr } = await admin
      .from("profiles")
      .select("id, username, display_name, game_state_json")
      .in("id", userIds);
    if (pErr) abort(`profiles query: ${pErr.message}`);
    for (const p of (profiles ?? []) as ProfileRow[]) {
      profileMap.set(p.id, p);
    }
  }

  const syncIssues: string[] = [];
  for (const row of rows) {
    const p = profileMap.get(row.user_id);
    const gs = (p?.game_state_json ?? {}) as Record<string, unknown>;
    const cached = gs.torchBearerFounderNumber;
    const badge = gs.torchBearerBadge;
    const achievements = Array.isArray(gs.achievements) ? gs.achievements : [];
    const hasAchievement = achievements.includes("torch_bearer_badge");

    if (cached !== row.founder_number) {
      syncIssues.push(
        `user ${row.user_id}: beta_founders=#${row.founder_number} but game_state torchBearerFounderNumber=${String(cached)}`,
      );
    }
    if (badge !== true) {
      syncIssues.push(`user ${row.user_id}: torchBearerBadge not true in game_state`);
    }
    if (!hasAchievement) {
      syncIssues.push(`user ${row.user_id}: torch_bearer_badge missing from achievements array`);
    }
  }

  if (syncIssues.length) {
    abort(`Profile sync issues:\n  ${syncIssues.join("\n  ")}`);
  }
  ok("All founder profiles synced (torchBearerFounderNumber, torchBearerBadge, achievements)");

  // ── Report ────────────────────────────────────────────────────────────────
  console.info("");
  console.info(`${PREFIX} ── Torch Bearer Founder Report ──`);
  console.info(`${PREFIX} Remaining founder count: ${rows.length}`);
  console.info(`${PREFIX} Next founder number:     ${next ?? "N/A"}`);
  console.info(`${PREFIX} Slots remaining:         ${Math.max(0, 30 - rows.length)}`);
  console.info("");

  if (rows.length === 0) {
    console.info(`${PREFIX} No founders on record.`);
  } else {
    console.info(`${PREFIX} Current roster:`);
    for (const row of rows) {
      const p = profileMap.get(row.user_id);
      const label = p?.display_name || p?.username || row.user_id;
      console.info(
        `${PREFIX}   #${row.founder_number}  ${label}  (user=${row.user_id}, awarded=${row.awarded_at})`,
      );
    }
  }

  console.info("");
  console.info(`${PREFIX} Expected post-renumber state:`);
  console.info(`${PREFIX}   Founder numbers: 1, 2, 3`);
  console.info(`${PREFIX}   Next assignment: 4`);
  console.info(`${PREFIX} All integrity checks passed.`);

  if (rows.length === 3 && sorted[0] === 1 && sorted[1] === 2 && sorted[2] === 3 && next === 4) {
    console.info("");
    console.info(`${PREFIX} Renumber mapping (historical):`);
    console.info(`${PREFIX}   Old #2 → New #1`);
    console.info(`${PREFIX}   Old #3 → New #2`);
    console.info(`${PREFIX}   Old #4 → New #3`);
  }
}

main().catch((err) => abort(err instanceof Error ? err.message : String(err)));
