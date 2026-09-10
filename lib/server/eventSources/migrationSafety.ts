/**
 * Scan SQL for operations that automatic repair must never run.
 * Allowlisted: CREATE UNIQUE INDEX/constraint, CREATE INDEX, ADD nullable column,
 * reviewed identity-invariant repair, NOTIFY pgrst.
 */

export const PROHIBITED_MIGRATION_PATTERNS: Array<{ id: string; pattern: RegExp }> = [
  { id: "DROP TABLE", pattern: /\bdrop\s+table\b/i },
  { id: "DROP SCHEMA", pattern: /\bdrop\s+schema\b/i },
  { id: "TRUNCATE", pattern: /\btruncate\b(?!\s+_cq_ext_event_dupes\b)/i },
  { id: "DISABLE RLS", pattern: /\bdisable\s+row\s+level\s+security\b/i },
  { id: "DROP POLICY", pattern: /\bdrop\s+policy\b/i },
  { id: "RESET DATABASE", pattern: /\bdrop\s+database\b/i },
  { id: "GRANT SERVICE ROLE", pattern: /\bgrant\b[\s\S]{0,80}\bservice_role\b/i },
  { id: "ALTER TYPE DESTRUCTIVE", pattern: /\balter\s+column\b[\s\S]{0,80}\btype\b/i },
];

/** Scoped deletes that re-point duplicates before removing losers are the only allowed deletes. */
const ALLOWED_SCOPED_DELETE =
  /\bdelete\s+from\s+public\.(external_organizations|external_events|external_event_rsvps|external_event_map_overrides)\b/i;

export type MigrationSafetyResult = {
  safe: boolean;
  reason: string | null;
  prohibited: string[];
};

export function evaluateMigrationSafety(sql: string): MigrationSafetyResult {
  const prohibited: string[] = [];
  for (const rule of PROHIBITED_MIGRATION_PATTERNS) {
    if (rule.pattern.test(sql)) prohibited.push(rule.id);
  }

  const deleteMatches = sql.match(/\bdelete\s+from\b/gi) ?? [];
  if (deleteMatches.length > 0) {
    const withoutComments = sql.replace(/--.*$/gm, "");
    const statements = withoutComments.split(";");
    for (const statement of statements) {
      if (!/\bdelete\s+from\b/i.test(statement)) continue;
      if (!ALLOWED_SCOPED_DELETE.test(statement)) {
        prohibited.push("UNSCOPED DELETE");
        break;
      }
      if (!/using\s+ranked|using\s+_cq_ext_event_dupes|using\s+_ext_event_dupes/i.test(statement)) {
        prohibited.push("DELETE WITHOUT TIGHT SCOPE");
        break;
      }
    }
  }

  if (prohibited.length > 0) {
    return {
      safe: false,
      reason: `Automatic repair refused: ${prohibited.join(", ")}.`,
      prohibited,
    };
  }
  return { safe: true, reason: null, prohibited: [] };
}

export const APPROVED_IDENTITY_REPAIR_RPC = "cq_repair_external_identity_invariant";

export function extractSqlFunctionBody(sql: string, functionName: string): string | null {
  const escaped = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = sql.match(
    new RegExp(`create(?:\\s+or\\s+replace)?\\s+function\\s+(?:public\\.)?${escaped}\\s*\\([^)]*\\)([\\s\\S]*?)\\$\\$;`, "i"),
  );
  return match?.[1] ?? null;
}
