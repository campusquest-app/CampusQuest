# Physical device release QA (iOS Capacitor)

Run on a **physical iPhone** with a **Release** / TestFlight build when possible. Simulators cannot fully validate APNs or camera in all cases.

## Preflight

- [ ] Bundle ID `com.nicklockhart.campusquest`
- [ ] Version/build expected (currently 1.0 / 1 unless bumped)
- [ ] Archive scheme = **Release** (not Debug / CAPACITOR_DEBUG)
- [ ] App loads `https://campusquestapp.com` (not localhost)
- [ ] No Expo / `/mobile` assets appear

## First launch / auth

- [ ] LaunchScreen splash appears, then live app
- [ ] Sign up / sign in works
- [ ] QA account `qa_signup@campusquestapp.com` reaches main app without URI email
- [ ] Legal consent can be accepted; Privacy/Terms/Guidelines open

## Native chrome

- [ ] Status bar readable on dark UI
- [ ] Safe areas OK under notch / Dynamic Island / home indicator
- [ ] Keyboard does not permanently cover DM compose / auth fields
- [ ] External Maps / URInvolved links leave the WebView (system browser / Maps)

## Permissions (grant + deny paths)

- [ ] **Location when in use:** Realm map; deny leaves app usable
- [ ] **Camera:** QR + media capture; deny shows a clear failure, no crash
- [ ] **Microphone:** voice note / video; deny fails gracefully
- [ ] **Photos:** library pick works; deny fails gracefully
- [ ] **Notifications:** not prompted on cold launch; opt-in via Settings → Push notifications; denied state offers path to iOS Settings

## Push (requires APNs + capability)

- [ ] Enable push on device
- [ ] Receive DM push while backgrounded
- [ ] Tap DM push → opens that conversation (or Inbox messages)
- [ ] Tap tag/comment push → opens the post when available
- [ ] Tap event announcement → Events detail when event still listed
- [ ] Logout disables device association (no pushes after logout)

## Product surfaces

- [ ] The Quad feed loads; create a post with photo/video
- [ ] Inbox messages + notifications
- [ ] Share profile / share post uses share sheet on device
- [ ] Light haptics on map marker / celebrations (if perceptible)
- [ ] Offline: airplane mode shows load failure / offline shell without white crash

## Safety

- [ ] Report post / comment / message / profile / event / org
- [ ] Block user; blocked user cannot message
- [ ] Delete account on a **throwaway** account only

## Red flags (fail build)

- [ ] Localhost or staging URL in production build
- [ ] Debug map pins / magic map env flags on
- [ ] Developer-only admin tools visible to non-admin
- [ ] Stripe/payment UI that does not exist in web product
- [ ] Push permission spam on first open
