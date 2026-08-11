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
2. Target **App** → **Signing & Capabilities**.
3. Click **+ Capability** → **Push Notifications**.
4. Click **+ Capability** → **Background Modes** → check **Remote notifications** (Info.plist already lists `remote-notification`).
5. Use an Apple Development Team that matches the App ID.

### 3. Vercel / server environment
Set (Production + Preview as needed):

```bash
APNS_KEY_ID=...
APNS_TEAM_ID=...
APNS_BUNDLE_ID=com.nicklockhart.campusquest
APNS_P8_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
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

## v1 push types
Messages, friend request / accepted, tags/mentions/tag approval, comments, org request approved/denied, moderation safety, org event announcements.

Skipped: likes, self RSVP confirmations, quests (none exist).
