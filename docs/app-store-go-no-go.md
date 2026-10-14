# CampusQuest iOS — App Store Go / No-Go

Date: 2026-10-14 · Branch: `release/app-store-security-closure` (local only) · Commits: `091e97a`, `fa06d00`, release commit
Overall: **NOT READY to submit today** — code is ready; production is not deployed and three manual Apple/infra actions remain.

## READY

| Item | Status | Evidence | File(s) |
| --- | --- | --- | --- |
| AUD-001 authorization hardening effective on a from-zero replay | FIXED | 141/141 migrations applied on disposable Postgres 16 (`--single-transaction`); 52/52 SQL checks as `authenticated`+JWT: self-verification denied; org self-insert coerced to member, self-promotion ignored, owner demotion 0 rows; removed participant re-insert denied; blocked DM insert denied both directions; non-participant denied; forged/accepted-by-requester connection denied; friends-only post hidden from non-friend, visible to friend; boss/drops/guild/stats/inventory/xp_logs/user_quests/activities writes → `permission denied`; marketplace buyer self-accept & stranger decline denied, seller accept ok; protected profile fields frozen (`is_hidden`, `is_test_user`, `streak_days`, `campus_email_verified_at`, `game_state_json.achievements`), `role` change raises; report insert ok, resolve denied; block insert ok, removing a block against you denied; dm buckets private, client storage insert/list denied; service role writes succeed; legacy policies absent; 9 hardening triggers present; zero anon/authenticated write grants on 12 gamification tables | `supabase/migrations/20260917120000_aud001_authorization_hardening.sql`, `supabase/migrations/20261014180000_security_closure_launch.sql` |
| Historical migrations edited only for fresh replay (no production effect) | FIXED | `20260706120000` early-return when zero founders; `20260707180000` skips constraint when `user_activity_events` absent; `20260717120000` adds `admin_xp_adjustment` to the create so end state equals production (prod applied 20260707 after the table existed via `db:apply-profile-xp-security`). No other historical migration touched. Fresh-vs-prod end state: identical policies/triggers/constraints. | listed |
| Gamification hard-disabled server-side | HARD-DISABLED | `FEATURE_FLAGS.progression=false` → `assertLaunchProgressionEnabled()` 404 `FEATURE_DISABLED` in 17 route files (activities/log, beginner-quests/claim, quests/complete, quests/scan-qr, qr/scan, streaks/update, guilds POST, guilds/join, me/boss (+ me/boss-drops re-export), bosses/attempt, bosses/start, bosses/join, me/milestones/evaluate, proof/upload, quests/admin/[id]/complete, internal/admin/users/[id]/xp, internal/admin/repair-suspicious-xp) and 12 services (`logActivity`, `claimBeginnerQuestReward`, `completeQuest`, `scanQrQuest`, `joinGuild`, `createGuild`, `scanCampusQuestQrCode`, `completeAdminQuestForUser`, `attemptBossBattle`, `startBossBattle`, `adminAdjustUserXp`, `repairSuspiciousUserXp`); `addXpInternal`, `processXpMilestoneCrossings`, quad/memory reaction XP return zero/no-op; `/api/xp/add` and `/api/inventory/add` 403; DB write grants revoked. Verified on local `next start`. | `lib/server/launchProgression.ts`, `lib/featureFlags.ts`, `lib/server/__tests__/securityClosure.test.ts` |
| Report → moderation for all UGC types | FIXED | Posts → `quad_post_reports` (Quad queue); messages → `message_reports` (Messages queue); events/orgs → campus queue; **users, comments, infringement, marketplace listings/businesses → `content_reports` now surfaced** in new admin queue (`GET/POST /api/internal/admin/moderation/content/reports`, `ContentReportsModerationCard`) mounted in Admin → Moderation → Content Reports and Internal Moderation dashboard; audit-logged resolve/dismiss | `lib/server/contentReports.ts`, `app/api/internal/admin/moderation/content/reports/route.ts`, `components/ContentReportsModerationCard.tsx`, `lib/server/__tests__/launchSafetyFlows.test.ts` |
| Block enforced server + DB | FIXED | `assertNotBlocked` in messaging; RLS `direct_messages sender insert` uses `cq_conversation_blocked_for_viewer`; `quad_posts select visible` uses `cq_viewer_blocked_with`; SQL checks 12/13/20/44/45 | `lib/server/messaging.ts`, AUD-001 migration |
| Account deletion end-to-end | FIXED | Settings → Account → Delete account → type `DELETE` → `DELETE /api/me/account` (bearer auth, zod confirmation, 3/hour) → `deleteOwnAccount`: admin accounts refused, auth user deleted first (re-login impossible), 55 related-table steps cleaned, profile/stats removed; tests cover ordering, admin refusal, auth-failure = nothing deleted, cleanup failure tolerated | `lib/server/selfAccountDeletion.ts`, `lib/server/adminUserDeletion.ts`, `components/safety/DeleteAccountPanel.tsx` |
| Private DM media (AUD-015) | FIXED | `dm-images`/`dm-audio` private, size + MIME limits, storage policies dropped; refs stored as bucket paths; participant-only 10-min signed URLs; path traversal / cross-conversation rejected; byte sniff must equal declared type | `lib/server/dmRichMessages.ts`, `lib/server/messaging.ts` |
| Upload security on every launch-reachable image path | FIXED | Byte-sniff must match declared MIME for Quad proof, Quad carousel images, posters, memories, marketplace, verification media, DM image/audio; direct uploads verified server-side (`completeDirectUpload`); all routes authenticated + rate limited + size capped | `lib/server/sniffImageMime.ts` (`assertImageBytesMatchDeclaredMime`), `quadPosts.ts`, `quadPostMedia.ts`, `quadVideoUpload.ts`, `marketplace.ts`, `quadDirectUpload.ts` |
| Admin authority | FIXED | Persisted `profiles.role` admin/super_admin **or** allow-list/fallback email with real `email_confirmed_at`; unconfirmed allow-list rejected; client cannot modify `role` (DB trigger) nor `is_*` flags; moderation API key compared constant-time; identities A/B/C/D covered by tests | `lib/server/permissions.ts`, `adminAuth.ts`, `moderationAuth.ts`, `__tests__/platformAdminAccess.test.ts`, `moderationAuth.test.ts` |
| Login / session | FIXED | Login: IP 20/15 min + email 8/15 min; signup, reset, resend, username-check keyed limits; reset/resend return generic "accepted" (no enumeration); no token/password logging found; protected routes use `requireAuthUser` bearer | `app/api/auth/*` |
| Secret boundary | FIXED | `import "server-only"` on both Supabase server factories; `.next/static` scan: 0 occurrences of service-role / moderation / cron / verification / legal / proof / Resend / Maps-server / DB names, and 0 secret **values** from `.env.local` (only public strings `PILOT_SCHOOL_NAME`, QA email appear) | `lib/server/supabase.ts`, `lib/supabase/server.ts` |
| Security headers | FIXED | CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` verified via local `next start`. Compromise: `script-src 'unsafe-inline' 'unsafe-eval'` retained because Next 14 inline runtime + Google Maps JS require it; `frame-ancestors 'none'` | `next.config.js` |
| Maps keys | FIXED (code) | Browser key only in `RealmMap.tsx`; server geocoder uses only `GOOGLE_MAPS_GEOCODING_API_KEY`/`GOOGLE_MAPS_SERVER_API_KEY`, never the public key, fails closed | `lib/server/geocoding/googleCampusGeocoder.ts` |
| Capacitor / iOS shell config | FIXED | `server.url https://campusquestapp.com`, `cleartext false`, `allowNavigation` limited to campusquestapp.com + supabase.co; no `NSAppTransportSecurity`; `CAPACITOR_DEBUG` only from `debug.xcconfig` (Debug configs), empty in Release; bundle id/team/version/build/iOS 15 min; icon 1024 no-alpha; splash present; no localhost/dev URLs in built bundle | `native/capacitor.config.ts`, `native/ios/App/App/Info.plist`, `native/ios/debug.xcconfig` |
| Permission strings | FIXED | Location string no longer mentions quests/check-ins; microphone string includes DM voice notes; photo-add string tied to share sheet Save | `native/ios/App/App/Info.plist` |
| Privacy manifest | FIXED | `PrivacyInfo.xcprivacy` added to target Resources: tracking=false, 9 collected types matching source, accessed APIs `UserDefaults CA92.1`, `FileTimestamp C617.1`; `plutil -lint` OK; present in built `App.app` | `native/ios/App/App/PrivacyInfo.xcprivacy`, `project.pbxproj` |
| iOS Release compile | FIXED | `xcodebuild … -configuration Release -sdk iphoneos CODE_SIGNING_ALLOWED=NO build` → **BUILD SUCCEEDED** (Xcode 26.3, Capacitor 8.5.0 via SPM) | `/tmp/cq-ios-release-build.log` |
| Automated verification | FIXED | typecheck ✓ · lint ✓ (2 pre-existing warnings) · vitest 253 files / 1874 tests ✓ · `next build` ✓ | — |
| Reviewer account | READY | `qa_signup@campusquestapp.com`, exact-match campus bypass only, role `qa`, hidden/test flags, onboarding reset on login; no universal bypass; password lives only in env / App Store Connect | `lib/internalAccount.ts`, `lib/server/qaTestAccount.ts` |
| Apple submission files | READY | review notes, checklist, metadata draft, this file | `docs/app-store-*.md` |

## NEEDS MANUAL ACTION

| Item | Why Cursor cannot do it | Manual action |
| --- | --- | --- |
| Production migration + deploy | Remote mutation; requires your explicit approval | Reply to the checkpoint ("Approve production migration + deployment?") |
| Support mailbox deliverability | External DNS/mail config; `campusquest.app` has no MX | Add MX/mailbox for `support@campusquest.app`, or give me the real address to substitute in 9 places (2 are legal pages) |
| Apple Distribution certificate + App Store provisioning profile | Apple Developer portal | Xcode → Accounts → download/create; then Product → Archive → Upload |
| App Store Connect record, App Privacy, Age Rating, screenshots, review notes | Apple web forms | Use `docs/app-store-metadata-draft.md`, `docs/app-store-review-notes.md`, checklist §6 |
| Reviewer account password | Secret; must exist in Production env and App Store Connect | Confirm `QA_TEST_ACCOUNT_PASSWORD` is set in Vercel Production and the account exists (`node scripts/ensure-qa-account.mjs` against prod **after** approval) |
| Google Cloud | External console | Restrict NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to the production web/iOS application and required Maps APIs. Optionally add a restricted server geocoding key and set `GOOGLE_MAPS_SERVER_API_KEY` in Vercel |
| Vercel env review | External console | Confirm no `NEXT_PUBLIC_DEBUG_EVENT_PINS` / `NEXT_PUBLIC_DEBUG_MAP_MAGIC` in Production; confirm server secrets present |
| Legal copy decisions | Policy text — out of scope for code | See `docs/app-store-metadata-draft.md` → "Items for human / legal review" |

## BLOCKER

| Item | Detail |
| --- | --- |
| Production is not running this code | Current production predates the security closure; the new migration (`20261014180000_security_closure_launch.sql`) has not been applied. Submitting a build that points at production before deploy would expose the un-hardened backend to reviewers. **Deploy first, then upload the build.** |
| No distribution signing assets on this Mac | Archive/upload impossible until a Distribution identity and profile exist (only "Apple Development" present, 0 profiles). |
| Support email likely undeliverable | Apple requires a working support contact; `support@campusquest.app` domain has no MX record. Treat as blocker until confirmed deliverable or changed. |

## DEFERRED AFTER LAUNCH

| Item | Status | Note |
| --- | --- | --- |
| AUD-008 — Next.js 14.2.35 upgrade | DEFERRED | Explicitly out of scope for this release; mitigations: server-only boundaries, headers, no `distDir`, rate limits. Plan the upgrade right after launch. |
| Push notifications entitlement | DEFERRED | No `.entitlements` / `aps-environment`; requires Apple App ID change. App degrades gracefully. Enable in 1.0.1 with APNs key on Vercel. |
| Signup email-exists message | DEFERRED | `/api/auth/signup` reveals "account already exists" (standard, rate-limited). Could switch to a generic message later. |
| `config.xml <access origin="*">` | DEFERRED | Cordova-legacy file; Capacitor navigation is governed by `allowNavigation`. Remove in a later cleanup. |
| Orphaned public media after account deletion | DEFERRED | Storage objects for deleted users are not purged synchronously (Quad media handled by `cleanup-quad-media` cron). Add a storage sweep to the deletion path post-launch. |
| In-memory rate limits | DEFERRED | Per-instance only on Vercel; acceptable for launch volume, move to a shared store later. |
| Gamification re-enable | DEFERRED | Flip `FEATURE_FLAGS.progression` and re-grant table privileges via a forward migration; do not re-enable for 1.0. |

## Post-deploy read-only verification plan (run after approval + deploy)

1. `curl -sI https://campusquestapp.com/legal/privacy` → CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` present.
2. `curl -s -o /dev/null -w '%{http_code}' -X POST https://campusquestapp.com/api/internal/admin/apply-qr-bootstrap` → `404`.
3. `curl -s -X POST -H 'content-type: application/json' -d '{}' https://campusquestapp.com/api/{bosses/attempt,quests/complete,guilds/join,me/milestones/evaluate,activities/log}` → `FEATURE_DISABLED`.
4. With a student bearer token: `GET /api/internal/admin/moderation/content/reports` → `403`; `POST /api/xp/add` → `403 XP_SELF_GRANT_FORBIDDEN`.
5. Read-only SQL on production (service connection, no writes):
   - `select policyname from pg_policies where policyname in ('users can insert own boss attempts','Users insert own boss drops','user_stats insert own row','users can insert own inventory items','organization_members update self','direct_conversation_participants own rows','student_connections own rows');` → 0 rows
   - `select tgname from pg_trigger where tgname in ('trg_enforce_organization_member_write','trg_enforce_dm_participant_self_update','trg_enforce_student_connection_transition','trg_enforce_guild_economy_fields','trg_enforce_marketplace_offer_update','trg_protect_profile_server_owned_fields');` → 6 rows
   - `select id, public, file_size_limit from storage.buckets where id in ('dm-images','dm-audio');` → both `public=false`
   - `select count(*) from pg_policies where schemaname='storage' and (qual ilike '%dm-images%' or qual ilike '%dm-audio%' or with_check ilike '%dm-%');` → 0
   - `select table_name, privilege_type from information_schema.role_table_grants where grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE','DELETE') and table_name in ('user_stats','xp_logs','boss_attempts','user_inventory','guilds','guild_members','user_quests','quest_completions','qr_scans','boss_drops','activities','user_beginner_quest_claims');` → 0 rows
6. Fetch a DM image in the app → URL contains `/storage/v1/object/sign/` with a 10-minute token; the same path without token → 400/403.
7. View page source / bundle on the live site: no `service_role` string.
8. Sign in as the reviewer account; confirm Quad, posting, comments, Report, Block, orgs/events, map, DMs with image + voice note, profile, Settings → Delete account entry are reachable, and `/admin` is refused.
9. Public pages: `/`, `/legal/privacy`, `/legal/terms`, `/legal/community-guidelines`, `/support` → 200.
