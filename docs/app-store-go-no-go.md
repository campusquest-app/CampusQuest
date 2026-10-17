# CampusQuest iOS — App Store Go / No-Go

Date: 2026-10-16 · Branch: `main` · Local readiness pass (code only)
Overall: **READY FOR PHYSICAL DEVICE / TESTFLIGHT QA** — not ready to claim App Store submission until physical-device and App Store Connect steps below are completed by a human.

## READY (code / local)

| Item | Status | Evidence |
| --- | --- | --- |
| Gamification disabled | READY | `FEATURE_FLAGS.progression=false`; server routes assert `FEATURE_DISABLED`; Help/Settings/metadata no longer claim XP/QR/guilds are live |
| CampusQuest Basic / subscriptions | READY (code) | For You is free for authenticated users; billing CTAs removed from launch surfaces. **Production deploy of this entitlement work: NOT VERIFIED in this pass** |
| Reviewer account | READY | `qa_signup@campusquestapp.com` pre-verified via `campus_email_verified_at`; role `qa`; no admin; no mailbox/OTP required. Password only in env / App Store Connect |
| Blocked-user discovery | READY | People search + notification list filter mutual blocks |
| Map pins auth + QR strip | READY | `/api/quests/map-pins` requires auth; QR/quest payloads omitted while progression is off |
| Trusted GPS for blue-dot / routes | READY | Same ValidUserLocation + campus walk-origin rules as proximity labels |
| iOS display naming | READY | `CFBundleDisplayName` + `CFBundleName` = `CampusQuest`; bundle id unchanged |
| Splash | READY | Navy `#041E42` + existing `campusquest-logo.png` splash assets |
| Map control hit targets | READY | Rotate controls ≥ 44×44 |
| Permission purpose strings | READY | Location / camera / photos / mic describe current 1.0 features only |
| Capacitor native integrations | READY (code) | Push, Share, Haptics, Keyboard, Splash, StatusBar, Browser/external open used from `lib/client/capacitorNative.ts` / related clients |
| Push entitlement files | PRESENT | `App.entitlements` development + `AppRelease.entitlements` production `aps-environment`. **APNs key on Vercel + live device delivery: NOT VERIFIED** |

## NEEDS MANUAL ACTION

| Item | Why Cursor cannot finish it | Manual action |
| --- | --- | --- |
| Physical iPhone / TestFlight walkthrough | Requires device + Apple account | Install build; sign in as reviewer; exercise Quad, Map, Events, DMs, Perks, Report/Block |
| App Store Connect record | Apple web forms | Metadata from `docs/app-store-metadata-draft.md`; privacy from `docs/app-store-privacy.md`; notes from `docs/app-store-review-notes.md` |
| Distribution signing / Archive upload | Apple Developer portal | Create Distribution cert + App Store profile; Archive; Upload |
| Reviewer password in ASC | Secret | Confirm password matches Production env; never commit it |
| Production deploy of latest local changes | Explicit deploy approval required | Deploy only after review of this branch’s diffs |
| Google Maps key restrictions | External console | Restrict browser key to production web/iOS + required APIs |

## BLOCKERS FOR “SUBMIT TODAY”

| Item | Detail |
| --- | --- |
| No physical-device / TestFlight verification in this pass | Do not mark READY FOR APP STORE SUBMISSION until a human completes device QA |
| Signing / ASC upload | NOT VERIFIED on this Mac in this pass |

## DEFERRED AFTER LAUNCH

| Item | Note |
| --- | --- |
| Next.js major upgrade | Out of scope for 1.0 |
| Gamification re-enable | Keep `progression=false` for 1.0 |
| Orphaned public media cleanup on delete | Post-launch storage sweep |

## Reviewer note (WebView / minimum functionality)

CampusQuest is not a generic website wrapper. The Capacitor shell hosts the production campus app with native integrations already in use: location-aware Realm map, optional push registration, native share + haptics, keyboard handling, branded splash/status bar, camera/photos/microphone for user-generated content, and campus-authenticated student flows (feed, orgs/events, messaging, Perks). External URLs leave the WebView via the Browser/open-external path; navigation allow-list is limited to CampusQuest + Supabase hosts.

## Post-device checklist (human)

1. Fresh install → splash is navy + CampusQuest logo (no white flash).
2. Home screen label shows **CampusQuest** (not “App”).
3. Reviewer sign-in without mailbox / OTP / GPS / invite code.
4. Map: tiles, markers, no floating cancelled-only pill, no QR secrets in network responses.
5. Block a user → they disappear from people search / new notifications.
6. Deny location → map still works; no blue-dot / walking route from off-campus or stale fixes.
7. Permissions prompts only appear when using the related feature.
