# Production self-healing for event providers

CampusQuest imports campus events from **URInvolved** and **URI Athletics**. A failure in one provider must never wipe the other, invent events, disable RLS, or drop tables.

This system adds:

**DETECT → CLASSIFY → SAFE AUTO-REPAIR → VERIFY → RETRY → ALERT**

Code-level GitHub/Vercel auto-merge is **not** fully automated. Schema repair can run in production **after** the self-healing migration is applied once.

## Architecture

```
Vercel Cron  */30  →  /api/cron/provider-health
  inspect urinvolved + athletics
  if unhealthy → recovery controller
  if healthy → do nothing (no duplicate sync)

Daily 03:00 UTC  →  /api/cron/sync-urinvolved
  sync once
  schema/config/parser errors → recovery controller (no hammering)
  fetch/rate/db errors → existing bounded watchdog retries (0s, 2s, 10s)

Daily 03:30 UTC  →  /api/cron/sync-athletics
  inspect-only recovery (does not delete the 184 existing games)
```

Core modules:

- `lib/server/eventSources/recoveryController.ts` — classify, repair, verify, alert
- `lib/server/eventSources/incidentStore.ts` — `provider_incidents`
- `lib/server/eventSources/migrationSafety.ts` — refuse destructive SQL
- `lib/server/eventSources/providerHealthService.ts` — centralized health
- Allowlisted RPC `cq_repair_external_identity_invariant()`

## Detection

Health is recorded per source (`event_provider_health`):

- last success / last attempt
- current active count / last received
- consecutive failures
- latest error
- status: healthy, degraded, failed, configuration_required, repairing, …

Incidents are stored in `provider_incidents` (admin RLS). Open repairs are unique per provider (`diagnosing|repairing|awaiting_deployment|verifying`) so concurrent jobs cannot double-repair.

## Classification

| Error | Action |
| --- | --- |
| `EVENT_SCHEMA_INCOMPATIBLE` / missing ON CONFLICT unique | Validate invariant; run allowlisted repair RPC if present |
| Missing health/repair RPC | `manual_review_required` — apply SQL migration once |
| `URI_ATHLETICS_FEED_URL` missing | `manual_review_required` — do **not** invent a URL; keep existing Athletics rows |
| Auth failure | One limited retry, then notify |
| Rate limit / fetch / temporary DB | Bounded backoff retries; preserve inventory |
| Parser / unknown | Preserve inventory; notify; no destructive SQL |

## Repair policies (allowlist)

Automatic repair may:

- `CREATE UNIQUE INDEX` / named `UNIQUE(source, external_id)` after scoped duplicate re-point
- `CREATE INDEX`
- apply the reviewed RPC `cq_repair_external_identity_invariant`
- retry a failed sync
- update incident status

Automatic repair **refuses**:

- `DROP TABLE` / `DROP SCHEMA` / `TRUNCATE` (except the repair temp table)
- mass or unscoped `DELETE`
- destructive `ALTER COLUMN … TYPE`
- disable RLS, drop policies, disable auth
- reset the database or wholesale replace production data

If a candidate SQL file contains a prohibited operation, status is `manual_review_required`.

## Safety boundaries

- Failed fetch must not become `[]` then delete old events. Sync is staged: fetch → parse → validate → last-known-good gate → write only if healthy.
- All writes/deletes are `source`-scoped. URInvolved cannot mutate Athletics.
- Duplicate `(source, external_id)` losers are re-pointed (RSVPs, map overrides, `organization_id`) before delete.
- Secrets, tokens, JWTs, and emails are stripped from incident `technical_details` and logs.

## GitHub workflow

Workflows live in `.github/workflows/`:

- `ci.yml` — lint, typecheck, tests, migration-safety, production build
- `production-repair.yml` — same gates on `workflow_dispatch` / `repository_dispatch`. **Does not merge to main.**
- `post-deploy-verify.yml` — optional live POST to `/api/internal/admin/provider-verify`
- `provider-health.yml` — optional backup ping of `/api/cron/provider-health`

There is no agent that auto-commits a patch onto `main`. Use Cursor or a human PR after CI is green.

## Vercel deployment

Vercel already deploys from GitHub. After you merge to the production branch, Vercel builds as usual. In-place schema repair does **not** need a new deploy once `20260910180000_provider_self_healing.sql` is applied in Supabase.

`vercel.json` schedules `/api/cron/provider-health` every 30 minutes (Pro/Enterprise cron). Hobby plans only allow daily crons — keep the daily URI/Athletics jobs in that case.

## Supabase migration behavior

1. `20260905190000_external_events_identity_invariant` is the **correct invariant**: dedupe with FK re-point, then `UNIQUE(source, external_id)` on events and organizations, then `NOTIFY pgrst`. Production likely never applied it, and its health RPC only looked up **constraint names**, so a uniquely indexed table with a different name still failed preflight.
2. `20260910180000_provider_self_healing` is additive:
   - `cq_has_unique_source_external_id` (name-independent)
   - allowlisted repair RPC + advisory lock
   - `provider_incidents`
   - expanded health statuses

Apply **once** via Supabase SQL editor or CLI. Do not run auto-repair until the RPC exists; the controller will ask for this migration instead of looping.

Read-only checks: `supabase/verify/external_identity_invariant.sql`.

## Notifications

Uses existing Resend (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`). Recipients come **only** from `CQ_PRODUCTION_ALERT_EMAIL` (comma-separated). No personal address is hard-coded.

Mails are sent when:

- an incident cannot be auto-resolved
- a repair verifies successfully
- an automatic repair fails

If the env var or Resend key is missing, the incident is still stored and a server log records `alert_skipped`.

## How to disable auto-repair

Set `CQ_AUTO_REPAIR_ENABLED=false` on Vercel (Production) and redeploy.

Detection, incidents, and alerts still run. The allowlisted RPC will not run unless an admin clicks **Run safe repair** (admin trigger bypasses the kill switch).

## How to intervene manually

1. Admin → Event sources: read Healthy / Failed / Repairing / Manual Review.
2. Collapsible technical details + incident before/after inventory.
3. **Retry Sync** — source-scoped import only.
4. **Run safe repair** — `POST /api/internal/admin/provider-repair`.
5. **Safe URInvolved resync** — last-known-good catalog publish.
6. Apply pending SQL in Supabase if the incident says the repair RPC is missing.
7. Set `URI_ATHLETICS_FEED_URL` if Athletics shows Configuration Required. Do not delete the existing ~184 events.

Internal (not public) endpoints, authenticated with an admin session **or** `Authorization: Bearer CQ_INTERNAL_REPAIR_SECRET` (falls back to `CRON_SECRET`):

- `GET /api/internal/admin/provider-health`
- `POST /api/internal/admin/provider-repair`
- `POST /api/internal/admin/provider-verify`
- `GET /api/internal/admin/incidents`

## How to test the recovery flow

Automated: `npm test`, `npm run check:migration-safety`.

Staging / production-safe simulation:

1. Configure `CQ_PRODUCTION_ALERT_EMAIL` and `RESEND_API_KEY`.
2. Apply `20260910180000` in Supabase.
3. From a signed-in admin browser, Event sources → **Run safe repair** on URInvolved, or:

```bash
curl -X POST "$PRODUCTION_APP_URL/api/internal/admin/provider-repair" \
  -H "Authorization: Bearer $CQ_INTERNAL_REPAIR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"source":"urinvolved"}'
```

4. Confirm an incident row, Athletics count unchanged, and (if configured) an email.
5. Do **not** drop production uniques or truncate `external_events` to simulate failure.

Athletics with a missing feed URL already exercises `configuration_missing` (alert + Manual Review) without deleting inventory.
