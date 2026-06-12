# CampusQuest

**Your college life as an RPG.** Log real actions — gym, study, clubs, deep focus — and level up your character. Streaks, daily quests, boss battles (midterms/finals), and a social feed (The Quad). Instead of scrolling, you level up.

## Create & run the app

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:3000)
npm run dev
```

## Build for production

```bash
npm run build
npm start
```

## Local Auth Troubleshooting

Use this checklist when auth flows fail in local development.

### 1) Confirm required Supabase env variables exist

In `.env.local`, make sure these keys are present:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (required for server-side admin/service routes)

After any env change, restart `npm run dev`.

### 2) Handle “Email not confirmed”

If sign-in returns `Email not confirmed`, this is expected when Supabase email confirmation is enabled.

- UI should show:  
  `Please confirm your email before signing in. Check your inbox for the confirmation link.`
- Confirm via your inbox, then sign in again.

### 3) Resend confirmation email

From the auth screen:

- Click **Resend confirmation email** after unconfirmed-email feedback.
- The app calls `POST /api/auth/resend-confirmation` for the entered email.

### 4) Temporarily disable email confirmation (local testing)

In Supabase Auth settings for your local/staging project:

- Disable email confirmation / “Confirm email” requirement.
- Then new signups can return a session immediately.

Re-enable confirmation when done testing if your target behavior requires it.

### 5) Verify `/api/auth/login` works

- Attempt login in UI with a known account.
- In dev server logs, confirm `POST /api/auth/login` returns `200`.
- If it returns `401`, read the UI/dev error details (endpoint + status) and correct credentials/confirmation state.

### 6) Verify `/api/me/safety-status` works after login

After successful login, app requests `GET /api/me/safety-status`.

- Expect `200` for healthy flow.
- If non-200, use the shown endpoint/status detail to debug auth token validity, RLS, or missing safety row handling.

### Security reminder

Never paste real bearer tokens, session cookies, refresh tokens, or service role keys into chat, logs, screenshots, or GitHub.

## What’s in the app

- **Character** — Name, avatar, level, total XP, and five stats: Strength, Stamina, Knowledge, Social, Focus.
- **Log it** — Tap activities (gym, study, club, deep focus, run, exam prep, group study, meditate) to earn XP and stat gains.
- **The Quad** — Social feed: post on campus with #rammarks, nod and rally on others’ posts.
- **Daily quests** — Complete activities to finish quests and claim bonus XP.
- **Boss battles** — Midterms, finals, and group projects with due dates and XP on defeat.
- **Streaks** — Log at least one activity per day to keep your streak.

Data is stored in the browser (localStorage) for the MVP.

## Python CLI (optional)

A standalone CLI version of the same game logic lives in `scripts/`. It uses a JSON file at the project root (`campusquest_data.json`) and supports multiple users, activities, boss battles, and streaks.

```bash
# From project root (Python 3.7+)
python scripts/campusquest_cli.py
```

The CLI and the web app use separate data (CLI = JSON file, web = localStorage); they are not synced.

## Stack

- **Next.js 14** (App Router), **React 18**, **TypeScript**, **Tailwind CSS**

## Pilot Mode Configuration

CampusQuest pilot mode defaults the product to a single verified campus community.

Set these in `.env.local`:

- `PILOT_SCHOOL_NAME=University of Rhode Island`
- `PILOT_SCHOOL_DOMAIN=uri.edu`

Behavior in pilot mode:

- Students must sign in with a confirmed email on `PILOT_SCHOOL_DOMAIN` to access events, organizations, and student discovery.
- Verified school status is stored server-side in `user_school_verifications`.
- Event and organization feeds are scoped to the verified school domain by default.
- Personal email addresses are not shown in student-facing UI.
- For manual pilot validation, use `docs/pilot-smoke-test.md`.

## Internal Admin Access

CampusQuest supports multiple internal admin accounts through `MODERATION_ADMIN_EMAILS`.

### Configure admin emails

- Add a comma-separated list in `.env.local`:
  - `MODERATION_ADMIN_EMAILS=nicholaslockhart22@gmail.com,campusquest@campusquestapp.com`
- Email matching is normalized server-side:
  - lowercased
  - trimmed for whitespace
- To add/remove an admin:
  1. Edit `MODERATION_ADMIN_EMAILS` in your environment.
  2. Restart the app/server.
  3. Verify access by opening `/internal/admin` or `/internal/moderation`.

### Security rules

- Admin authorization is enforced **server-side only** through authenticated API routes.
- A user must be authenticated, have a verified email, and match `MODERATION_ADMIN_EMAILS`.
- Never grant admin access to unverified or untrusted emails.
- Never expose server keys (`MESSAGE_MODERATION_API_KEY`, `LEGAL_POLICY_ADMIN_KEY`) to client code.
- For a safe manual validation flow, use `docs/admin-smoke-test.md`.
- For the full MVP QA journey checklist, use `docs/mvp-qa-checklist.md`.

## Legal Policy Version Admin

CampusQuest includes an internal admin card (`Legal Policy Version`) for activating new policy versions and forcing legal re-consent.

### Required environment variables

- `LEGAL_POLICY_ADMIN_KEY`: server-side secret used to authorize legal policy version changes.
- `MODERATION_ADMIN_EMAILS`: comma-separated list of verified admin account emails allowed to access internal admin features.

### Rotate `LEGAL_POLICY_ADMIN_KEY`

1. Generate a new long random secret.
2. Update `LEGAL_POLICY_ADMIN_KEY` in your deployed environment and local `.env.local`.
3. Restart the app/server so the new value is loaded.
4. Invalidate old copies of the key in team secrets managers.

Never place `LEGAL_POLICY_ADMIN_KEY` in `NEXT_PUBLIC_*` variables or client-side code.

### Activate a new policy version

1. Sign in as an email listed in `MODERATION_ADMIN_EMAILS`.
2. Open the `Legal Policy Version` card in the dashboard backend preview area.
3. Enter a version in `YYYY-MM-DD.number` format (example: `2026-06-01.0`).
4. Click **Activate New Policy Version**.

### Re-consent behavior

Activating a new policy version immediately marks prior acceptances as outdated. Users must re-accept policies before continuing in the app.
