# Store reviewer test account

Use this account for **App Store Connect**, **Google Play**, and **Samsung Galaxy Store** app review.
Do **not** publish these credentials in public marketing pages.

## Credentials

| Field | Value |
|--------|--------|
| Email | `qa_signup@campusquestapp.com` (or `QA_TEST_ACCOUNT_EMAIL` in production secrets) |
| Password | `[PASTE QA_TEST_ACCOUNT_PASSWORD HERE]` — stored only in production secrets / ASC |

Exact email match only. Other `@campusquestapp.com` addresses do **not** bypass campus verification.

Provision / reset via:

```bash
QA_TEST_ACCOUNT_EMAIL=qa_signup@campusquestapp.com QA_TEST_ACCOUNT_PASSWORD='…' node scripts/ensure-qa-account.mjs
```

Or Admin → QA Account Reset (`/api/internal/admin/qa-account/reset`) when signed in as a platform admin.

On every login, the QA profile’s onboarding state is wiped so you can re-test signup screens (role selection, character creation, legal consent) without deleting the auth user.

## Reviewer notes

1. This account bypasses campus-email (`@uri.edu`) restrictions via `isInternalAccount`.
2. Role is `qa` / test — excluded from leaderboards, search, directories, analytics, founders, and competitive rewards.
3. After login, reviewers still walk the full onboarding UI; school-domain gate is synthetically satisfied.
4. To verify safety tools: open another profile → Report / Block; Settings → Delete account (do **not** delete the shared reviewer account—use a disposable account if testing deletion).

## Public URLs for store listings

| Asset | URL |
|--------|-----|
| Privacy Policy | `https://campusquest.app/legal/privacy` |
| Terms of Service | `https://campusquest.app/legal/terms` |
| Community Guidelines | `https://campusquest.app/legal/community-guidelines` |
| Support | `https://campusquest.app/support` |
