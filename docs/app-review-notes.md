# App Review notes (paste into App Store Connect)

Fill the password before pasting into App Store Connect. Do not commit real passwords.

---

## Demo account

| Field | Value |
|--------|--------|
| Username / email | `qa_signup@campusquestapp.com` |
| Password | `[PASTE QA_TEST_ACCOUNT_PASSWORD HERE]` |

Notes:

- Exact email required. Other `@campusquestapp.com` addresses do **not** bypass campus verification.
- Account role is `qa` / test — excluded from leaderboards and competitive surfaces.
- Onboarding UI can still be walked; campus-email gate is satisfied for this account only.
- Account deletion is real and permanent. You may test it on this account; we restore the account afterwards.

## Demo content

So you can review the social features without real students, this account sees sample content that is
visible **only** to the review account. Everything is fictional and labeled:

- **People:** Maya R. (Demo), Jordan T. (Demo), Priya S. (Demo) — usernames start with `cqdemo_`.
- **Events:** six "[Demo]" events on the Map and in Events (one is live now, the rest over the next few days).
- **The Quad:** five "[Demo]" posts.
- **Organizations:** "[Demo] URI Hiking Club" and the Greek chapter "[Demo] Alpha Delta Demo".
- **Inbox:** a pending follow request from Priya, a message thread from Jordan (an accepted connection),
  and sample notifications.
- **Student Perks:** "CampusQuest Demo Café (Demo)". Its pass is watermarked "DEMO · NOT VALID FOR
  REDEMPTION"; no business honors it. Real merchant passes are limited to verified students.

Catalog demo content stays available when you sign in; completed onboarding, friendships, messages, and notifications are not reset.

## What to test

1. Sign in with the demo account above.
2. Complete or skip through onboarding screens until the main app (The Quad / Inbox / Realm).
3. **Inbox:** accept Priya's follow request; open Jordan's thread and reply.
4. **Push (if TestFlight build has APNs configured):** Settings → Push notifications → enable.
5. **The Realm:** allow location when prompted (when-in-use). Demo event markers appear on the campus map. Denying location should still leave the map usable.
6. **Camera / QR:** open Scanner / QR flow and grant camera if prompted.
7. **Photos:** create a Quad post and choose a library photo or capture media.
8. **UGC safety:** open a demo profile or "[Demo]" post → Report; also try Block.
9. **Student Perks:** open "CampusQuest Demo Café (Demo)" → view the reward pass.
10. **Legal:** Settings / first-run consent links open Privacy, Terms, and Community Guidelines.
11. **Account deletion:** Settings → Delete account → type DELETE. This permanently deletes the account.

## Location / campus context

- Product is oriented around University of Rhode Island campus discovery.
- Demo account bypasses `@uri.edu` email gating for App Review.
- Exact GPS is not required to browse feeds; location is used for map/nearby features when permitted.
- CampusQuest is **not** an official University of Rhode Island application. Event/org data may include public URInvolved-sourced listings with attribution in-app.

## Contact

`support@campusquestapp.com`

## Public policy URLs

- Privacy: https://campusquestapp.com/legal/privacy (also listed as campusquest.app in marketing docs)
- Terms: https://campusquestapp.com/legal/terms
- Community Guidelines: https://campusquestapp.com/legal/community-guidelines
- Support: https://campusquestapp.com/support
