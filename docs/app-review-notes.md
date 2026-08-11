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
- Please **do not** delete this shared demo account. To test Delete Account, create a disposable signup.

## What to test

1. Sign in with the demo account above.
2. Complete or skip through onboarding screens until the main app (The Quad / Inbox / Realm).
3. **Inbox:** open Messages; send a DM if a second test account is available.
4. **Push (if TestFlight build has APNs configured):** Settings → Push notifications → enable; then have another user message this account.
5. **The Realm:** allow location when prompted (when-in-use). Map should load campus content. Denying location should still leave the map usable.
6. **Camera / QR:** open Scanner / QR flow and grant camera if prompted.
7. **Photos:** create a Quad post and choose a library photo or capture media.
8. **UGC safety:** open another profile or post → Report; also try Block. Do not remove the demo account.
9. **Legal:** Settings / first-run consent links open Privacy, Terms, and Community Guidelines.
10. **Account deletion:** optional on a throwaway account only — Settings → Delete account → type DELETE.

## Location / campus context

- Product is oriented around University of Rhode Island campus discovery.
- Demo account bypasses `@uri.edu` email gating for App Review.
- Exact GPS is not required to browse feeds; location is used for map/nearby features when permitted.
- CampusQuest is **not** an official University of Rhode Island application. Event/org data may include public URInvolved-sourced listings with attribution in-app.

## Contact

`support@campusquest.app`

## Public policy URLs

- Privacy: https://campusquestapp.com/legal/privacy (also listed as campusquest.app in marketing docs)
- Terms: https://campusquestapp.com/legal/terms
- Community Guidelines: https://campusquestapp.com/legal/community-guidelines
- Support: https://campusquestapp.com/support
