# CampusQuest App Store submission (internal)

Use this file when creating the final iOS archive and filling App Store Connect.
Do not ship it to users. Answers reflect the repository after the October 15, 2026 privacy/security work.

Related files:

- Privacy questionnaire detail: `docs/app-store-privacy.md`
- Reviewer account ops: `docs/store-reviewer-account.md`
- Paste-ready App Review notes: `docs/app-store-review-notes.md`
- Push portal steps: `docs/ios-push-notifications.md`

## Store URLs

| Asset | URL |
|--------|-----|
| Privacy Policy | `https://campusquestapp.com/legal/privacy` |
| Terms | `https://campusquestapp.com/legal/terms` |
| Support | `https://campusquestapp.com/support` |
| App | `https://campusquestapp.com` |

`/privacy` and `/terms` permanently redirect to the canonical `/legal/*` routes after the Next.js app with those redirects is deployed.

## Tracking

**No.** CampusQuest does not use IDFA, ATT, or third-party advertising/analytics SDKs.

## Data categories

| Category | Collected | Linked | Tracking | Purpose |
|---|---|---|---|---|
| Name | Yes | Yes | No | App Functionality |
| Email Address | Yes | Yes | No | App Functionality |
| Precise Location | Yes, if permission granted | Yes while in use | No | App Functionality |
| Coarse Location | No — do not declare | — | — | — |
| Emails or Text Messages | Yes (in-app DMs) | Yes | No | App Functionality |
| Photos or Videos | Yes | Yes | No | App Functionality |
| Audio Data | Yes (voice notes / video) | Yes | No | App Functionality |
| Other User Content | Yes | Yes | No | App Functionality, Product Personalization |
| User ID | Yes | Yes | No | App Functionality |
| Device ID | Yes when push is enabled (APNs token, not IDFA) | Yes | No | App Functionality |
| Product Interaction | Yes (first-party) | Yes | No | App Functionality, Analytics |
| Other Usage Data | No — do not select | — | — | — |
| Other Diagnostic Data | Yes (IP / UA / server logs) | Yes | No | App Functionality |
| Advertising Data | No | — | — | — |
| Purchases | No | — | — | — |

Precise location is used only while the app is open for The Realm blue-dot and Google Maps directions. It is not stored as a GPS history. Event and business pins use public place coordinates.

## Export compliance

App Store Connect: **Does your app use encryption?** → **Yes, but only exempt encryption** / set **ITSAppUsesNonExemptEncryption = No**.

`Info.plist` already has `ITSAppUsesNonExemptEncryption = false`.

CampusQuest uses HTTPS and standard OS/TLS encryption only. There is no custom cryptography.

## iOS identity

| Field | Value |
|--------|--------|
| Bundle ID | `com.nicklockhart.campusquest` |
| Display name | CampusQuest |
| Marketing Version | 1.0 |
| Current project build | 2 |
| Recommended first ASC upload | **2** if build 2 is not already in App Store Connect; otherwise **3** |
| Deployment target | iOS 15.0 |
| Devices | iPhone |

## Age / UGC

Terms require users to be at least 13. Eligibility is contractual. The app does not collect date of birth or technically age-gate signup. Do not claim age verification.

Social UGC is present. Users can report posts, comments, profiles, messages, events, and organizations, and can block other users. Blocks are enforced on the server for new DMs. Support: `support@campusquestapp.com`.

Likely age-rating questionnaire highlights: User-Generated Content, Infrequent/Mild Mature/Suggestive Themes possible in UGC, no unrestricted web, no gambling, no alcohol sales.

## Reviewer login

Email: `qa_signup@campusquestapp.com`  
Password: App Store Connect only (never commit).

Campus email is pre-verified. Role is `qa` (not admin). Isolated `[Demo]` fixtures are seeded on login.

Provision if needed:

```bash
QA_TEST_ACCOUNT_EMAIL=qa_signup@campusquestapp.com QA_TEST_ACCOUNT_PASSWORD='…' node scripts/ensure-qa-account.mjs
```

## Production gates before Submit for Review

The iOS shell loads **live** `https://campusquestapp.com`. Archiving Xcode without deploying the web/legal/deletion work means Apple reviews the old site.

Before submit:

1. Apply `20261015140000_legal_policy_version_2026_10_15.sql`
2. Apply `20261015150000_profile_private_fields.sql`
3. Deploy the Next.js app that contains the October 15 Privacy Policy and `/privacy` → `/legal/privacy` redirects
4. Confirm `https://campusquestapp.com/legal/privacy` shows Effective Date October 15, 2026
5. Confirm `https://campusquestapp.com/privacy` redirects (not 404)

## Intentionally disabled in 1.0

Progression, quests, QR scanning, guilds, leaderboards, Manual Log, Boss Battles, Codex, and Equipment stay off (`FEATURE_FLAGS.progression = false` and related flags). `/scan` returns users to home while QR is disabled.
