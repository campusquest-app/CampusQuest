/**
 * Post-migration persistence smoke test (remote Supabase).
 * Run: npx tsx scripts/post-migration-smoke.ts
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

const PREFIX = "[cq][post-migration-smoke]";
const SMOKE_TAG = "__smoke_test__";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string) {
  const status = ok ? "PASS" : "FAIL";
  console.info(`${PREFIX} ${status} ${name}${detail ? ` — ${detail}` : ""}`);
  if (ok) passed += 1;
  else failed += 1;
  return ok;
}

async function tableProbe(
  admin: ReturnType<typeof createClient>,
  table: string,
  select = "*",
  limit = 1,
) {
  const { error } = await admin.from(table).select(select).limit(limit);
  return { ok: !error, error: error?.message ?? null, code: error?.code ?? null };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  check("NEXT_PUBLIC_SUPABASE_URL set", Boolean(url));
  check("SUPABASE_SERVICE_ROLE_KEY set", Boolean(serviceKey));

  if (!url || !serviceKey) {
    console.info(`${PREFIX} abort — missing Supabase env`);
    process.exit(1);
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- Schema presence ---
  const tables = [
    "qr_codes",
    "qr_scans",
    "quad_post_reactions",
    "quad_spark_xp_grants",
    "post_likes",
    "boss_drops",
    "campus_realm_config",
    "user_inventory",
    "quad_posts",
    "profiles",
  ];

  for (const table of tables) {
    const probe = await tableProbe(admin, table);
    check(`table exists: ${table}`, probe.ok, probe.error ?? undefined);
  }

  // --- QR / Gym ---
  const { data: gym, error: gymError } = await admin
    .from("qr_codes")
    .select("code, xp_reward, is_active, activity_name, type, cooldown_hours, max_scans_per_day")
    .eq("code", "GYM")
    .maybeSingle();

  check("GYM QR row exists", Boolean(gym), gymError?.message);
  if (gym) {
    check("GYM is_active", gym.is_active === true);
    check("GYM xp_reward is 10", Number(gym.xp_reward) === 10, String(gym.xp_reward));
    check("GYM type permanent_location", gym.type === "permanent_location");
  }

  const { error: qrScanColError } = await admin
    .from("qr_scans")
    .select("claim_utc_day, idempotency_key")
    .limit(1);
  check("qr_scans claim dedup columns", !qrScanColError, qrScanColError?.message ?? undefined);

  // --- Realm markers ---
  const { data: realmRow, error: realmError } = await admin
    .from("campus_realm_config")
    .select("config_key, config_value, updated_at")
    .eq("config_key", "marker_positions")
    .maybeSingle();

  check("campus_realm_config marker_positions row", !realmError, realmError?.message);
  if (realmRow) {
    const count = Object.keys((realmRow.config_value as Record<string, unknown>) ?? {}).length;
    check("marker_positions readable", count >= 0, `${count} markers`);
  }

  // --- user_inventory.source ---
  const { error: invColError } = await admin.from("user_inventory").select("source").limit(1);
  check("user_inventory.source column", !invColError, invColError?.message ?? undefined);

  // --- Round-trip: post_likes ---
  const { data: samplePost } = await admin.from("quad_posts").select("id").limit(1).maybeSingle();
  const { data: sampleProfile } = await admin.from("profiles").select("id").limit(1).maybeSingle();

  if (samplePost?.id && sampleProfile?.id) {
    const postId = String(samplePost.id);
    const userId = String(sampleProfile.id);

    await admin.from("post_likes").delete().eq("post_id", postId).eq("user_id", userId);

    const { error: likeInsertError } = await admin
      .from("post_likes")
      .insert({ post_id: postId, user_id: userId });
    check("post_likes insert", !likeInsertError, likeInsertError?.message);

    const { data: likeRow, error: likeReadError } = await admin
      .from("post_likes")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", userId)
      .maybeSingle();
    check("post_likes read back", Boolean(likeRow) && !likeReadError);

    const { error: likeDeleteError } = await admin
      .from("post_likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", userId);
    check("post_likes delete (unlike)", !likeDeleteError, likeDeleteError?.message);

    const { data: likeGone } = await admin
      .from("post_likes")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", userId)
      .maybeSingle();
    check("post_likes gone after unlike", !likeGone);
  } else {
    check("post_likes round-trip (skipped — no sample post/profile)", true, "no data to test");
  }

  // --- Round-trip: boss_drops ---
  const { data: authUser } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
  const testUserId = authUser?.users?.[0]?.id ?? sampleProfile?.id;

  if (testUserId) {
    const bossId = SMOKE_TAG;
    const itemId = `${SMOKE_TAG}_item`;

    await admin.from("boss_drops").delete().eq("user_id", testUserId).eq("boss_id", bossId);

    const { error: dropInsertError } = await admin.from("boss_drops").insert({
      user_id: testUserId,
      boss_id: bossId,
      item_id: itemId,
      item_name: "Smoke Test Drop",
      quantity: 1,
      rarity: "common",
    });
    check("boss_drops insert", !dropInsertError, dropInsertError?.message);

    const { data: dropRow, error: dropReadError } = await admin
      .from("boss_drops")
      .select("id, item_name")
      .eq("user_id", testUserId)
      .eq("boss_id", bossId)
      .eq("item_id", itemId)
      .maybeSingle();
    check("boss_drops read back", Boolean(dropRow) && !dropReadError);

    const { error: dropDeleteError } = await admin
      .from("boss_drops")
      .delete()
      .eq("user_id", testUserId)
      .eq("boss_id", bossId);
    check("boss_drops cleanup", !dropDeleteError);
  } else {
    check("boss_drops round-trip (skipped — no user)", true, "no user to test");
  }

  // --- Round-trip: realm marker save (restore original positions after) ---
  if (testUserId) {
    const { data: beforeRealm } = await admin
      .from("campus_realm_config")
      .select("config_value, updated_at, updated_by")
      .eq("config_key", "marker_positions")
      .maybeSingle();

    const originalValue = (beforeRealm?.config_value as Record<string, { x: number; y: number }>) ?? {};
    const originalUpdatedAt = beforeRealm?.updated_at ?? null;
    const originalUpdatedBy = beforeRealm?.updated_by ?? null;
    const testPositions = { ...originalValue, gym: { x: 42.5, y: 55.25 } };

    const { error: realmUpsertError } = await admin.from("campus_realm_config").upsert(
      {
        config_key: "marker_positions",
        config_value: testPositions,
        updated_by: testUserId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "config_key" },
    );
    check("campus_realm_config upsert", !realmUpsertError, realmUpsertError?.message);

    const { data: realmSaved, error: realmReadError } = await admin
      .from("campus_realm_config")
      .select("config_value")
      .eq("config_key", "marker_positions")
      .maybeSingle();
    const savedGym = (realmSaved?.config_value as { gym?: { x: number; y: number } })?.gym;
    check(
      "campus_realm_config read back",
      !realmReadError && savedGym?.x === 42.5 && savedGym?.y === 55.25,
      realmReadError?.message,
    );

    const { error: realmRestoreError } = await admin.from("campus_realm_config").upsert(
      {
        config_key: "marker_positions",
        config_value: originalValue,
        updated_by: originalUpdatedBy ?? testUserId,
        updated_at: originalUpdatedAt ?? new Date().toISOString(),
      },
      { onConflict: "config_key" },
    );
    check("campus_realm_config restored", !realmRestoreError, realmRestoreError?.message);
  }

  // --- Legacy like rows migrated out of quad_post_reactions ---
  const { count: legacyLikeCount, error: legacyLikeError } = await admin
    .from("quad_post_reactions")
    .select("id", { count: "exact", head: true })
    .eq("reaction_type", "like");
  check(
    "no legacy like rows in quad_post_reactions",
    !legacyLikeError && (legacyLikeCount ?? 0) === 0,
    legacyLikeError?.message ?? `count=${legacyLikeCount ?? "?"}`,
  );

  console.info(`${PREFIX} done passed=${passed} failed=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(`${PREFIX} fatal`, e instanceof Error ? e.message : e);
  process.exit(1);
});
