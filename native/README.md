# CampusQuest Native (Capacitor iOS)

Isolated Capacitor shell that loads the **live production** CampusQuest web app.

| Path | Role |
|------|------|
| `/` (repo root) | **Source of truth** — Next.js 14 app on Vercel |
| `/native` | Capacitor iOS shell only |
| `/mobile` | Obsolete Expo prototype — **do not use** |

This folder does **not** copy or rewrite the Next.js app. Editing CampusQuest in Cursor and deploying to Vercel updates what the iOS shell displays after refresh / relaunch.

## What the shell provides

- App name: **CampusQuest**
- Bundle ID: **com.nicklockhart.campusquest**
- Web content: `https://campusquestapp.com`
- HTTPS only (`cleartext: false`, no ATS weakening)
- In-WebView navigation limited to CampusQuest + Supabase hosts
- Other links open outside the WebView (Capacitor Browser / system browser)
- Privacy usage strings for camera, photos, microphone, location (when in use)
- Status bar + keyboard plugin configuration; Share + Haptics plugins
- Optional iOS push notifications (see `docs/ios-push-notifications.md`) — enable Push capability in Xcode manually

## Prerequisites

- macOS with **Xcode** (this machine has Xcode 26.x)
- Apple Developer account (for device / TestFlight later)
- Network access to `https://campusquestapp.com`

## Quick start

```bash
cd native
npm install
npm run sync
npm run open:ios
```

In Xcode:

1. Select a Simulator (e.g. iPhone 16) or a connected iPhone.
2. Choose your **Team** under Signing & Capabilities if prompted.
3. For push: add **Push Notifications** + **Background Modes → Remote notifications**.
4. Press **Run** (▶).

### Simulator from Cursor / terminal

```bash
cd native
npm run sync
npx cap run ios
```

### Real iPhone

1. Connect the iPhone, trust the computer.
2. In Xcode → Signing & Capabilities → select your Team.
3. Select your phone as the run destination.
4. Run. First launch may require Settings → General → VPN & Device Management to trust the developer certificate.

## Syncing Capacitor changes

After editing `capacitor.config.ts`, plugins, or `www/`:

```bash
cd native
npm run sync
```

Then rebuild/run from Xcode (or `npx cap run ios`).

Opening the project again:

```bash
cd native
npm run open:ios
```

**Xcode project to open:**

```text
native/ios/App/App.xcodeproj
```

(`npm run open:ios` opens this for you.)

## Auth / localStorage persistence

The shell loads the remote production origin. Session tokens and `localStorage` for `campusquestapp.com` are scoped to that origin inside WKWebView and normally persist across app restarts. Verify manually:

1. Sign in on Simulator/device.
2. Force-quit CampusQuest.
3. Relaunch — you should still be signed in (unless the web session expired).

## Configuration source

Live URL and navigation allow-list: `native/capacitor.config.ts`

```ts
server: {
  url: "https://campusquestapp.com",
  cleartext: false,
  allowNavigation: [
    "campusquestapp.com",
    "*.campusquestapp.com",
    "*.supabase.co",
    "supabase.co",
  ],
}
```

## Scripts

| Script | Command |
|--------|---------|
| Install deps | `cd native && npm install` |
| Sync native project | `cd native && npm run sync` |
| Open Xcode | `cd native && npm run open:ios` |
| Run on Simulator | `cd native && npx cap run ios` |

## Out of scope (later phases)

- ~~Push notifications~~ → see `docs/ios-push-notifications.md` (Phase 2 landed)
- Offline / bundled web assets
- Native UI redesign
- Changing Supabase, auth, or Vercel for unrelated features
- App Store submission assets / review narrative beyond the shell

## Push notifications (Phase 2)

Plugin: `@capacitor/push-notifications` (synced into iOS SPM).

Enable APNs credentials and Xcode Push capability before expecting delivery. Full checklist: `docs/ios-push-notifications.md`.

## App Store 4.2 note (thin wrapper)

This Phase 1 binary is intentionally a native shell around the live website. Apple may reject “minimum functionality” / thin WebView wrappers (Guideline 4.2) if the app is only a browser bookmark. Before TestFlight/App Store submission, plan to add meaningful native value (e.g. push, Share Sheet / camera plugins wired natively, offline shell, or other iOS-integrated features) and a review narrative that CampusQuest is a full campus product hosted securely, not a generic website wrapper.
