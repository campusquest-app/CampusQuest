# CampusQuest

CampusQuest is a student-built campus community platform founded at the University of Rhode Island and operated by CampusQuest, Inc.

The production app helps students connect, discover campus events, find organizations, explore campus, and use local student perks. The live website is [https://campusquestapp.com](https://campusquestapp.com). The official GitHub repository is [campusquest-app/CampusQuest](https://github.com/campusquest-app/CampusQuest).

This README is the onboarding guide for CampusQuest developers. The product description below matches the current application. Older gamification surfaces still exist in the code, but they are turned off for students.

## Current Features

These are the student-facing areas in the current app. The bottom navigation is Home, Perks, Explore, Events, and Profile.

| Area | What it does |
| --- | --- |
| The Quad | Campus social feed. The feed switcher includes Campus Feed, For You, Following, Organizations, The Market, Local Businesses, Greek Life, and Athletics. Students can publish text and media posts. Anonymous posts are supported; the public post does not show the author. |
| Embers | Appreciation on Quad posts. A verified student can give a limited number of Embers each day. Embers do not award points, levels, or leaderboard progress. |
| Campus events | Event discovery, including synced campus sources, with RSVP when that event allows it. |
| Organizations and Greek Life | Organization, Greek Life, and Athletics feeds, plus organization profiles. |
| Campus map | The Explore tab (The Realm) is an interactive Google Map of campus locations and events. |
| Direct messages | One-to-one and group conversations, including photos, voice notes, and sharing a Quad post. |
| Student Perks | Local business partnerships, favorites, suggestions, and reward passes. The dock label is Perks. In code this area is `partners`. |
| Profiles and verification | Student profiles, follows, and University of Rhode Island email verification. |
| Notifications | In-app inbox for social and campus activity. Messages and notifications open from the same inbox. |

Account safety tools also exist in the product: block, report, and account deletion. Internal moderation and admin screens live under `/internal/admin` and `/internal/moderation`. Those screens are for authorized CampusQuest operators, not for routine feature work.

### Hidden and legacy surfaces

`lib/featureFlags.ts` turns these student surfaces off. The code, APIs, and data are still in the repository. Do not describe them as the current product, and do not delete them as part of unrelated work.

- Progression is off. That hides the scanner, character stats, leaderboards, the gamification quest board, mini-games, guilds, and XP rewards.
- Manual activity logging, boss battles, Codex, and Equipment are separately hidden.
- Supabase email confirmation is not required for campus access while `requireEmailVerification` is `false`. URI campus verification uses its own email code.
- `scripts/campusquest_cli.py` and `campusquest_data.json` are an old local game CLI. They are not connected to the web app.
- `mobile/` is an obsolete Expo prototype. Do not use it. The iOS app is `native/`.

## Technology Stack

| Piece | Used for |
| --- | --- |
| Next.js 14 (App Router) | Web application and API routes |
| React 18 | Interface |
| TypeScript | Application code |
| Tailwind CSS | Styling |
| Supabase | Auth, Postgres database, storage, and row-level security |
| Zod | Request validation |
| Vitest | Automated tests |
| Google Maps | Campus map |
| Vercel | Production web hosting and scheduled jobs in `vercel.json` |
| Capacitor 8 | iOS shell in `native/` |

Continuous integration uses Node.js 24. Install Node.js 24 before working in this repository. See `.github/workflows/ci.yml`.

## Getting Started — CampusQuest Developers

### 1. Get repository access

Ask a CampusQuest maintainer for access to the GitHub organization `campusquest-app` and the `CampusQuest` repository. Do not start from a personal copy of the project unless a maintainer tells you to.

Clone the official repository:

```bash
git clone https://github.com/campusquest-app/CampusQuest.git
cd CampusQuest
```

### 2. Install dependencies

```bash
npm ci
```

`npm ci` installs the exact versions in `package-lock.json`. That is the install used in GitHub Actions.

### 3. Configure the environment

Create a `.env.local` file in the repository root. It is gitignored. A maintainer must give you development values. There is no committed `.env.example`.

Variable names are listed in [Environment Configuration](#environment-configuration). Never copy a production service-role key or production student data into this file.

### 4. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Restart the server after any environment change. `NEXT_PUBLIC_*` values are read when the dev server starts.

### 5. Run checks

```bash
npm test
npm run typecheck
npm run lint
npm run check:migration-safety
```

`npm test` runs Vitest. `npm run build` compiles a production build and is also part of CI. Use it before a pull request when your change touches rendering, routing, or server code.

### 6. Create a branch

`main` is the only long-lived branch. There is no `develop` branch.

```bash
git checkout main
git pull
git checkout -b feature/event-filters
```

Use `feature/` for new work and `fix/` for bug fixes. Examples: `feature/event-filters`, `fix/ember-animation`.

### 7. Open a pull request

Push the branch and open a pull request into `main`. Fill in what changed and how you tested it. GitHub Actions runs lint, typecheck, tests, the migration-safety check, and a production build on pull requests.

Do not merge your own pull request. A reviewer must approve it first.

## Environment Configuration

Put secrets only in `.env.local` or in the hosting provider's environment settings. Do not commit them, paste them into issues, or print them in logs.

### Needed for local development

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. Safe to expose to the browser. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key. Safe to expose to the browser. Row-level security still applies. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key. Bypasses row-level security. Required by server admin routes. |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Browser key for the campus map. |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | Google vector map ID. `NEXT_PUBLIC_GOOGLE_MAP_ID` is a legacy alias. |
| `RESEND_API_KEY` | Sends the URI verification email. |
| `EMAIL_VERIFICATION_SECRET` | Server secret used to hash verification codes. |

Campus signup defaults to the University of Rhode Island and `@uri.edu` when these are unset:

| Variable | Purpose |
| --- | --- |
| `PILOT_SCHOOL_NAME` | School name. Default: University of Rhode Island. |
| `PILOT_SCHOOL_DOMAIN` | Required email domain. Default: `uri.edu`. |
| `NEXT_PUBLIC_PILOT_SCHOOL_DOMAIN` | Optional client override of the same domain. |

### Server-only settings for maintainers

Do not request these unless your task needs them.

| Variable | Purpose |
| --- | --- |
| `MODERATION_ADMIN_EMAILS` | Comma-separated verified emails allowed into internal admin tools. |
| `MESSAGE_MODERATION_API_KEY` | Server key for moderation routes. |
| `LEGAL_POLICY_ADMIN_KEY` | Server key for activating a legal policy version. |
| `GOOGLE_MAPS_SERVER_API_KEY` | Server geocoding. `GOOGLE_MAPS_GEOCODING_API_KEY` is an alternate name. |
| `CRON_SECRET` | Authorizes scheduled jobs. |
| `CQ_INTERNAL_REPAIR_SECRET` | Authorizes internal repair endpoints. |
| `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_P8_KEY`, `APNS_PRODUCTION` | Apple push notifications. |
| `QA_TEST_ACCOUNT_EMAIL`, `QA_TEST_ACCOUNT_PASSWORD` | Maintainer QA account. Not a student login. |
| `REVIEW_DEMO_SEED_DISABLED` | Set to `true` to stop review-demo seeding. |

Debug flags that must stay unset in production:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_DEBUG_EVENT_PINS` | Injects debug event pins when `true`. |
| `NEXT_PUBLIC_DEBUG_MAP_MAGIC` | Shows map debug markers when `true`. |
| `AUTH_DEBUG`, `AUTH_QA_LOG` | Extra auth logging. |

Authentication uses Supabase Auth. URI students verify a `@uri.edu` address with a 6-digit code. Verified school status is stored on the server. Personal email addresses are not shown in student-facing UI.

## Project Structure

| Path | Contents |
| --- | --- |
| `app/` | App Router pages and API routes |
| `components/` | Interface components |
| `lib/` | Shared client and server logic, including `lib/featureFlags.ts` |
| `supabase/migrations/` | Database migrations |
| `public/` | Static assets |
| `docs/` | Operational and release notes |
| `scripts/` | One-off maintenance scripts |
| `native/` | Capacitor iOS shell |
| `mobile/` | Obsolete Expo prototype |
| `middleware.ts` | Request middleware, including the legal-consent gate |
| `vercel.json` | Production cron schedules |
| `.github/workflows/` | GitHub Actions |

## Development Workflow

1. Start from an up-to-date `main`.
2. Create one branch for one feature or bug fix.
3. Keep the change small enough for another student to review.
4. Run the checks in Getting Started.
5. Open a pull request into `main`.
6. Describe the change, the reason, and the tests you ran.
7. Wait for review. Fix feedback with new commits on the same branch.
8. Resolve merge conflicts in your branch, then ask for another look if the resolution was large.

If a GitHub Issue exists for the work, mention it in the pull request. This repository does not include issue templates.

The policies in the next section are team rules to follow and to configure. This README does not mean GitHub has already enforced them.

## GitHub Contribution Guidelines

- Do not push directly to `main`.
- Use a dedicated branch for every feature or fix.
- Name branches so the work is obvious, such as `feature/event-filters` or `fix/ember-animation`.
- Connect the pull request to a GitHub Issue when one exists.
- Submit changes through a pull request.
- Require a review before merging.
- Explain what changed and how it was tested.
- Keep pull requests focused. Split unrelated cleanup into its own branch.
- Resolve conflicts by updating your branch. Do not discard someone else's work to make the branch apply.
- Do not force-push a shared branch unless a maintainer has agreed.
- Do not commit secrets, production dumps, or student data.

CI on pull requests and on pushes to `main` runs:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run check:migration-safety
npm run build
```

Other workflows are manual or operational. They do not replace pull-request review:

| Workflow | When it runs |
| --- | --- |
| `.github/workflows/ci.yml` | Pull requests and pushes to `main` |
| `.github/workflows/production-repair.yml` | Manual repair gate. It does not merge to `main`. |
| `.github/workflows/provider-health.yml` | Manual or scheduled provider health ping |
| `.github/workflows/post-deploy-verify.yml` | After a successful production deployment status, or when run manually |

## Testing & Quality Assurance

| Command | What it checks |
| --- | --- |
| `npm test` | Vitest unit and integration tests |
| `npm run typecheck` | TypeScript (`tsc --noEmit`) |
| `npm run lint` | ESLint through `next lint` |
| `npm run check:migration-safety` | Guardrails in the provider self-healing migration |
| `npm run build` | Production compile |

There is no separate end-to-end browser script in `package.json`. For a change a test cannot see, use the dev server and say exactly what you clicked in the pull request.

Manual checklists live in `BETA_MANUAL_TEST_CHECKLIST.md`, `docs/pilot-smoke-test.md`, and `docs/ios-physical-device-qa.md`. Some of those lists still mention older QR and gamification behavior. Prefer the current feature flags when a checklist disagrees with the app.

### Other npm scripts

These are not part of normal onboarding. Database scripts can write to whatever Supabase project is in your environment. Do not run them against production.

| Command | Purpose |
| --- | --- |
| `npm run start` | Serve an existing production build |
| `npm run run:prod` | `next build` and then `next start` |
| `npm run icons`, `npm run logo:process`, `npm run logo:transparent`, `npm run ram:transparent` | Regenerate logo and PWA icon assets |
| `npm run db:apply-qr`, `npm run db:apply-dm`, `npm run db:apply-pinned-dm`, `npm run db:apply-campus-memories`, `npm run db:apply-campus-locations`, `npm run db:apply-profile-xp-security` | Apply specific SQL with server credentials |
| `npm run verify:qr`, `npm run generate:gym-qr` | QR maintenance tools |

## Security Guidelines

Every contributor follows these rules.

- Never commit `.env`, `.env.local`, or any real API credential. Those files are gitignored.
- Never put a Supabase service-role key in client code, a `NEXT_PUBLIC_` variable, a screenshot, or a pull request.
- Never share production database access. Schema changes and production queries require maintainer approval.
- Never expose private student information, including emails, verification codes, message contents, or anonymous-post authorship.
- Never copy production student data into a local or personal database.
- Use the development or staging project a maintainer gives you.
- Never share session tokens, cookies, or passwords.
- Report a suspected vulnerability privately to a CampusQuest maintainer or to `support@campusquestapp.com`. Do not post exploit details in a public issue.
- Get approval before changing authentication, authorization, row-level security, migrations, or production infrastructure.

The anon key is designed for the browser. The service-role key is not. Row-level security is what keeps student data inside the correct account.

## Deployment & Releases

Local development, GitHub, the production website, the iOS shell, and the App Store are different steps.

| Stage | What it is | Who runs it |
| --- | --- | --- |
| Local development | `npm run dev` on your machine, using your `.env.local` | Any developer with repository access |
| GitHub | Branches and pull requests. CI checks the change. | Developers open pull requests. Reviewers approve them. |
| Production web | [https://campusquestapp.com](https://campusquestapp.com), hosted on Vercel. `vercel.json` schedules event sync, provider health, and media cleanup. | CampusQuest maintainers, after approval |
| Capacitor iOS | `native/` loads the production website inside an iOS shell. It is not a second copy of the app. | A developer with a Mac and Xcode, using `native/README.md` |
| App Store | An Xcode archive uploaded to App Store Connect, then an Apple release | CampusQuest maintainers only |

This repository does not contain a workflow that deploys the website. Pushing a branch, or even merging to `main`, is not by itself a production release. Treat production deploys, database migrations, and App Store submissions as maintainer actions that require approval.

iOS setup, when a maintainer asks you to run the shell locally:

```bash
cd native
npm ci
npm run sync
npm run open:ios
```

Details are in `native/README.md` and `docs/native-ios-capacitor.md`. The bundle id is `com.nicklockhart.campusquest`. Editing the website does not change the installed iOS shell until that shell reloads the production site, and an App Store build is a separate release.

## Additional Documentation

| Document | Use it for |
| --- | --- |
| `native/README.md` | Running the iOS shell |
| `docs/native-ios-capacitor.md` | Short Capacitor pointer |
| `docs/ios-push-notifications.md` | Optional Apple push setup |
| `docs/ios-physical-device-qa.md` | Device checks |
| `docs/app-store-submission.md` | App Store process for maintainers |
| `docs/app-store-submission-checklist.md` | Release checklist for maintainers |
| `docs/PRODUCTION_SELF_HEALING.md` | Event-provider health jobs |
| `docs/pilot-smoke-test.md` | Manual campus-verification checks |
| `docs/admin-smoke-test.md` | Manual internal-admin checks |
| `docs/DICEBEAR_LICENSES.md` | Avatar artwork licenses |

`docs/backend-supabase-mvp.md` describes an earlier gameplay database. Do not use it as the setup guide for the current app. Schema changes belong in new files under `supabase/migrations/` and need maintainer review before they are applied.
