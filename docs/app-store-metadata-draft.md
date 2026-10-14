# App Store Metadata Draft — CampusQuest 1.0

Everything below is derived from the shipped product (gamification hidden). Items marked **confirm** need a human decision before submission. Nothing here is uploaded automatically.

## App information

| Field | Value |
| --- | --- |
| Name (30) | `CampusQuest` |
| Subtitle (30) | `Your campus, connected` |
| Bundle ID | `com.nicklockhart.campusquest` |
| SKU | `campusquest-ios` (**confirm**) |
| Primary language | English (U.S.) |
| Primary category | Social Networking |
| Secondary category | Education (**confirm**) |
| Version / Build | `1.0` / `1` (matches `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`) |
| Copyright | `© 2026 CampusQuest` (**confirm legal entity name**) |
| Support URL | `https://campusquestapp.com/support` |
| Marketing URL | `https://campusquestapp.com` |
| Privacy Policy URL | `https://campusquestapp.com/legal/privacy` |
| Terms of Use (EULA) | Standard Apple EULA, or link `https://campusquestapp.com/legal/terms` (**confirm**) |

## Promotional text (170)

Find what's happening on campus today: student orgs, events, the campus map, and the students behind them.

## Description (4000)

CampusQuest is the community app for University of Rhode Island students. See what's happening on campus, discover student organizations and events, find your way around with The Realm campus map, and stay in touch with friends through direct messages.

THE QUAD
A campus feed built for students. Share photos, videos, and updates, react and comment, and tag the places and organizations that matter to you.

ORGANIZATIONS & EVENTS
Browse student organizations, follow the ones you care about, RSVP to events, and get everything from club meetings to campus-wide happenings in one place. Events sync from official campus sources so you never miss out.

THE REALM
An interactive campus map with today's events pinned where they happen, directions to get there, and campus memories tied to real places.

MESSAGES
Direct and group messages with photos and voice notes. Block and report controls are always one tap away.

STUDENT MARKETPLACE & COMMUNITY QUESTS
Buy, sell, and share with other students, and discover student deals from local businesses.

BUILT FOR SAFETY
Report any post, comment, profile, message, event, or organization. Block anyone. Delete your account at any time from Settings.

CampusQuest is an independent student product and is not an official University of Rhode Island application.

## Keywords (100)

`campus,college,students,URI,events,clubs,organizations,campus map,student life,community`

## What's New (release notes)

Welcome to CampusQuest 1.0: the campus feed, student organizations and events, The Realm campus map, direct messages, profiles, and safety tools (report, block, account deletion).

## Age rating (questionnaire answers derived from product)

- User-generated content: **Yes** (posts, comments, messages, profiles, marketplace listings) → requires UGC safeguards (present: report, block, moderation console, account deletion).
- Unrestricted web access: **No** (WKWebView is pinned to campusquestapp.com + Supabase via `allowNavigation`; external links open in Safari/SFSafariViewController).
- Gambling, contests, medical, mature themes, violence, profanity: **None** intended; infrequent/mild user-generated profanity is possible → answer "Infrequent/Mild" for Profanity or Crude Humor (**confirm**).
- Messaging between users: **Yes**.
- Expected rating: **12+ / 13+ under the 2025 age-rating scheme** (**confirm**).

## App Privacy (Data Collection) — from source

Tracking: **No**. No ad SDKs, no cross-app tracking (`privacy page §4`, `PrivacyInfo.xcprivacy NSPrivacyTracking=false`).

| Data type | Collected | Linked to identity | Purpose | Source evidence |
| --- | --- | --- | --- | --- |
| Email address | Yes | Yes | App functionality (account) | `auth.users`, `/api/auth/signup` |
| Name (display name) | Yes | Yes | App functionality | `profiles.display_name` |
| User ID | Yes | Yes | App functionality | `profiles.id` |
| Photos or videos | Yes | Yes | App functionality | Quad media, DM images, memories, avatars |
| Audio data | Yes | Yes | App functionality | DM voice notes (`dm-audio` bucket) |
| Other user content | Yes | Yes | App functionality | posts, comments, messages, listings, reports |
| Precise location | Yes (only while map in use; sent to the server for directions/placement — **confirm** whether coordinates are persisted; `useUserGeolocation.ts` keeps them client-side, event placement uses event coordinates not user coordinates) | Yes | App functionality | `lib/client/useUserGeolocation.ts`, `lib/realm/resolveDirectionsOrigin.ts` |
| Product interaction | Yes | Yes | App functionality, Analytics (first-party only) | `user_activity_events`, `last_active_at`, onboarding events |
| Diagnostics (other) | Yes | Yes | App functionality | server-side request/security logs |
| Device ID | No (APNs token stored as push device, not an advertising/device identifier) | — | — | `push_devices` (**confirm** answer) |
| Contacts, Health, Financial, Browsing history, Search history | No | — | — | — |
| Coarse location | No | — | — | — |
| Purchases | No | — | — | no payments |

Third parties that process data: Supabase (auth/db/storage), Google Maps (maps/geocoding), Apple APNs (push), Vercel (hosting). Matches Privacy Policy §3.

## Review information

Sign-in required: **Yes** → demo account `qa_signup@campusquestapp.com` / password set in App Store Connect only.
Notes: paste `docs/app-store-review-notes.md`.
Contact: your name, phone, email (**fill**).

## Items for human / legal review (no code change made)

1. `support@campusquest.app` appears in Privacy Policy §7/§10 and Terms §Questions; the `campusquest.app` domain has no MX record (see checklist §4). Deliverability must be confirmed or the address changed.
2. Privacy Policy §1 mentions "QR scanning" and "nearby quests/check-ins" as uses of camera/location; these features are hidden for launch. Suggested wording: drop "QR scanning" and "nearby quests/check-ins" (keep "campus map, directions, placing campus events").
3. Privacy Policy §4 "limited client-side game or onboarding state" — still accurate (equipped cosmetics key in `game_state_json`), keep.
4. Data & Personalization Consent page has a "Beta Service" section — decide whether the product is still described as beta at App Store launch.
5. `docs/apple-app-privacy-answers.md` lists "quests/XP" under Product Interaction; superseded by the table above.
6. Privacy Policy §7 account-deletion retention language is accurate to the implementation (auth deleted first, relational rows removed, media may persist in provider backups; orphaned public media objects are not purged synchronously — the `cleanup-quad-media` cron handles Quad media). Confirm this matches your intended retention promise.
7. Permission rationale copy on the Support page was updated (camera: no QR mention; notifications: "event reminders" instead of "quest reminders") — technical accuracy only, review if you consider the Support page policy text.
