# App Store readiness (pre–organization enrollment)

CampusQuest iOS submission prep while **D-U-N-S / Apple Developer organization enrollment** is pending.
Nothing in this doc requires submission to Apple.

## Identity (locked)

| Field | Value |
|--------|--------|
| App name | CampusQuest |
| Bundle ID | `com.nicklockhart.campusquest` |
| Marketing version | `1.0` (`MARKETING_VERSION`) |
| Build | `1` (`CURRENT_PROJECT_VERSION`) |
| Min iOS | 15.0 |
| Shell | `/native` Capacitor 8 → `https://campusquestapp.com` |
| Do not use | `/mobile` (obsolete Expo) |

## Architecture (do not change)

- Root Next.js app = source of truth (Vercel + Supabase).
- `/native` = Capacitor iOS shell loading production.
- Same backend/database for web + iOS.

## Checklist you can finish without org enrollment

- [x] Privacy Policy aligned to actual collection (no Stripe / third-party analytics overclaim)
- [x] Draft Apple App Privacy answers (`docs/apple-app-privacy-answers.md`)
- [x] App Review notes draft with QA email + password placeholder (`docs/app-review-notes.md`)
- [x] Physical-device QA checklist (`docs/ios-physical-device-qa.md`)
- [x] Push deep links → conversation / post / event when metadata exists
- [x] Native bridges: Browser (external links), Share, Haptics, StatusBar, Keyboard config, push settings → iOS Settings
- [x] Icons: single 1024 App Icon present
- [x] LaunchScreen + Splash imageset present
- [x] Info.plist permission strings + `ITSAppUsesNonExemptEncryption=false`
- [x] Account deletion / report / block paths verified in code
- [ ] Publish new legal policy version in admin (`2026-08-11.1`) if DB-managed versioning is active
- [ ] Confirm Vercel Production does **not** set `NEXT_PUBLIC_DEBUG_EVENT_PINS` or `NEXT_PUBLIC_DEBUG_MAP_MAGIC`
- [ ] Configure APNs on Vercel (`APNS_*`) after capability enabled
- [ ] Xcode: Push Notifications + Background Modes (Remote notifications) + Archive Release

## Must wait for D-U-N-S / org enrollment

1. Final organization membership active in Apple Developer
2. Transfer/attach App ID / certificates / distribution under the org (if leaving personal team)
3. App Store Connect app record under the org + paid apps agreement if needed
4. Create/assign APNs Auth Key for the org team
5. Archive → upload → TestFlight → App Review submit
6. App Privacy questionnaire **submit** in ASC (draft answers already written)
7. Age rating / export compliance answers in ASC
8. Reviewer credential fields filled with real QA password in ASC (not in git)

## Guideline 4.2 notes

This remains a **remote WebView** shell. Legitimate native value now includes:

- Push notifications (permission opt-in in Settings; deep links)
- Status bar / keyboard / safe-area web layout
- Native share sheet + haptics where the product already shared/vibrated
- External Browser for Maps / off-site links
- Camera / mic / photos / location via WKWebView APIs with accurate Info.plist strings
- Offline loading placeholder (`native/www`)

Do **not** add fake native screens solely to game review.
