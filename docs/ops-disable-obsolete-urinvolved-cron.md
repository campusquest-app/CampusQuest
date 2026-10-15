# Disable the obsolete URInvolved cron (old Vercel project)

Production CampusQuest is **`campus-quest-mli4`** (`https://campusquestapp.com`).
Do **not** change crons on that project.

The leftover job lives on the unused **`campus-quest`** project:

| Project | Cron | Schedule | Action |
|---|---|---|---|
| `campus-quest-mli4` (production) | `/api/cron/sync-campus-events` | `0 3 * * *` | Leave as-is |
| `campus-quest-mli4` (production) | `/api/cron/provider-health` | `*/30 * * * *` | Leave as-is |
| `campus-quest-mli4` (production) | `/api/cron/cleanup-quad-media` | `30 4 * * *` | Leave as-is |
| `campus-quest` (obsolete) | `/api/cron/sync-urinvolved` | `0 3 * * *` | Disable |

Current production `vercel.json` already schedules `sync-campus-events`, not `sync-urinvolved`. The old project still has a previously deployed cron.

## Dashboard (preferred)

1. Open [Vercel](https://vercel.com) → team **CampusQuest**.
2. Open project **`campus-quest`**. Confirm the production URL is **not** `campusquestapp.com`.
3. Settings → Cron Jobs.
4. Delete or disable **`/api/cron/sync-urinvolved`**.
5. Do not open **`campus-quest-mli4`** for this change.

## CLI (verify only, then dashboard delete)

```bash
npx vercel whoami
npx vercel cron ls --project campus-quest --scope campus-quest
npx vercel cron ls --project campus-quest-mli4 --scope campus-quest
```

The first list should show `sync-urinvolved`. The second should show the three production jobs above.

Do **not** run `vercel deploy --prod` against `campus-quest`. Local `vercel.json` differs from that project; a deploy would not update `campus-quest-mli4` and could revive old app code on the unused project.

## Optional: pause the unused project

If `campus-quest` is no longer serving traffic, pause or archive the whole project in Vercel after the cron is removed. That prevents any leftover schedule from coming back on the next accidental deploy there.

## Afterward

Re-run `npx vercel cron ls --project campus-quest --scope campus-quest` and confirm `sync-urinvolved` is gone. Re-run the mli4 list and confirm the three production crons are unchanged.
