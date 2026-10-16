# App Store Connect privacy answers (internal)

Internal only — do not ship this file to users or App Review notes.

Answers reflect CampusQuest 1.0 **after** the October 15, 2026 privacy/security fixes.
Re-audit this file if collection, SDKs, or product behavior change.

Privacy Policy URL: `https://campusquestapp.com/legal/privacy`  
Terms URL: `https://campusquestapp.com/legal/terms`  
Short aliases `/privacy` and `/terms` permanently redirect to those canonical pages.

## Tracking

**Does this app use the advertising identifier (IDFA) or track users across apps/websites owned by other companies?**  
**No.**

- No ATT prompt is implemented.
- No IDFA / AdSupport usage.
- No Google Analytics, Firebase Analytics, Mixpanel, Amplitude, Meta, TikTok, AppsFlyer, Adjust, Segment, or ad-network SDKs.

## Data types

Declare only the rows below. Do **not** select Coarse Location or Other Usage Data.

| App Store category | Collected | Linked to user | Tracking | Purposes | Implementation notes |
|---|---|---|---|---|---|
| **Name** | Yes | Yes | No | App Functionality | Display name on profiles and social surfaces. |
| **Email Address** | Yes | Yes | No | App Functionality | Auth, campus verification, transactional email (Resend). |
| **Precise Location** | Yes, when permission granted | Yes while in use | No | App Functionality | When-in-use only: blue-dot on The Realm and Google Maps directions. **Not stored as a GPS history.** Map works if declined. Event/business pins use public place coordinates. |
| **Coarse Location** | No | — | — | — | Do not declare. IP address is disclosed as Other Diagnostic Data, not coarse location. |
| **Emails or Text Messages** | Yes | Yes | No | App Functionality | In-app direct messages (text, images, optional voice notes). Not SMS/iMessage. |
| **Photos or Videos** | Yes | Yes | No | App Functionality | Quad posts, campus memories, profile media, DM images. |
| **Audio Data** | Yes | Yes | No | App Functionality | Optional DM voice notes and video audio. |
| **Other User Content** | Yes | Yes | No | App Functionality, Product Personalization | Posts, comments, memories, reports, org content; onboarding interests/communities used for rule-based For You ranking. |
| **User ID** | Yes | Yes | No | App Functionality | Supabase auth user id / profile id. |
| **Device ID** | Yes, when push is enabled | Yes | No | App Functionality | APNs device token in `push_devices`. This is **not** an advertising identifier. |
| **Product Interaction** | Yes | Yes | No | App Functionality, Analytics | First-party `last_active_at`, onboarding funnel, RSVPs, in-app notifications. No third-party analytics SDK. |
| **Other Diagnostic Data** | Yes | Yes | No | App Functionality | IP address, user agent, and server/operational logs on Vercel/Supabase. |
| **Other Usage Data** | No | — | — | — | Do not select merely because Product Interaction exists. |
| **Advertising Data** | No | — | — | — | |
| **Purchases** | No | — | — | — | No IAP / payments in 1.0. |
| **Crash Data** | No third-party crash SDK | — | — | — | Console / server logs only. |

## Third-party partners (processors, not tracking)

Declare as data processors where App Store Connect asks, consistent with the Privacy Policy:

- **Supabase** — auth, database, file storage
- **Vercel** — application hosting and operational logs
- **Resend** — transactional email (campus verification)
- **Google Maps / Google geocoding** — map tiles, directions, campus place lookup
- **Apple Push Notification service** — optional iOS alerts
- **YouTube privacy-enhanced embeds** — device may contact Google/YouTube when a user plays a Realm highlight. CampusQuest does not send profile identity with the embed.

Do **not** list Mapbox. Do **not** list advertising partners.

## What not to claim

- No outbound feed of student profiles, DMs, or GPS history to URI or other universities.
- Campus events may be **imported** from public calendars such as URInvolved.
- Recommendations are catalog + interest rules, not a third-party AI model.
- QR scanning, check-ins, nearby quests, background location, payments, and advertising are not part of 1.0.

## Age

Terms require users to be at least 13. Eligibility is contractual. The app does **not** collect date of birth or technically age-gate signup. In App Store Connect, use the age rating questionnaire truthfully; do not claim age verification.

## Manual App Store Connect steps

These cannot be completed from this repository:

1. App Privacy questionnaire — enter the table above.
2. Privacy Policy URL — `https://campusquestapp.com/legal/privacy` (after the October 15 policy is published).
3. Apple Developer → App ID `com.nicklockhart.campusquest` → enable **Push Notifications**.
4. Xcode Signing & Capabilities → confirm Push Notifications + Background Modes → Remote notifications.
5. Age/content rating and App Review metadata.
