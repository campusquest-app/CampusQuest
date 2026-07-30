# Store reviewer test account

Use this account for **App Store Connect**, **Google Play**, and **Samsung Galaxy Store** app review.
Do **not** publish these credentials in public marketing pages.

## Credentials

| Field | Value |
|--------|--------|
| Email | Set in production secrets as `QA_TEST_ACCOUNT_EMAIL` (default seed: `qa-signup@campusquest.app`) |
| Password | Set in production secrets as `QA_TEST_ACCOUNT_PASSWORD` |

Provision / reset via:

```bash
node scripts/ensure-qa-account.mjs
```

Or Admin → QA Account Reset (`/api/internal/admin/qa-account/reset`) when signed in as a platform admin.

## Reviewer notes

1. This account bypasses campus-email gate restrictions used for student verification during limited campus rollout.
2. Role is `qa` / test — it can exercise social features without appearing on public student leaderboards.
3. After login, reviewers can open **The Quad**, **Inbox**, **Profile**, **Settings**, and **Realm**.
4. To verify safety tools: open another profile → Report / Block; open a post → Report; Settings → Blocked users; Settings → Delete account (do **not** delete the shared reviewer account—use a disposable account if testing deletion).

## Public URLs for store listings

| Asset | URL |
|--------|-----|
| Privacy Policy | `https://campusquest.app/legal/privacy` |
| Terms of Service | `https://campusquest.app/legal/terms` |
| Community Guidelines | `https://campusquest.app/legal/community-guidelines` |
| Support | `https://campusquest.app/support` |

## Production checklist (pre-submit)

- [ ] App is **not** labeled Beta / Pilot / Test build in consumer UI
- [ ] Account deletion works in Settings
- [ ] Report + Block available on profiles; Report on posts, comments, messages, events
- [ ] Infringement contact documented on `/support`
- [ ] Reviewer credentials filled in the store console
- [ ] Native permission strings present for camera, location, photos, microphone, notifications (when shipping native wrappers)
