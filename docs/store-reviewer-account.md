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

On every login, the QA profile’s onboarding state is wiped so you can re-test signup screens (role selection, character creation, legal consent) without deleting the auth user. `campus_email_verified_at` is preserved for this account.

## Reviewer notes

1. Campus email is pre-verified: provisioning sets `profiles.campus_email_verified_at`, the same column a student's 6-digit code sets, so reviewers never need the mailbox or a code. Campus feature gates also treat it as an internal tester via `isInternalAccount`.
2. Role is `qa` / test — excluded from leaderboards, search, directories, analytics, founders, and competitive rewards.
3. After login, reviewers still walk the full onboarding UI; school-domain gate is synthetically satisfied.
4. To verify safety tools: open another profile → Report / Block; Settings → Delete account (do **not** delete the shared reviewer account—use a disposable account if testing deletion).

## Public URLs for store listings

| Asset | URL |
|--------|-----|
| Privacy Policy | `https://campusquestapp.com/legal/privacy` |
| Terms of Service | `https://campusquestapp.com/legal/terms` |
| Community Guidelines | `https://campusquestapp.com/legal/community-guidelines` |
| Support | `https://campusquestapp.com/support` |
