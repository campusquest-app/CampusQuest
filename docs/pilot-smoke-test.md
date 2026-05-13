# CampusQuest Pilot Smoke Test

Use this checklist to manually verify pilot readiness for school verification, scoped campus features, moderation, and analytics.

## Environment and Accounts

- Ensure `.env.local` includes:
  - `PILOT_SCHOOL_NAME=University of Rhode Island`
  - `PILOT_SCHOOL_DOMAIN=uri.edu`
  - `MODERATION_ADMIN_EMAILS` with your test admin user
- Restart `npm run dev` after env updates.
- Prepare test accounts:
  - One confirmed `@uri.edu` student account (URI user)
  - One confirmed non-`@uri.edu` student account (non-URI user)
  - One admin account listed in `MODERATION_ADMIN_EMAILS`

---

## 1) Campus Email Verification

- [ ] Sign in with a confirmed non-`uri.edu` account.
- [ ] Confirm the user is blocked from campus features and sees the school verification gate.
- [ ] Sign in with a confirmed `uri.edu` account.
- [ ] Confirm the user passes school verification and can access events/org/discovery features.
- [ ] Log out and sign back in as the same `uri.edu` account.
- [ ] Confirm verified status persists after logout/login.

---

## 2) School Scoping

- [ ] As a verified URI user, open Events and Organizations.
- [ ] Confirm URI user only sees URI-scoped events/orgs by default.
- [ ] Create an event as URI user.
- [ ] Verify DB row in `campus_events` includes expected `school_name` and `school_domain`.
- [ ] Create an organization as URI user.
- [ ] Verify DB row in `student_organizations` includes expected `school_name` and `school_domain`.
- [ ] Attempt RSVP on content from another school/domain (seeded or manually inserted).
- [ ] Confirm RSVP is rejected for cross-campus content.
- [ ] Attempt follow/join on org from another school/domain.
- [ ] Confirm follow is rejected for cross-campus content.

---

## 3) Student Discovery Safety

- [ ] As verified URI user, attempt to send a connection request to another verified URI student.
- [ ] Confirm request succeeds.
- [ ] Attempt to send a connection request to a user outside URI verified school.
- [ ] Confirm request is blocked by campus-scope restrictions.

---

## 4) Event/Organization Reporting

- [ ] As a student user, report an event from the Events feed.
- [ ] As a student user, report an organization from the Organizations feed.
- [ ] Sign in as admin and open `/internal/admin` (or `/internal/moderation`).
- [ ] Confirm both reports appear in Campus Content Moderation queue.

---

## 5) Moderation Actions

- [ ] In internal moderation, remove a reported event.
- [ ] Confirm removed event no longer appears to students.
- [ ] Restore that event.
- [ ] Confirm restored event appears again.
- [ ] Remove a reported organization.
- [ ] Confirm removed organization no longer appears to students.
- [ ] Restore that organization.
- [ ] Confirm restored organization appears again.

---

## 6) Analytics

Open `/internal/admin` and verify Pilot Analytics updates after the actions above:

- [ ] `total users`
- [ ] `verified users`
- [ ] `events created`
- [ ] `RSVPs`
- [ ] `organizations created`
- [ ] `messages sent`
- [ ] `reports submitted`
- [ ] `daily active users` (if available from recent activity)

Tip: use **Refresh** on the analytics card after each action batch.

---

## 7) Security Notes

- [ ] Never paste tokens, cookies, service role keys, or admin keys into chat, logs, screenshots, or GitHub.
- [ ] Use test accounts only for smoke tests.
- [ ] Run this checklist in local or staging first before production rollout.
