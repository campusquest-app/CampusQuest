# CampusQuest Beta Manual Test Checklist

Use this checklist outside Cursor on real devices and browsers before inviting student testers.
Check each box only after you have personally verified the behavior.

## Two-account social flows

- [ ] **Friend request send** — User A searches for User B and sends a follow request
- [ ] **Friend request notification** — User B sees the request in Notifications and Friends
- [ ] **Accept request** — User B accepts; both accounts show as connected
- [ ] **Deny request** — User C sends request to User B; User B denies; request disappears cleanly
- [ ] **Cross-user profile privacy** — User A cannot see private content on User B's profile when not connected

## Quad engagement persistence

- [ ] **Like count after refresh** — User A likes User B's post; count stays correct after page refresh
- [ ] **Like count after logout/login** — Same as above after signing out and back in
- [ ] **Like notification** — User B receives a notification when User A likes their post (not on self-like)
- [ ] **Unlike removes like notification** — User A unlikes; duplicate notification does not appear on re-like
- [ ] **Comment notification** — User B receives a notification when User A comments (not on self-comment)

## QR and events

- [ ] **QR scanner opens** — Camera permission prompt appears; scanner UI loads on mobile
- [ ] **QR scan with real device camera** — Valid campus QR code scans successfully
- [ ] **QR XP reward** — XP/stats update after a successful scan; no raw error JSON shown
- [ ] **RSVP with authenticated user** — RSVP on a campus event saves and reflects in the UI

## Mobile layout and navigation

- [ ] **Responsive layout** — Quad, Profile, Realm, Friends, and Notifications look correct at phone widths
- [ ] **Bottom nav** — All tabs work; nav does not cover primary content or CTAs
- [ ] **Hamburger menu** — Opens and closes; navigation destinations work
- [ ] **Swipe gestures** — Back/swipe surfaces work where implemented (DM thread, manual log, etc.)
- [ ] **No contrast issues** — No white-on-white text or unreadable error states

## PWA / browser matrix

- [ ] **iPhone Safari** — Sign in, Quad feed, create post, notifications
- [ ] **iPhone PWA (Add to Home Screen)** — App icon loads; session persists reasonably across launches
- [ ] **Android Chrome** — Sign in, Quad feed, Realm map, QR scanner
- [ ] **Android PWA** — Install prompt or Add to Home Screen works; icon is not broken

## Admin (optional, if testing admin account)

- [ ] **Admin dashboard** — `/internal/admin` loads for allow-listed admin only
- [ ] **Student blocked** — Non-admin student sees forbidden state, not admin tools
- [ ] **User search and moderation** — Search, reports queue, and moderation actions load

## Sign-off

| Tester | Date | Device / browser | Pass / fail notes |
|--------|------|------------------|-------------------|
|        |      |                  |                   |

**Apply database migration before testing notifications:**

```bash
# If using Supabase CLI locally or linked project:
supabase db push

# Or apply migration SQL manually in Supabase dashboard:
# supabase/migrations/20260622120000_quad_post_notifications.sql
```
