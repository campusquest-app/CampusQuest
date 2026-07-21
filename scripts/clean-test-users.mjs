#!/usr/bin/env node
/**
 * Remove all auth users except protected emails and cascade-delete their data.
 *
 * Usage: node scripts/clean-test-users.mjs
 * Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * Optional (faster / transactional): SUPABASE_DB_URL or DATABASE_URL
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const PROTECTED_EMAILS = new Set(
  [
    "campusquest@campusquestapp.com",
    "nicklockhart22@uri.edu",
    "nicholaslockhart22@gmail.com",
    // Permanent QA onboarding account — reset via admin panel, never deleted.
    "qa-signup@campusquest.app",
    "qa@campusquest.app",
  ].map((e) => e.toLowerCase()),
);

/** Tables and user-id columns to count before cleanup. */
const USER_TABLE_COLUMNS = [
  ["profiles", "id"],
  ["user_stats", "user_id"],
  ["xp_logs", "user_id"],
  ["user_quests", "user_id"],
  ["quest_completions", "user_id"],
  ["proof_submissions", "user_id"],
  ["guild_members", "user_id"],
  ["guild_xp_logs", "user_id"],
  ["guilds", "owner_id"],
  ["posts", "user_id"],
  ["comments", "user_id"],
  ["likes", "user_id"],
  ["boss_attempts", "user_id"],
  ["user_inventory", "user_id"],
  ["notifications", "user_id"],
  ["student_connections", "requester_id"],
  ["student_connections", "addressee_id"],
  ["direct_conversations", "created_by"],
  ["direct_conversation_participants", "user_id"],
  ["direct_messages", "sender_id"],
  ["direct_messages", "recipient_id"],
  ["blocked_users", "blocker_id"],
  ["blocked_users", "blocked_id"],
  ["message_reports", "reporter_id"],
  ["message_reports", "reported_user_id"],
  ["quad_posts", "user_id"],
  ["quad_post_comments", "user_id"],
  ["post_likes", "user_id"],
  ["quad_post_reactions", "user_id"],
  ["quad_spark_xp_grants", "sparker_user_id"],
  ["boss_drops", "user_id"],
  ["qr_scans", "user_id"],
  ["qr_suspicious_events", "user_id"],
  ["pinned_dm_users", "user_id"],
  ["pinned_dm_users", "pinned_user_id"],
  ["realm_moments", "user_id"],
  ["unlocked_milestones", "user_id"],
  ["event_rsvps", "user_id"],
  ["organization_members", "user_id"],
  ["campus_events", "created_by"],
  ["user_onboarding_preferences", "user_id"],
  ["user_legal_consents", "user_id"],
  ["user_beginner_quest_claims", "user_id"],
  ["user_account_safety", "user_id"],
  ["user_safety_appeals", "user_id"],
  ["direct_message_favorites", "user_id"],
  ["user_equipment_loadouts", "user_id"],
  ["user_school_verifications", "user_id"],
  ["campus_event_reports", "reporter_id"],
  ["organization_reports", "reporter_id"],
  ["organization_creation_requests", "requester_id"],
  ["organization_join_requests", "requester_id"],
  ["student_organizations", "created_by"],
];

function loadEnvLocal() {
  for (const name of [".env.local", ".env"]) {
    const path = resolve(root, name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
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

async function listAllAuthUsers(admin) {
  const users = [];
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const batch = data?.users ?? [];
    users.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
  }
  return users;
}

async function tableExists(client, table) {
  const { rows } = await client.query(
    `select 1 from information_schema.tables where table_schema = 'public' and table_name = $1 limit 1`,
    [table],
  );
  return rows.length > 0;
}

async function columnExists(client, table, column) {
  const { rows } = await client.query(
    `select 1 from information_schema.columns
     where table_schema = 'public' and table_name = $1 and column_name = $2 limit 1`,
    [table, column],
  );
  return rows.length > 0;
}

async function countRowsForUsers(client, table, column, deleteIds) {
  if (deleteIds.length === 0) return 0;
  if (!(await tableExists(client, table))) return 0;
  if (!(await columnExists(client, table, column))) return 0;
  const { rows } = await client.query(
    `select count(*)::int as c from public.${quoteIdent(table)} where ${quoteIdent(column)} = any($1::uuid[])`,
    [deleteIds],
  );
  return rows[0]?.c ?? 0;
}

function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

async function countAllTables(client, deleteIds) {
  const counts = {};
  for (const [table, column] of USER_TABLE_COLUMNS) {
    const key = `${table}.${column}`;
    counts[key] = await countRowsForUsers(client, table, column, deleteIds);
  }
  return counts;
}

async function deleteAuthUsersViaApi(admin, deleteIds) {
  let deleted = 0;
  const failures = [];
  for (const id of deleteIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) failures.push({ id, message: error.message });
    else deleted += 1;
  }
  return { deleted, failures };
}

async function cleanupWithPg(client, admin, deleteIds, protectedUsers) {
  const removedCounts = await countAllTables(client, deleteIds);

  await client.query("begin");
  try {
    // guilds.owner_id is ON DELETE RESTRICT — remove guilds owned by test users first.
    if (await tableExists(client, "guilds")) {
      const guildRes = await client.query(
        `delete from public.guilds where owner_id = any($1::uuid[]) returning id`,
        [deleteIds],
      );
      removedCounts["guilds.deleted_owned"] = guildRes.rowCount ?? 0;
    }

    const authRes = await client.query(`delete from auth.users where id = any($1::uuid[]) returning id`, [
      deleteIds,
    ]);
    removedCounts["auth.users"] = authRes.rowCount ?? 0;

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }

  // Orphan cleanup: rows referencing missing profiles/users.
  const orphanCounts = await cleanupOrphans(client, protectedUsers.map((u) => u.id));

  const fkIssues = await findFkViolations(client, protectedUsers.map((u) => u.id));

  return { removedCounts, orphanCounts, fkIssues, method: "postgres" };
}

async function cleanupOrphans(client, protectedIds) {
  const orphanCounts = {};

  async function del(table, whereSql, params, label) {
    if (!(await tableExists(client, table))) return;
    const { rowCount } = await client.query(
      `delete from public.${quoteIdent(table)} where ${whereSql} returning id`,
      params,
    );
    if (rowCount > 0) orphanCounts[label ?? table] = rowCount;
  }

  // Notifications for deleted recipients (should be gone; belt-and-suspenders).
  await del(
    "notifications",
    `user_id is not null and user_id <> all($1::uuid[])`,
    [protectedIds],
    "notifications.orphaned_recipients",
  );

  // Conversations with no participants.
  if (await tableExists(client, "direct_conversations")) {
    const { rowCount } = await client.query(
      `delete from public.direct_conversations dc
       where not exists (
         select 1 from public.direct_conversation_participants p
         where p.conversation_id = dc.id
       )`,
    );
    if (rowCount > 0) orphanCounts["direct_conversations.empty"] = rowCount;
  }

  // Quad posts without author profile.
  await del(
    "quad_posts",
    `user_id is not null and user_id <> all($1::uuid[])`,
    [protectedIds],
    "quad_posts.orphaned_authors",
  );

  // Legacy posts table.
  await del("posts", `user_id is not null and user_id <> all($1::uuid[])`, [protectedIds], "posts.orphaned_authors");

  // Pinned DMs referencing missing users.
  if (await tableExists(client, "pinned_dm_users")) {
    const { rowCount } = await client.query(
      `delete from public.pinned_dm_users
       where user_id <> all($1::uuid[]) or pinned_user_id <> all($1::uuid[])`,
      [protectedIds],
    );
    if (rowCount > 0) orphanCounts["pinned_dm_users.orphaned"] = rowCount;
  }

  return orphanCounts;
}

async function findFkViolations(client, protectedIds) {
  const issues = [];

  for (const [table, column] of USER_TABLE_COLUMNS) {
    if (!(await tableExists(client, table))) continue;
    if (!(await columnExists(client, table, column))) continue;

    const profileRef = column === "id" && table === "profiles";
    const refTable = ["boss_drops", "qr_scans", "pinned_dm_users"].includes(table) && column.includes("user")
      ? "auth.users"
      : "public.profiles";
    const refColumn = "id";

    if (profileRef) continue;

    const sql = `
      select count(*)::int as c
      from public.${quoteIdent(table)} t
      where t.${quoteIdent(column)} is not null
        and t.${quoteIdent(column)} <> all($1::uuid[])
        and not exists (
          select 1 from ${refTable} r where r.${quoteIdent(refColumn)} = t.${quoteIdent(column)}
        )`;

    try {
      const { rows } = await client.query(sql, [protectedIds]);
      const count = rows[0]?.c ?? 0;
      if (count > 0) issues.push({ table, column, orphanCount: count });
    } catch {
      // Some tables use auth.users — try both.
      try {
        const altSql = `
          select count(*)::int as c
          from public.${quoteIdent(table)} t
          where t.${quoteIdent(column)} is not null
            and t.${quoteIdent(column)} <> all($1::uuid[])
            and not exists (select 1 from auth.users r where r.id = t.${quoteIdent(column)})`;
        const { rows } = await client.query(altSql, [protectedIds]);
        const count = rows[0]?.c ?? 0;
        if (count > 0) issues.push({ table, column, orphanCount: count });
      } catch {
        // skip
      }
    }
  }

  return issues;
}

function summarizeCounts(counts) {
  const grouped = {};
  for (const [key, value] of Object.entries(counts)) {
    if (!value) continue;
    const [table] = key.split(".");
    grouped[table] = (grouped[table] ?? 0) + value;
  }
  return Object.entries(grouped).sort((a, b) => b[1] - a[1]);
}

async function main() {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const allUsers = await listAllAuthUsers(admin);
  const protectedUsers = allUsers.filter((u) => PROTECTED_EMAILS.has((u.email ?? "").toLowerCase()));
  const deleteUsers = allUsers.filter((u) => !PROTECTED_EMAILS.has((u.email ?? "").toLowerCase()));
  const deleteIds = deleteUsers.map((u) => u.id);

  console.log("\n=== CampusQuest test user cleanup ===\n");
  console.log("Protected accounts:");
  for (const email of PROTECTED_EMAILS) {
    const found = protectedUsers.find((u) => (u.email ?? "").toLowerCase() === email);
    console.log(`  ${found ? "✓" : "✗"} ${email}${found ? ` (${found.id})` : " — NOT FOUND"}`);
  }

  const missingProtected = [...PROTECTED_EMAILS].filter(
    (email) => !protectedUsers.some((u) => (u.email ?? "").toLowerCase() === email),
  );
  if (missingProtected.length > 0) {
    console.warn("\nWarning: some protected emails were not found in auth.users. Continuing anyway.\n");
  }

  console.log(`\nUsers to delete: ${deleteUsers.length}`);
  if (deleteUsers.length > 0) {
    for (const u of deleteUsers) {
      console.log(`  - ${u.email ?? "(no email)"} [${u.id}]`);
    }
  }

  if (deleteIds.length === 0) {
    console.log("\nNo users to delete. Database already clean.");
    process.exit(0);
  }

  let result;
  if (connectionString) {
    const pg = await import("pg");
    const client = new pg.default.Client({ connectionString, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
      result = await cleanupWithPg(client, admin, deleteIds, protectedUsers);
    } finally {
      await client.end();
    }
  } else {
    console.log("\nNo SUPABASE_DB_URL — using Auth Admin API (slower).");
    const preCounts = {};
    for (const [table, column] of USER_TABLE_COLUMNS) {
      const { count, error } = await admin
        .from(table)
        .select("*", { count: "exact", head: true })
        .in(column, deleteIds);
      if (!error && count) preCounts[`${table}.${column}`] = count;
    }

    if (await admin.from("guilds").select("id").in("owner_id", deleteIds).then((r) => !r.error)) {
      await admin.from("guilds").delete().in("owner_id", deleteIds);
    }

    const { deleted, failures } = await deleteAuthUsersViaApi(admin, deleteIds);
    result = {
      removedCounts: { ...preCounts, "auth.users": deleted },
      orphanCounts: {},
      fkIssues: [],
      method: "auth-api",
      failures,
    };
  }

  const remaining = await listAllAuthUsers(admin);

  console.log("\n=== Summary ===\n");
  console.log(`Users deleted: ${result.removedCounts["auth.users"] ?? deleteIds.length}`);
  console.log(`Users preserved: ${remaining.length}`);
  for (const u of remaining) {
    console.log(`  ✓ ${u.email ?? "(no email)"} [${u.id}]`);
  }

  console.log("\nRecords removed (by table, pre-delete counts where applicable):");
  const grouped = summarizeCounts(result.removedCounts);
  if (grouped.length === 0) {
    console.log("  (counts unavailable — cascade delete via auth)");
  } else {
    for (const [table, count] of grouped) {
      console.log(`  ${table}: ${count}`);
    }
  }

  if (Object.keys(result.orphanCounts).length > 0) {
    console.log("\nOrphan cleanup:");
    for (const [key, count] of Object.entries(result.orphanCounts)) {
      console.log(`  ${key}: ${count}`);
    }
  }

  if (result.failures?.length) {
    console.log("\nAuth delete failures:");
    for (const f of result.failures) {
      console.log(`  ${f.id}: ${f.message}`);
    }
  }

  console.log("\nForeign-key orphan check:");
  if (result.fkIssues.length === 0) {
    console.log("  ✓ No orphaned user references detected.");
  } else {
    for (const issue of result.fkIssues) {
      console.log(`  ✗ ${issue.table}.${issue.column}: ${issue.orphanCount} orphan(s)`);
    }
    process.exitCode = 1;
  }

  console.log(`\nCleanup method: ${result.method}`);
  console.log("Done.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
