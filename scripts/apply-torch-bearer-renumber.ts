/**
 * Apply Torch Bearer founder renumber migration (remote Supabase Postgres).
 *
 * Dry-run (default): prints current state only.
 * Apply:            APPLY=true npx tsx scripts/apply-torch-bearer-renumber.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

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

const PREFIX = "[cq][torch-renumber]";
const APPLY = process.env.APPLY === "true";

function abort(msg: string): never {
  console.error(`${PREFIX} FAIL: ${msg}`);
  process.exit(1);
}

async function main() {
  const dbUrl =
    process.env.SUPABASE_DB_URL ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL;

  if (!dbUrl) {
    abort("Missing SUPABASE_DB_URL, DATABASE_URL, or POSTGRES_URL in .env.local");
  }

  const sqlPath = resolve(
    process.cwd(),
    "supabase/migrations/20260706120000_torch_bearer_renumber_founders.sql",
  );
  if (!existsSync(sqlPath)) abort(`Migration file not found: ${sqlPath}`);

  const migrationSql = readFileSync(sqlPath, "utf8");
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

  await client.connect();

  try {
    const before = await client.query<{ founder_number: number; user_id: string }>(
      "select user_id, founder_number from public.beta_founders order by founder_number",
    );
    console.info(`${PREFIX} Before (${before.rows.length} founders):`);
    for (const r of before.rows) {
      console.info(`${PREFIX}   user=${r.user_id}  #${r.founder_number}`);
    }

    if (!APPLY) {
      console.info("");
      console.info(`${PREFIX} Dry-run only. Set APPLY=true to execute migration.`);
      return;
    }

    console.info("");
    console.info(`${PREFIX} Applying migration…`);
    await client.query(migrationSql);

    const after = await client.query<{ founder_number: number; user_id: string }>(
      "select user_id, founder_number from public.beta_founders order by founder_number",
    );
    console.info(`${PREFIX} After (${after.rows.length} founders):`);
    for (const r of after.rows) {
      console.info(`${PREFIX}   user=${r.user_id}  #${r.founder_number}`);
    }

    const next = await client.query<{ next: number | null }>(`
      select min(g)::int as next
      from generate_series(1, 30) as g
      left join public.beta_founders bf on bf.founder_number = g
      where bf.founder_number is null
    `);
    console.info(`${PREFIX} Next available founder number: ${next.rows[0]?.next ?? "none"}`);
    console.info(`${PREFIX} Migration applied successfully.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => abort(err instanceof Error ? err.message : String(err)));
