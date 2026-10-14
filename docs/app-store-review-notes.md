# App Review Notes — CampusQuest (iOS)

Ready to paste into App Store Connect → App Review Information → Notes.
Fill the two placeholders before pasting. Never commit the real password.

---

CampusQuest is a campus community app for University of Rhode Island students: a campus feed ("The Quad"), student organizations and events, a campus map ("The Realm"), direct messages, and student profiles. The iOS app is a native shell that loads our production web experience over HTTPS from https://campusquestapp.com; all features below work without a university email when you use the demo account.

DEMO ACCOUNT (campus-verified reviewer account)
Email: qa_signup@campusquestapp.com
Password: <<REVIEWER_PASSWORD — set in App Store Connect only>>

This account's university email is already verified, so you do not need access to its mailbox and will not be asked for a 6-digit verification code. On the "Your campus" onboarding step it shows "URI email verified" — just tap Continue. It is a normal student account (no admin rights). Its onboarding is reset automatically each time it signs in so you always see the first-run flow; the email verification is kept. If sign-in ever fails, email support@campusquestapp.com and we will reset it within a few hours.

WHAT TO TEST (suggested order, ~10 minutes)
1. Sign in with the demo account. Accept the Terms / Privacy / Community Guidelines consent screen, then complete the short onboarding (the campus step is already verified) to reach the app.
2. The Quad (Home tab): scroll the campus feed, open a post, tap the ••• menu → Report. Reports go to our moderation queue.
3. Create a post: tap the compose button, add text and (optionally) a photo from your library. Delete it afterwards from the post's ••• menu if you like.
4. Comments: open any post, add a comment, then use the comment's menu → Report.
5. Block: open another user's profile → ••• → Block. Blocked users disappear from your feed and cannot message you. Manage blocks under Settings → Safety → Blocked users.
6. Organizations & Events (Events tab): browse organizations, open an event, RSVP, and use Report on an event or organization.
7. The Realm (Map tab): grant location when prompted to see your position; deny it and the map still works.
8. Messages tab: start a direct message with any student, send text, send a photo (Photos permission), hold the microphone button to send a voice note (Microphone permission). Use Report from the conversation menu.
9. Profile tab: edit display name / bio / avatar.
10. Settings (gear icon): Help & Support (contact link), Privacy & Support, Safety → Blocked users, and Account → Delete account (type DELETE to confirm). Please do NOT delete the demo account; a second throwaway account can be created with any email if you want to test deletion end to end — deletion removes the auth user immediately and the account can no longer sign in.

PERMISSIONS
- Camera / Photos: attaching photos and videos to posts, memories, messages and profile.
- Microphone: recording videos for posts and voice notes in direct messages.
- Location (While Using): showing your position and directions on the campus map and placing campus events. We never request background location.
- Notifications: optional message / event alerts.

NOTES FOR THE REVIEWER
- Some gamification features (XP, quests, QR check-ins, guilds, leaderboards) that appear in older marketing material are intentionally disabled server-side for this release and are not visible in the app.
- Content moderation: every post, comment, profile, message, event and organization has a Report action; blocked users are enforced on the server and in the database. Our team reviews reports in an internal moderation console.
- Account deletion is self-serve in Settings and also available by email (see Support page in the app).
- Privacy Policy: https://campusquestapp.com/legal/privacy
- Terms of Service: https://campusquestapp.com/legal/terms
- Community Guidelines: https://campusquestapp.com/legal/community-guidelines
- Support: https://campusquestapp.com/support (email support@campusquestapp.com)

Thank you for reviewing CampusQuest.

---

## Internal notes (do not paste)

- Demo account provisioning: `QA_TEST_ACCOUNT_EMAIL`/`QA_TEST_ACCOUNT_PASSWORD` + `node scripts/ensure-qa-account.mjs` (see `docs/store-reviewer-account.md`). Reset at any time via `POST /api/internal/admin/qa-account/reset` as an admin.
- Campus verification is pre-provisioned, not bypassed: `ensure-qa-account.mjs` sets `profiles.campus_email_verified_at` (the column a 6-digit code sets) for the exact email in `lib/appReviewAccount.ts` only, and refuses any other email. The login-time onboarding reset preserves that timestamp only for this email with `role = 'qa'` + `is_test_user`. Role stays `qa`, never admin. Because `.env.local` may set a different `QA_TEST_ACCOUNT_EMAIL`, run it as `QA_TEST_ACCOUNT_EMAIL=qa_signup@campusquestapp.com node scripts/ensure-qa-account.mjs`.
- `docs/app-review-notes.md` is the previous draft; this file supersedes it (that draft still lists the QR-scanner test step, which is disabled for launch).
