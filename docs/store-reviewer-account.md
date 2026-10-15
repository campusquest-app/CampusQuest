# Store reviewer test account

Use this account for **App Store Connect**, **Google Play**, and **Samsung Galaxy Store** app review.
Do **not** publish these credentials in public marketing pages.

## Credentials

| Field | Value |
|--------|--------|
| Email | `qa_signup@campusquestapp.com` |
| Password | `[PASTE QA_TEST_ACCOUNT_PASSWORD HERE]` — stored only in production secrets / ASC |

Exact email match only (`lib/appReviewAccount.ts`). The provisioning script refuses any other email, and other `@campusquestapp.com` addresses are never pre-verified.

Provision / reset via:

```bash
QA_TEST_ACCOUNT_EMAIL=qa_signup@campusquestapp.com QA_TEST_ACCOUNT_PASSWORD='…' node scripts/ensure-qa-account.mjs
```

Or Admin → QA Account Reset (`/api/internal/admin/qa-account/reset`) when signed in as a platform admin.

Other QA test accounts still wipe onboarding on login so signup screens can be re-tested. The designated App Review account does **not**: completed onboarding, connections, DMs, and notifications survive every sign-in. `campus_email_verified_at` stays set. Use Admin → QA Account Reset only when you intentionally want a full wipe.

## Reviewer notes

1. Campus email is pre-verified: provisioning sets `profiles.campus_email_verified_at`, the same column a student's 6-digit code sets, so reviewers never need the mailbox or a code. Campus feature gates also treat it as an internal tester via `isInternalAccount`.
2. Role is `qa` / test — excluded from leaderboards, search, directories, analytics, founders, and competitive rewards.
3. After login, reviewers still walk the full onboarding UI; school-domain gate is synthetically satisfied.
4. Safety tools and account deletion are the real production flows. Reviewers may delete this account — see [Restoring the reviewer](#restoring-the-reviewer).

## Isolated review demo content

Migration `supabase/migrations/20261015120000_review_demo_isolation.sql` adds `is_review_demo` to
`profiles`, `quad_posts`, `campus_events`, and `student_organizations`.

**Isolation (enforced in the database):**

- A restrictive RLS policy, "review demo rows visible to qa only", on each table hides flagged rows from every
  session except QA test accounts (`public.cq_can_view_review_demo()`: `role = 'qa'` and `is_test_user`).
  Existing policies are unchanged; the restrictive policy only narrows them.
- Trigger `trg_protect_is_review_demo`: only the service role can set or clear the flag. Posts, events, and
  organizations created by a QA test account are always flagged, so anything the reviewer creates during review
  stays invisible to real students.
- Service-role reads that feed shared surfaces exclude flagged rows (`lib/server/reviewDemo.ts`): cached map pins,
  tag search, tag validation, engagement analytics. Demo profiles are in `listHiddenUserIds` /
  `listAnalyticsExcludedUserIds` and are leaderboard-ineligible.
- Demo map pins come from `/api/quests/map-pins/review-demo`, which reads through the reviewer's own session.

**Content** (`lib/reviewDemoSeed.ts`):

| Item | Detail |
|------|--------|
| Fictional profiles | `cqdemo_maya`, `cqdemo_jordan`, `cqdemo_priya` — GoTrue `ban_duration` (cannot authenticate) plus a random discarded password. They are **not** written to `user_account_safety`, so the reviewer can still message, friend, report, and block them |
| Events | 6 "[Demo]" events at Memorial Union, Carothers Library, The Quad, Ryan Center, Butterfield Dining Hall; start times refreshed on every seed |
| Posts | 5 public "[Demo]" posts |
| Organizations | "[Demo] URI Hiking Club" (sports) and "[Demo] Alpha Delta Demo" (greek_life) with demo members |
| Social | Jordan = accepted connection with an unread DM thread; Priya = pending follow request; Maya = not connected |
| Notifications | follow request, DM, connection accepted, org event announcement, event reminder — inserted directly (no push) |
| Perks | "CampusQuest Demo Café (Demo)" (`lib/partners/reviewDemoPartner.ts`) — QA sessions only |

**What is real vs simulated:**

- Real: report, block, messaging, accepting/sending friend requests, map events, notifications center,
  settings, and account deletion all run the production code paths against the demo rows.
- Simulated: the demo people never reply or act. Reports on demo content reach the normal moderation queue —
  dismiss anything filed against `cqdemo_*` users or "[Demo]" content.
- Perks: the demo pass is issued without any database write (no `partner_engagement_events`), carries
  `demo: true`, and is watermarked "DEMO · NOT VALID FOR REDEMPTION". It is not in `PARTNER_DIRECTORY`, so it
  can never create a merchant liability. Real merchant passes stay limited to verified students (`qa` is refused).

**Reseeding:** App Review login calls `ensureReviewDemoAfterLogin` (`lib/server/qaTestAccount.ts`). Catalog
rows upsert by fixed ids (event start times refresh). Social fixtures are gap-fill only: existing
connections, DMs, read state, blocks, and notifications are never deleted or overwritten. Failures are
logged and never block sign-in. Set `REVIEW_DEMO_SEED_DISABLED=true` to turn this off.

**Rollback:** remove demo rows first (`node scripts/seed-review-demo.mjs --remove --confirm`), then drop this
migration’s triggers, restrictive policies, and functions. Leave the `is_review_demo` columns. Never drop
the restrictive policies while flagged rows remain, or students would see them. Full SQL is in the header of
`supabase/migrations/20261015120000_review_demo_isolation.sql`.

Manual seed / removal (service-role env required):

```bash
node scripts/seed-review-demo.mjs --confirm            # create or refresh
node scripts/seed-review-demo.mjs --remove --confirm   # delete demo content and fictional users
```

## Restoring the reviewer

Account deletion is a hard delete (`lib/server/selfAccountDeletion.ts`). If a reviewer deletes the account:

1. Recreate it (requires the password secret; never commit or log it):
   `QA_TEST_ACCOUNT_EMAIL=qa_signup@campusquestapp.com QA_TEST_ACCOUNT_PASSWORD='…' node scripts/ensure-qa-account.mjs`
2. Restore demo content: `node scripts/seed-review-demo.mjs --confirm` (or sign in once — the login hook gap-fills missing fixtures).

The fictional demo profiles survive the reviewer's deletion; only the reviewer's own rows are removed.

## Public URLs for store listings

| Asset | URL |
|--------|-----|
| Privacy Policy | `https://campusquestapp.com/legal/privacy` |
| Terms of Service | `https://campusquestapp.com/legal/terms` |
| Community Guidelines | `https://campusquestapp.com/legal/community-guidelines` |
| Support | `https://campusquestapp.com/support` |
