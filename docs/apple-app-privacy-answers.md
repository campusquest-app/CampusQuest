# Apple App Privacy questionnaire — draft answers

Draft only, based on **current CampusQuest code behavior** (web + Capacitor iOS shell).
Do not invent Tracking or analytics that are not implemented.
Update this file if product behavior changes before submission.

## Data collection overview

| Data type | Collected? | Linked to user? | Used for tracking? | Notes |
|-----------|------------|-----------------|--------------------|-------|
| Contact Info — Email Address | Yes | Yes | No | Account auth / campus verification |
| Contact Info — Name | Yes | Yes | No | Profile display name |
| Other User Content | Yes | Yes | No | Posts, comments, messages, reports, org content |
| Photos or Videos | Yes | Yes | No | User uploads for posts/memories/profile/DMs |
| Audio Data | Yes | Yes | No | Optional DM voice notes when mic permitted |
| Precise Location | Yes (optional) | Yes | No | When-in-use only: Realm map / nearby / directions |
| Coarse Location | Possible via IP / approx | Yes | No | Server/network context; not advertising |
| Device ID | Push token (optional) | Yes | No | APNs token in `push_devices` when user enables push |
| Product Interaction | Limited first-party | Yes | No | In-app notifications, RSVPs, quests/XP; admin operational metrics only |
| Crash Data | No third-party SDK | — | No | Console / server logs only today |
| Advertising Data | No | — | No | No ad SDK |
| Purchases | No | — | No | No IAP / Stripe in product |
| Sensitive Info | No beyond user UGC | — | No | Moderated UGC may include sensitive topics users post |

## Tracking

**Do you or your third-party partners track users?** → **No** (current product).

- No App Tracking Transparency prompt is implemented.
- No Google Analytics / Meta / AppsFlyer / etc. found in the shipped app.

## Third-party partners (data processors — not “tracking”)

Declare as needed in ASC privacy nutrition labels / privacy policy:

- **Supabase** — auth, database, file storage
- **Google Maps Platform** — Maps JavaScript / Directions / server geocoding
- **Apple Push Notification service** — optional alert delivery
- **Vercel / hosting** — app hosting and logs

## Purposes (typical ASC mapping)

- App Functionality: account, social, map, notifications, moderation
- Product Personalization: campus feed / onboarding preferences
- Analytics: **only if** you later ship a product analytics SDK — currently do **not** claim third-party analytics
- Advertising: **None**

## Privacy Policy URL

`https://campusquestapp.com/legal/privacy`

## Reviewer reminder

After D-U-N-S/org enrollment, enter these answers in App Store Connect App Privacy. Re-audit if payment, analytics, or tracking is added.
