# App Store Submission Checklist — CampusQuest iOS 1.0 (build 1)

Status legend: `[x]` done and verified locally · `[ ]` manual, Cursor cannot do it · `[~]` done, needs your confirmation.
Companion files: `docs/app-store-go-no-go.md`, `docs/app-store-review-notes.md`, `docs/app-store-metadata-draft.md`.

## 1. Code and backend (done locally on branch `release/app-store-security-closure`)

- [x] Security closure commit `091e97a` (AUD findings, DM media privacy, admin authority, server-only secrets, headers).
- [x] Follow-up commit `fa06d00`: remaining gamification writes gated (`/api/bosses/*`, `/api/me/milestones/evaluate`, admin XP repair), content-report moderation queue, upload byte verification.
- [x] Full migration replay from zero on disposable Postgres: 141/141 applied (`--single-transaction`).
- [x] 52/52 effective-authorization SQL checks as `authenticated` with JWT claims (see go/no-go doc for the list).
- [x] `npm run typecheck`, `npm run lint` (2 pre-existing warnings), `npm test` (253 files / 1874 tests), `npm run build` all green.
- [x] Client bundle scan: zero server secret names or values in `.next/static`.
- [x] Local `next start` confirms CSP / X-Frame-Options / nosniff / Referrer-Policy / Permissions-Policy headers and `FEATURE_DISABLED` on gamification endpoints.
- [ ] **Production deploy + migration** — needs your approval (see checkpoint in the final report). Nothing has been pushed or deployed.

## 2. Vercel (production project `campus-quest-mli4` → campusquestapp.com)

- [ ] Confirm Production env does **not** set `NEXT_PUBLIC_DEBUG_EVENT_PINS` or `NEXT_PUBLIC_DEBUG_MAP_MAGIC` (`todayMapEvents.ts` injects a fake debug event when the first is `true`).
- [ ] Set `GOOGLE_MAPS_SERVER_API_KEY` (or `GOOGLE_MAPS_GEOCODING_API_KEY`) if server geocoding of campus events is wanted; the server geocoder now fails closed without it.
- [ ] Confirm `MODERATION_ADMIN_EMAILS`, `MESSAGE_MODERATION_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `QA_TEST_ACCOUNT_EMAIL`, `QA_TEST_ACCOUNT_PASSWORD` exist in Production (names only; values never printed).
- [ ] After deploy, run the read-only verification plan in `docs/app-store-go-no-go.md` §Post-deploy.

## 3. Google Cloud (manual)

- [ ] Restrict NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to the production web/iOS application and required Maps APIs.
- [ ] If a server key is added, restrict it by IP/None + Geocoding API only.

## 4. Support contact

- [x] Support address is `support@campusquestapp.com` (verified working; `campusquestapp.com` has Google MX). It is used on the Support page, Settings, Help & Support, Delete-account panel, Privacy Policy and Terms.

## 5. Apple Developer / App Store Connect (manual)

- [ ] App record exists for bundle id `com.nicklockhart.campusquest` (team `22HZFLJZ9X`).
- [ ] Push Notifications capability on the App ID + APNs key, if push is to work in 1.0. The Xcode project has no `.entitlements` file and no `aps-environment`; the app will still run, push registration will just fail silently. (Optional for launch; see Deferred.)
- [ ] Apple Distribution certificate + App Store provisioning profile on this Mac (only an "Apple Development" identity exists locally; no profiles installed). Xcode → Settings → Accounts → Download Manual Profiles, or archive with automatic signing in Xcode.
- [ ] Archive & upload: Xcode → Product → Archive (scheme `App`, Release) → Distribute → App Store Connect. Or from a terminal **after** signing assets exist: see §7.
- [ ] App Privacy questionnaire — use `docs/app-store-metadata-draft.md` §App Privacy; confirm the items flagged "confirm".
- [ ] Age rating questionnaire — UGC + messaging; see metadata draft.
- [ ] Paste `docs/app-store-review-notes.md` into Notes; set demo account email/password in the Sign-in fields.
- [ ] Export compliance: `ITSAppUsesNonExemptEncryption = false` is already in Info.plist (HTTPS only).
- [ ] Content Rights: app displays user-generated content and public campus event data — answer accordingly.

## 6. Screenshots (manual capture)

Required sizes: 6.9" iPhone (1320×2868) and 6.5"/6.7" (1290×2796) at minimum; iPad 13" (2064×2752) because `TARGETED_DEVICE_FAMILY = "1,2"` includes iPad.
Capture these screens with the demo account (no personal data, no empty states):

1. The Quad feed with 3+ real-looking posts.
2. A post detail with comments.
3. Events tab (organizations and an event detail).
4. The Realm map with event pins.
5. Messages thread with a photo and a voice note.
6. Profile.
7. Settings → Safety (shows Report/Block/Delete account surfaces).

Do not capture: admin console, any screen mentioning XP/quests/QR/guilds, the data-consent "Beta Service" section, placeholder avatars, or debug map labels ("DEBUG MAGIC" only appears when `NEXT_PUBLIC_DEBUG_MAP_MAGIC=true`).

## 7. Build commands (local; signing step requires Apple assets)

```bash
# web app
npm ci && npm run typecheck && npm run lint && npm test && npm run build

# iOS shell
cd native && npm ci && npx cap sync ios
cd ios/App
xcodebuild -project App.xcodeproj -scheme App -configuration Release -sdk iphoneos \
  -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build          # verified 2026-10-14: BUILD SUCCEEDED

# archive (only once a Distribution cert + profile are installed; do NOT add -allowProvisioningUpdates from CI)
xcodebuild -project App.xcodeproj -scheme App -configuration Release -sdk iphoneos \
  -destination 'generic/platform=iOS' -archivePath build/CampusQuest.xcarchive archive
xcodebuild -exportArchive -archivePath build/CampusQuest.xcarchive \
  -exportOptionsPlist ExportOptions.plist -exportPath build/export        # method: app-store-connect
```

## 8. Repo hygiene

- [x] Branch `release/app-store-security-closure` (from `feature/campusquest-partners`), 3 local commits, nothing pushed.
- [x] Stash `wip campus identity before security closure` untouched.
- [x] No `.env*`, `.cursor/` changes, or temp files committed.
- [ ] Open PR → merge to `main` only after approval.
