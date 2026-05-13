# CampusQuest Admin Smoke Test Guide

Use this guide to verify internal admin functionality safely in the browser without sharing real tokens.

## Safety first

- Never paste real production bearer tokens or session cookies into chat, Cursor, logs, or GitHub.
- Use dedicated test accounts and seeded test data only.
- Run this in local/dev or a staging environment.

## 1) Sign in with approved admin account

Confirm your admin email is listed in `MODERATION_ADMIN_EMAILS` (in `.env.local`), for example:

- `nicholaslockhart22@gmail.com`
- `campusquest@campusquestapp.com`

Then sign in normally through the app UI.

Listed moderators **do not** need a `@uri.edu` address: pilot campus features (events, clubs, Friends, inbox) resolve as campus-eligible, scoped like the pilot school. Internal tooling (`/internal/admin`, `/internal/moderation`, `/api/internal/admin/*`) still requires `MODERATION_ADMIN_EMAILS` plus authenticated, confirmed email.

## 2) Visit admin pages

Open:

- `/internal/admin`
- `/internal/moderation`

Expected:

- Approved admin account: dashboard content loads.
- Non-admin account: UI shows  
  `You do not have permission to access this area.`

## 3) Seed safe test data (recommended)

Before testing actions, run the SQL seed:

- File: `supabase/seeds/admin_smoke_test_seed.sql`
- Run in Supabase SQL Editor (or local SQL workflow).

This seed creates deterministic **test-only** conversation/report/appeal data using explicit test emails you set in the script.

## 4) Manual admin action checklist

### Reported Messages

- Resolve a reported message.
- Dismiss a different reported message.
- Suspend a reported test user.
- Ban a reported test user.

### User Safety Management

- Search by username, display name, and email.
- Suspend a test user (optional expiration date).
- Reactivate that test user.

### Appeals

- Open a pending test appeal.
- Approve one appeal (reactivation path).
- Deny one appeal.

### Legal Policy Version

- View current active version.
- Activate a new test version (format: `YYYY-MM-DD.number`, example `2026-06-15.1`).
- Confirm users are required to re-accept policies afterward.

### Audit Logs

After each action above, verify a new entry appears with:

- admin email
- action type
- target user
- timestamp
- reason/metadata

## 5) Post-test cleanup (optional)

- Re-activate any suspended/banned test users.
- Keep test data clearly labeled (`[SMOKE TEST]`) for easy filtering/removal.
