# Capacitor Push Notifications (iOS)

Native push is implemented for the Capacitor shell (`/native`) and wired into the existing `notifications` table via `createNotification` / `createNotificationsBulk`.

## What you must do manually

### 1. Apple Developer Portal
1. Open [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list).
2. Select App ID `com.nicklockhart.campusquest`.
3. Enable **Push Notifications**.
4. Create a **Key** → Apple Push Notifications service (APNs) → download the `.p8` once.
5. Note `KEY ID` and your Team ID.

### 2. Xcode
1. Open `native/ios/App/App.xcodeproj`.
2. Target **App** → **Signing & Capabilities**. Team must stay **CampusQuest, Inc. (`484VK346B4`)**. Do not switch the target to `22HZFLJZ9X`.
3. Xcode 16 and later do not list **Push Notifications** in the + Capability picker. Searching “noti” only shows Communication, Fall Detection, and Time Sensitive Notifications. Standard push is the `aps-environment` entitlement, which is already in the Debug and Release entitlement files. Do not add Location Push (`com.apple.developer.location.push`); that is a different, restricted capability.
4. Background Modes → Remote notifications is already in `Info.plist` (`remote-notification`).
5. APNs auth uses the same team as the signed app. Set `APNS_TEAM_ID=484VK346B4`. The Key ID is not a substitute for the Team ID.

Repo entitlements:
- Debug: `native/ios/App/App/App.entitlements` → `aps-environment = development`
- Release/archive: `native/ios/App/App/AppRelease.entitlements` → `aps-environment = production`

Enabling the capability in the Developer portal is still a manual step. Do not treat the repo files as a substitute for that portal checkbox.

### 3. Vercel / server environment
Set (Production + Preview as needed):

```bash
APNS_KEY_ID=34Q7U6QWCT
APNS_TEAM_ID=484VK346B4
APNS_BUNDLE_ID=com.nicklockhart.campusquest
APNS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
APNS_PRODUCTION=true   # false only for local Xcode debug sandbox tokens
```

Never commit the `.p8` or expose these as `NEXT_PUBLIC_*`.

### 4. Database
Apply migration:

```bash
# from repo root, with your usual Supabase workflow
supabase db push
# or apply supabase/migrations/20260811120000_push_devices.sql in the SQL editor
```

Creates `push_devices` + `user_push_settings` with RLS.

## App behavior
- Permission is **not** requested on first launch.
- Users enable push from **Settings → Push notifications**.
- Logout disables the current device token association.
- Push is sent **after** the in-app notification row is created (fire-and-forget).

## Admin Push Notifications

The admin dashboard section **Push Notifications** sends an announcement after confirmation. A test send is limited to one selected user. The same idempotency key cannot send a second time.

`push_broadcast_attempts` records whether Apple accepted or rejected each request. Acceptance is not delivery and does not mean the student saw the alert.

Apply `supabase/migrations/20261111180000_admin_push_broadcasts.sql` before the first send. The page cannot send until that migration is applied.

Promotional Student Perks pushes require `perks_enabled` (default off). CampusQuest announcements use `announcements_enabled` (default on). Account and safety alerts stay on the existing system category.

## v1 push types
Messages, friend request / accepted, tags/mentions/tag approval, comments, org request approved/denied, moderation safety, org event announcements.

Skipped: likes, self RSVP confirmations, quests (none exist).
