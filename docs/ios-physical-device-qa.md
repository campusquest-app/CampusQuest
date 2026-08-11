# Physical device release QA (iOS Capacitor)

Run on a **physical iPhone** with a **Release** / TestFlight build when possible. Simulators cannot fully validate APNs, camera, mic, or real GPS.

Mark each item: **PASS** / **FAIL** / **BLOCKED** and add a short note.

Device: _____________ iOS: _____________ Build: 1.0 (1) Tester: _____________ Date: _____________

---

## Install / launch

| Item | Result | Notes |
|------|--------|-------|
| Clean install | | |
| First launch (splash → live app) | | |
| Launch after force close | | |
| Background → foreground | | |
| Launch with network unavailable | | |

## Account

| Item | Result | Notes |
|------|--------|-------|
| Create account | | |
| URI email validation | | |
| Verification email received | | |
| Verify email → can sign in | | |
| First login + onboarding | | |
| Logout | | |
| Login again | | |
| Incorrect password (friendly message) | | |
| Unverified account handling | | |
| QA account `qa_signup@campusquestapp.com` reaches main app | | |

## Feed

| Item | Result | Notes |
|------|--------|-------|
| View posts | | |
| Like / unlike | | |
| Comments / replies | | |
| Create text post | | |
| Image post | | |
| Multi-image post | | |
| Video post | | |
| Mixed-media post | | |
| Delete own post | | |
| Report post | | |
| Block user from post/profile | | |

## Gestures

| Item | Result | Notes |
|------|--------|-------|
| Horizontal multi-image swipe (not stolen by tab swipe) | | |
| Pinch-to-zoom on images | | |
| Page tab swipe outside media | | |
| Vertical scroll | | |
| Pull-to-refresh (if present) | | |

## Messages

| Item | Result | Notes |
|------|--------|-------|
| Conversation list | | |
| Send message | | |
| Receive message | | |
| Unread count | | |
| Push / notification → conversation | | |
| Deleted conversation deep link falls back gracefully | | |

## Map

| Item | Result | Notes |
|------|--------|-------|
| First load | | |
| Allow location | | |
| Deny location (app still usable) | | |
| Markers visible | | |
| Marker selection | | |
| Event details | | |
| Walk To | | |
| Return from navigation | | |
| Bad / no network on map | | |
| No obvious duplicate stacked pins for same building | | |

## Events

| Item | Result | Notes |
|------|--------|-------|
| Open campus event | | |
| Open external synced event | | |
| Location shown | | |
| RSVP if applicable | | |
| Push → event detail | | |

## Profile

| Item | Result | Notes |
|------|--------|-------|
| Avatar / fallback when image missing | | |
| Profile image | | |
| Other user profile | | |
| Edit profile | | |
| Staff/faculty exclusion from student leaderboards (if applicable) | | |

## Native integrations

| Item | Result | Notes |
|------|--------|-------|
| Share sheet | | |
| Haptic feedback | | |
| External Browser / Maps handoff | | |
| Camera | | |
| Microphone | | |
| Photo library | | |
| Location | | |
| Push settings → iOS Settings when denied | | |
| Keyboard does not permanently cover inputs | | |
| Status bar readable | | |
| Safe areas (notch / home indicator) | | |

## Privacy / safety

| Item | Result | Notes |
|------|--------|-------|
| Account deletion (throwaway account only) | | |
| Block user | | |
| Unblock immediately after accidental block | | |
| Report post/user | | |
| Permission denial does not crash | | |

## Stress

| Item | Result | Notes |
|------|--------|-------|
| Rapidly switch tabs | | |
| Repeatedly open/close map | | |
| Repeated feed refresh | | |
| 10+ minute session | | |
| Background during media upload | | |
| Network interruption mid-action | | |
| Low connectivity | | |

## Production env sanity (preflight)

| Item | Result | Notes |
|------|--------|-------|
| App loads `https://campusquestapp.com` (not localhost) | | |
| No Expo / `/mobile` UI | | |
| `NEXT_PUBLIC_DEBUG_EVENT_PINS` off in Production | | |
| `NEXT_PUBLIC_DEBUG_MAP_MAGIC` off in Production | | |
| Archive scheme = Release | | |

## Sign-off

Overall: PASS / FAIL / BLOCKED  
Blockers: _______________________________________________
