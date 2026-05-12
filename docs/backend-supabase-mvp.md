# CampusQuest Supabase Backend (MVP)

## Included

- Full Supabase SQL migration with:
  - `profiles`, `user_stats`, `activities`, `xp_logs`
  - `quests`, `user_quests`, `quest_completions`, `proof_submissions`
  - `guilds`, `guild_members`, `guild_xp_logs`
  - `posts`, `comments`, `likes`
  - `bosses`, `boss_attempts`
  - `items`, `user_inventory`
  - `notifications`
- Row-level security policies for all tables.
- Storage bucket + object policies for proof images.
- Seed migration for default activities, quests, bosses, and items.
- Next.js App Router API routes using Supabase Auth bearer tokens.
- Shared TypeScript service helpers for XP, leveling, streaks, bosses, loot, inventory.
- API-level rate limiting and gameplay anti-cheat guardrails.
- Lightweight Vitest coverage for core gameplay/security helpers.

## Setup

1. Copy `.env.example` to `.env.local`.
2. Fill in your Supabase project values.
3. Run your migration in Supabase:
   - Supabase CLI: `supabase db push`
   - Or paste SQL from `supabase/migrations/20260511195900_campusquest_mvp.sql`
4. Run seed migration:
   - `supabase db push` will include `supabase/migrations/20260511201000_seed_mvp_catalogs.sql`
   - Or run seed SQL manually.
5. Ensure the storage bucket `proof-images` exists (migration creates it if missing).

## API Endpoints

- `POST /api/profile` - create user profile
- `PATCH /api/profile` - update profile
- `POST /api/activities/log` - log activity + stat gain + streak + XP
- `POST /api/xp/add` - add XP directly (admin/game systems)
- `POST /api/game/progression` - calculate level progression from total XP
- `POST /api/streaks/update` - calculate next streak state
- `POST /api/quests/complete` - complete and claim quest rewards
- `POST /api/proof/upload` - create signed proof image upload URL + submission row
- `POST /api/guilds/join` - join guild
- `POST /api/posts` - create post
- `POST /api/posts/:postId/comments` - add comment
- `POST /api/posts/:postId/likes` - like/unlike post
- `POST /api/bosses/start` - check boss eligibility and current HP state
- `POST /api/bosses/attempt` - compute damage, attempt attack, defeat handling, XP, loot
- `POST /api/inventory/add` - add item to inventory
- `GET /api/leaderboards` - player, guild, and achievement feed leaderboards

## Auth Contract

- All endpoints expect `Authorization: Bearer <supabase_access_token>`.
- RLS is enforced through user-scoped Supabase clients.
- Service-role client is only used server-side for safe privileged operations (counters, signed upload URL creation).

## Security Defaults

- Rate limit is applied per authenticated user and route.
- XP source grants have hard caps by source type.
- Activity logs include anti-flood checks to reduce spammed XP events.

## Tests

- Run `npm test` to execute Vitest tests.

