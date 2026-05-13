# CampusQuest MVP QA Checklist

This checklist captures the MVP QA + cleanup pass completed in this cycle.

Legend:

- `PASS (code)` = verified by API/UI code paths and guards.
- `PASS (validated)` = verified by command/tooling run.
- `MANUAL` = needs browser/session execution with test accounts.
- `FIXED` = bug found during this pass and corrected.

## QA Summary Table

Fill this first during real runs so status is visible at a glance.

| Phase | Scope | Owner | Started At | Completed At | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| A | New student flow |  |  |  | `PASS/FAIL/BLOCKED` |  |
| B | Core student actions |  |  |  | `PASS/FAIL/BLOCKED` |  |
| C | Organization admin flow |  |  |  | `PASS/FAIL/BLOCKED` |  |
| D | Internal admin flow |  |  |  | `PASS/FAIL/BLOCKED` |  |
| E | Security negative tests |  |  |  | `PASS/FAIL/BLOCKED` |  |

## Release Readiness Gates

All gates should be checked before sign-off:

- [ ] Gate 1: Phases A-E completed with no unresolved blocker defects.
- [ ] Gate 2: Security checks passed (admin isolation, role boundaries, scoped content, suspended user restrictions).
- [ ] Gate 3: Tooling passed in latest state:
  - [ ] `npx tsc --noEmit`
  - [ ] `npm run lint`
- [ ] Gate 4: Any `FAIL` or `BLOCKED` item has tracked issue IDs and owners.
- [ ] Gate 5: QA evidence captured in run log entries below.

## 1) New Student Flow

- [x] Sign up endpoint and setup path exist (`/api/auth/signup`) - `PASS (code)`
- [x] Email confirmation handling in auth screen is present (confirmed + resend flow) - `PASS (code)`
- [x] Legal consent gate enforced before dashboard access - `PASS (code)`
- [x] School verification gate enforced before campus feature access - `PASS (code)`
- [x] Onboarding preferences modal + API (`/api/me/onboarding-preferences`) wired after auth - `PASS (code)`
- [ ] End-to-end browser run (signup -> confirm -> consent -> verify -> onboarding -> dashboard) - `MANUAL`

Notes:

- Auth flow order is safety check -> legal consent -> school verification -> dashboard/onboarding.

## 2) Core Student Actions

- [x] Browse events (`/api/events`) with scoped filtering - `PASS (code)`
- [x] RSVP to event (`/api/events/[eventId]/rsvp`) - `PASS (code)`
- [x] Browse organizations (`/api/organizations`) - `PASS (code)`
- [x] Follow/join organization (`/api/organizations/[organizationId]/follow`) with join-request support - `PASS (code)`
- [x] Send connection request (`/api/social/connections/request`) - `PASS (code)`
- [x] Accept connection request (`/api/social/connections/requests/respond`) - `PASS (code)`
- [x] Send direct message (`/api/social/conversations/[conversationId]/messages`) - `PASS (code)`
- [x] Report message/event/org endpoints present and wired - `PASS (code)`
- [ ] Full browser happy-path exercise with two student accounts - `MANUAL`

## 3) Organization Admin Flow

- [x] Create organization flow available - `PASS (code)`
- [x] Open org admin portal from org card for owner/admin roles - `PASS (code)`
- [x] Edit org profile/settings in portal - `PASS (code)`
- [x] Create/edit/delete events in portal - `PASS (code)`
- [x] View RSVP attendees in portal - `PASS (code)`
- [x] Send organization announcements in portal - `PASS (code)`
- [x] Approve/deny join requests in portal - `PASS (code)`
- [x] Manage members and roles (owner/admin constraints) - `PASS (code)`
- [ ] End-to-end browser run with owner/admin/member accounts - `MANUAL`

Notes:

- Owner-only role transfer/demotion logic is enforced server-side.

## 4) Internal Admin Flow

- [x] `/internal/admin` access gate via `requireAdminUser` - `PASS (code)`
- [x] Report queue for messages + campus content - `PASS (code)`
- [x] Resolve/dismiss moderation reports - `PASS (code)`
- [x] Suspend/reactivate users (existing moderation flow) - `PASS (code)`
- [x] Remove/restore events/orgs - `PASS (code)`
- [x] Appeals dashboard flow present - `PASS (code)`
- [x] Audit logs visible in internal admin - `PASS (code)`
- [x] Pilot analytics card/API present - `PASS (code)`
- [ ] Full browser run with admin account - `MANUAL`

## 5) UI Polish Pass

- [x] Broken lint-blocking UI text issue fixed (`FindFriends` apostrophe escape) - `FIXED`
- [x] Organization join CTA behavior clarified (disabled + role-aware labels) - `FIXED`
- [x] Portal empty states improved (members/events/announcements) - `FIXED`
- [x] Portal loading/error/notice states are explicit - `PASS (code)`
- [x] Demo-looking filler copy removed from new org admin surfaces - `PASS (code)`
- [ ] Mobile visual QA pass in browser on small viewport - `MANUAL`

## 6) Security Verification

- [x] Suspended/banned users blocked from restricted social/org actions via `assertAccountCanSocialize` - `PASS (code)`
- [x] Non-admin access blocked on internal admin APIs via `requireAdminUser` - `PASS (code)`
- [x] Org member/admin/owner permissions enforced server-side (no client trust) - `PASS (code)`
- [x] Cross-school scoped content blocked in events/orgs/social - `PASS (code)`
- [x] No service-role/admin keys exposed in client components - `PASS (code)`
- [ ] Runtime browser/API negative testing with real tokens and roles - `MANUAL`

Notes:

- During this pass, role-write paths were hardened to avoid RLS bypass assumptions by using explicit server checks and admin-backed writes where needed.

## 7) Tooling Validation

- [x] `npx tsc --noEmit` - `PASS (validated)`
- [x] `npm run lint` - `PASS (validated)` (warnings remain, no blocking errors)

## Follow-up Manual Script (Recommended)

Run this with test accounts in local/staging:

1. Student A (`uri.edu`) full onboarding and campus actions.
2. Student B (`uri.edu`) connection + DM + reporting flows.
3. Student C (non-URI) negative gating checks.
4. Org owner/admin/member role matrix in admin portal.
5. Internal admin moderation + analytics pass.

---

## Manual Browser Runbook (Next Step)

Use this section to execute the full MVP QA journey in one controlled pass.

### Test Account Matrix

- `student_uri_a`: confirmed `@uri.edu` account
- `student_uri_b`: confirmed `@uri.edu` account
- `student_non_uri`: confirmed non-`@uri.edu` account
- `org_owner_uri`: confirmed `@uri.edu` account (can create/manage org)
- `org_admin_uri`: confirmed `@uri.edu` account (promoted by owner)
- `org_member_uri`: confirmed `@uri.edu` account (regular member)
- `internal_admin_uri`: confirmed `@uri.edu`, listed in `MODERATION_ADMIN_EMAILS`

### Preflight

- [ ] Verify `.env.local` has pilot + admin keys configured.
- [ ] Start app with `npm run dev`.
- [ ] Apply latest migrations + seed data for local/staging.
- [ ] Open one private browser window per actor or log out/login between steps.

### Phase A - New Student Flow

1. `student_non_uri`: sign up, confirm email, sign in.
2. Verify legal consent screen appears; accept.
3. Verify school verification gate blocks campus access.
4. `student_uri_a`: sign up, confirm email, sign in.
5. Verify legal consent -> school verification success -> onboarding modal.
6. Submit onboarding preferences and verify dashboard access.
7. Log out and back in as `student_uri_a`; verify consent/verification persistence.

Mark result:

- [ ] Phase A PASS
- Notes:

### Phase B - Core Student Actions

1. `student_uri_a`: browse Events and Organizations tabs.
2. RSVP to one event as `going`.
3. Follow one organization and request to join one organization.
4. `student_uri_b`: send connection request to `student_uri_a`.
5. `student_uri_a`: accept connection request.
6. Open DM thread and send at least one message.
7. Report one message, one event, and one organization.

Mark result:

- [ ] Phase B PASS
- Notes:

### Phase C - Organization Admin Flow

1. `org_owner_uri`: create organization.
2. Open organization admin portal from org card.
3. Edit org profile (description/contact/join approval mode).
4. Create organization event.
5. Open RSVP attendees list for the new event.
6. Send organization announcement.
7. `org_member_uri`: submit join request if approval is enabled.
8. `org_owner_uri` or `org_admin_uri`: approve/deny join request.
9. `org_owner_uri`: promote/demote member roles, remove a member.

Mark result:

- [ ] Phase C PASS
- Notes:

### Phase D - Internal Admin Flow

1. `internal_admin_uri`: open `/internal/admin`.
2. Confirm message + campus content reports are visible.
3. Resolve one report and dismiss one report.
4. Suspend then reactivate one test user.
5. Remove then restore one event and one organization.
6. Open appeals section and verify list + actions render.
7. Open audit logs and confirm moderation actions are logged.
8. Open pilot analytics and verify counters changed after prior actions.

Mark result:

- [ ] Phase D PASS
- Notes:

### Phase E - Security Negative Tests

1. `student_non_uri`: verify cannot access campus-scoped content.
2. Non-admin account: call internal admin pages/APIs and verify blocked.
3. Org member (not admin/owner): attempt admin portal actions; verify blocked.
4. Suspended user: attempt restricted actions (connections, DMs, org actions); verify blocked.
5. Confirm no secrets in UI/console/network payloads.

Mark result:

- [ ] Phase E PASS
- Notes:

### Final Sign-off

- [ ] All phases PASS
- [ ] Any failures converted into tracked issues
- [ ] Re-run:
  - [ ] `npx tsc --noEmit`
  - [ ] `npm run lint`

---

## Live QA Run Log Template

Use this while executing the runbook above. Duplicate blocks as needed.

### Session Metadata

- Date:
- Environment: `local` / `staging`
- Build/branch:
- QA owner:
- Notes:

### Run Entry - Phase A

- Start time:
- End time:
- Accounts used:
- Result: `PASS` / `FAIL` / `BLOCKED`
- Evidence notes:
  - Step 1:
  - Step 2:
  - Step 3:
  - Step 4:
  - Step 5:
  - Step 6:
  - Step 7:
- Defects found:
  - `none` or list IDs/short descriptions

### Run Entry - Phase B

- Start time:
- End time:
- Accounts used:
- Result: `PASS` / `FAIL` / `BLOCKED`
- Evidence notes:
  - Step 1:
  - Step 2:
  - Step 3:
  - Step 4:
  - Step 5:
  - Step 6:
  - Step 7:
- Defects found:
  - `none` or list IDs/short descriptions

### Run Entry - Phase C

- Start time:
- End time:
- Accounts used:
- Result: `PASS` / `FAIL` / `BLOCKED`
- Evidence notes:
  - Step 1:
  - Step 2:
  - Step 3:
  - Step 4:
  - Step 5:
  - Step 6:
  - Step 7:
  - Step 8:
  - Step 9:
- Defects found:
  - `none` or list IDs/short descriptions

### Run Entry - Phase D

- Start time:
- End time:
- Accounts used:
- Result: `PASS` / `FAIL` / `BLOCKED`
- Evidence notes:
  - Step 1:
  - Step 2:
  - Step 3:
  - Step 4:
  - Step 5:
  - Step 6:
  - Step 7:
  - Step 8:
- Defects found:
  - `none` or list IDs/short descriptions

### Run Entry - Phase E

- Start time:
- End time:
- Accounts used:
- Result: `PASS` / `FAIL` / `BLOCKED`
- Evidence notes:
  - Step 1:
  - Step 2:
  - Step 3:
  - Step 4:
  - Step 5:
- Defects found:
  - `none` or list IDs/short descriptions

### Defect Tracker (Quick List)

- `MVP-QA-001`:
  - Severity:
  - Area:
  - Repro steps:
  - Expected:
  - Actual:
  - Owner:
  - Status: `open` / `in_progress` / `fixed` / `verified`
- `MVP-QA-002`:
  - Severity:
  - Area:
  - Repro steps:
  - Expected:
  - Actual:
  - Owner:
  - Status: `open` / `in_progress` / `fixed` / `verified`

---

## Example Golden Run (Phase A)

Use this as a formatting reference for real runs.

- Start time: `2026-05-12 22:05 UTC-4`
- End time: `2026-05-12 22:19 UTC-4`
- Accounts used: `student_non_uri`, `student_uri_a`
- Result: `PASS`
- Evidence notes:
  - Step 1: `student_non_uri` completed signup + email confirmation, then signed in successfully.
  - Step 2: Legal consent screen appeared on first sign-in; consent accepted and persisted.
  - Step 3: School verification gate appeared for non-URI account and blocked campus features.
  - Step 4: `student_uri_a` completed signup + email confirmation and signed in.
  - Step 5: `student_uri_a` passed legal consent + school verification path.
  - Step 6: Onboarding preferences modal displayed, submitted, and saved.
  - Step 7: Logout/login repeated for `student_uri_a`; consent + verification state persisted and dashboard loaded.
- Defects found:
  - `none`

## Example Golden Run (Phase B)

- Start time: `2026-05-12 22:22 UTC-4`
- End time: `2026-05-12 22:41 UTC-4`
- Accounts used: `student_uri_a`, `student_uri_b`
- Result: `PASS`
- Evidence notes:
  - Step 1: `student_uri_a` loaded Events + Organizations tabs with campus-scoped content.
  - Step 2: `student_uri_a` RSVP'd `going` on one event and UI count/status updated.
  - Step 3: `student_uri_a` followed one org and submitted one join request.
  - Step 4: `student_uri_b` sent connection request to `student_uri_a`.
  - Step 5: `student_uri_a` accepted request from requests view.
  - Step 6: DM thread opened and both users exchanged at least one message.
  - Step 7: Reports created for one message, one event, and one organization.
- Defects found:
  - `none`

## Example Golden Run (Phase C)

- Start time: `2026-05-12 22:44 UTC-4`
- End time: `2026-05-12 23:10 UTC-4`
- Accounts used: `org_owner_uri`, `org_admin_uri`, `org_member_uri`
- Result: `PASS`
- Evidence notes:
  - Step 1: `org_owner_uri` created organization successfully.
  - Step 2: Owner opened org admin portal from org card.
  - Step 3: Profile fields and join-approval mode updated and persisted.
  - Step 4: Owner created organization event in admin portal.
  - Step 5: RSVP attendee list loaded for created event.
  - Step 6: Announcement sent and appeared in announcement history.
  - Step 7: `org_member_uri` submitted join request.
  - Step 8: Owner approved request; request disappeared from pending list.
  - Step 9: Owner promoted `org_admin_uri`, demoted back, and removed a test member.
- Defects found:
  - `none`

## Example Golden Run (Phase D)

- Start time: `2026-05-12 23:13 UTC-4`
- End time: `2026-05-12 23:36 UTC-4`
- Accounts used: `internal_admin_uri`
- Result: `PASS`
- Evidence notes:
  - Step 1: `/internal/admin` loaded and access was allowed.
  - Step 2: Message and campus content reports appeared in moderation cards.
  - Step 3: One report resolved and one dismissed successfully.
  - Step 4: Test user suspended then reactivated from safety controls.
  - Step 5: One event and one organization removed, then restored.
  - Step 6: Appeals section loaded and actions were available.
  - Step 7: Audit logs included moderation and safety actions from this run.
  - Step 8: Pilot analytics values reflected activity from prior phases.
- Defects found:
  - `none`

## Example Golden Run (Phase E)

- Start time: `2026-05-12 23:39 UTC-4`
- End time: `2026-05-12 23:57 UTC-4`
- Accounts used: `student_non_uri`, `org_member_uri`, `internal_admin_uri`, one suspended test account
- Result: `PASS`
- Evidence notes:
  - Step 1: `student_non_uri` remained blocked from campus-scoped features.
  - Step 2: Non-admin account was denied on internal admin pages/APIs.
  - Step 3: Non-admin org member could view org but was denied admin actions.
  - Step 4: Suspended user was blocked from restricted social/org actions.
  - Step 5: UI/console/network review showed no exposed service keys or tokens.
- Defects found:
  - `none`

---

## QA Completion Workflow

1. Execute phases A -> E in order.
2. Update **QA Summary Table** row after each phase.
3. Record details in the corresponding **Run Entry** section.
4. Log every defect in **Defect Tracker (Quick List)** with owner + status.
5. Re-test fixed defects and mark as `verified`.
6. Re-run:
   - `npx tsc --noEmit`
   - `npm run lint`
7. Complete **Release Readiness Gates**.
8. Final sign-off:
   - [ ] QA complete
   - [ ] No open blocker defects
   - [ ] Ready for pilot/staging rollout
