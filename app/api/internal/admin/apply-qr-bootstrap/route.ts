import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { requireQrAdminUser } from "@/lib/server/adminAuth";
import { ApiError, fail, ok } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";
import { enforceRateLimit } from "@/lib/server/security";

function migrationPath() {
  const preferred = resolve(process.cwd(), "supabase/migrations/20260602120000_qr_tables_bootstrap.sql");
  if (existsSync(preferred)) return preferred;
  const legacy = resolve(process.cwd(), "supabase/migrations/20260601120000_qr_tables_bootstrap.sql");
  if (existsSync(legacy)) return legacy;
  throw new ApiError(500, "qr_tables_bootstrap migration file not found.", "MIGRATION_FILE_MISSING");
}

async function applyWithPg(sql: string) {
  const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new ApiError(
      400,
      "Set SUPABASE_DB_URL in .env.local (Supabase → Project Settings → Database → Connection string), then retry.",
      "SUPABASE_DB_URL_MISSING",
    );
  }
  const pg = await import("pg");
  const client = new pg.default.Client({
    connectionString,
    ssl: connectionString.includes("localhost") ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

/** POST — apply qr_tables_bootstrap migration (admin only). */
export async function POST(request: Request) {
  try {
    const auth = await requireQrAdminUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "admin:apply-qr-bootstrap", limit: 3, windowMs: 60_000 });

    const sql = readFileSync(migrationPath(), "utf8");
    await applyWithPg(sql);

    const admin = createAdminClient();
    const { data: gym, error } = await admin.from("qr_codes").select("code, title").eq("code", "GYM").maybeSingle();
    if (error) {
      throw new ApiError(400, error.message, "QR_VERIFY_FAILED");
    }

    return ok({
      applied: true,
      migration: "qr_tables_bootstrap",
      gym: gym ?? null,
      message: "QR tables created. Restart the dev server, then test /scan?code=GYM.",
    });
  } catch (error) {
    return fail(error);
  }
}
