# App Review Notes — CampusQuest (iOS)

Ready to paste into App Store Connect → App Review Information → Notes.
Fill the password placeholder before pasting. Never commit the real password.

---

CampusQuest is a campus community app for University of Rhode Island students. The 1.0 experience includes a campus feed (The Quad), organizations and events, a campus map (The Realm), personalized For You event recommendations, direct messages, student profiles, Campus Memories, and Student Perks.

The iOS app is a Capacitor shell that loads https://campusquestapp.com over HTTPS. It is more than a generic website wrapper: it uses native location for The Realm map, optional push notification registration, native share and haptics, keyboard handling, a branded splash/status bar, and camera/photo/microphone access for student-generated content. External websites open outside the in-app WebView.

DEMO ACCOUNT
Email: qa_signup@campusquestapp.com
Password: <<REVIEWER_PASSWORD — set in App Store Connect only>>

This is a dedicated App Review account. Campus email is already verified in the profile, so you do not need mailbox access and will not be asked for a 6-digit verification code. On the campus onboarding step it shows that URI email is verified — tap Continue. The account has no admin privileges. Completed onboarding, friends, and messages persist across sign-in.

Some feed, map, and Student Perks items are labeled [Demo] or (Demo). Those are isolated fictional fixtures for this review account so you can exercise report, block, RSVP, messaging, and Perks without affecting real students. They are not unfinished product placeholders.

WHAT TO TEST (suggested order)
1. Sign in with the demo account. Accept Terms, Privacy Policy, and Community Guidelines if prompted, then finish the short onboarding if it appears.
2. The Quad (Home): scroll the feed, open a post, use ••• → Report.
3. Create a post with text and an optional photo. You may delete it from the post menu afterward.
4. Open comments, add a comment, and use Report on a comment.
5. Open a profile → ••• → Block. Blocked users cannot send new messages. Existing history stays visible. Manage blocks in Settings → Safety → Blocked users.
6. Events: browse organizations and events, RSVP, and use Report.
7. The Realm (Map): grant location to see your position and request directions, or deny it — the map still works. Event and business pins use public place coordinates, not your GPS.
8. Messages: open the seeded conversation, send text, optionally send a photo or hold to record a voice note. Use Report from the conversation menu.
9. Student Perks: open the demo café listing. Any demo pass is marked not valid for redemption.
10. Profile: edit display name, bio, or photo.
11. Settings: Help & Support, Privacy & Support, Safety → Blocked users, Account → Delete account (type DELETE). Please do not delete this demo account. To test deletion end-to-end, create a throwaway account with any email.

PERMISSIONS
- Camera / Photos: posts, campus memories, messages, and profile media. Requested when you attach media, not at first launch.
- Microphone: video for posts/memories and optional voice notes. Requested when you record.
- Location While Using: your position on The Realm and walking/driving directions. Not used to place campus events. No background location.
- Notifications: optional. Requested only if you enable Push notifications in Settings.

NOTES
- XP, quests, QR scanning, guilds, and leaderboards from older material are intentionally disabled and are not part of this 1.0 submission.
- There are no paid subscriptions or paid digital features. Events → For You is free for every signed-in account.
- Report and block are enforced on the server. Our team reviews reports in an internal moderation console.
- Account deletion is self-serve in Settings → Delete account. It removes the login, profile, and user-owned media we control. Provider backups and limited safety/audit records may remain.
- Privacy Policy: https://campusquestapp.com/legal/privacy
- Terms: https://campusquestapp.com/legal/terms
- Community Guidelines: https://campusquestapp.com/legal/community-guidelines
- Support: https://campusquestapp.com/support (support@campusquestapp.com)

Thank you for reviewing CampusQuest.

---

## Internal notes (do not paste)

- Provision: `QA_TEST_ACCOUNT_EMAIL=qa_signup@campusquestapp.com QA_TEST_ACCOUNT_PASSWORD='…' node scripts/ensure-qa-account.mjs`
- Exact email only (`lib/appReviewAccount.ts`). Role stays `qa`. Campus verification is pre-set on `campus_email_verified_at`, not skipped at request time.
- Login gap-fills isolated demo fixtures; it does not wipe reviewer onboarding.
- If the reviewer deletes the account, re-run the provision script, then sign in once or `node scripts/seed-review-demo.mjs --confirm`.
