# Lint Cleanup Backlog

This backlog is derived from the current `npm run lint` output and grouped by rollout safety.

## 1) Quick Wins

Low-risk items first. These should not change product behavior.

| File Path | Warning Type | Why It Matters | Suggested Fix | Risk |
| --- | --- | --- | --- | --- |
| `components/CampusBossRaid.tsx` | `react-hooks/exhaustive-deps` (unnecessary deps) | Extra deps trigger noise and reduce confidence in hook dependency correctness. | Keep `useMemo` dependency array minimal (`[]`) since callback does not use props/state values. | low |
| `components/StreakCard.tsx` | `react-hooks/exhaustive-deps` (unnecessary deps) | Unnecessary deps make dependency intent unclear and increase lint churn. | Remove redundant scalar deps and keep only referenced objects/values. | low |
| `components/GuildBossBattle.tsx` | `react-hooks/exhaustive-deps` (complex/missing deps combo) | Stringified dependency expressions are brittle and hard to reason about. | Replace complex expression dependency with stable dependency (`guildIds`). | low |
| `components/FieldNoteComposer.tsx` | `react-hooks/exhaustive-deps` (missing dependency) | Missing deps can produce stale closures during user interactions. | Include full referenced collection (`ramMarks`) in callback deps. | low |
| `repo-wide` | unused imports | None currently reported, but common source of noisy lint failures over time. | Remove unused imports immediately when touched. | low |
| `repo-wide` | unused variables | None currently reported, but increases cognitive load and dead-path risk. | Remove or inline temporary variables after edits. | low |
| `repo-wide` | simple type cleanup | No blocking lint warning currently, but typed helpers drift quickly. | Normalize obvious `any`/union clutter only when directly touched by a warning fix. | low |
| `repo-wide` | dead code | No direct lint hit currently, but stale utility branches increase maintenance cost. | Delete unreachable branches only when clearly unused and covered by behavior parity. | low |

## 2) Medium Cleanup

Do after quick wins; these are useful but may have UI or behavior-adjacent impact.

| File Path | Warning Type | Why It Matters | Suggested Fix | Risk |
| --- | --- | --- | --- | --- |
| `components/ActivityList.tsx`, `components/AuthScreen.tsx`, `components/FieldNoteCard.tsx`, `components/FieldNoteComposer.tsx`, `components/SpecialQuests.tsx`, `components/WelcomeSplash.tsx`, `components/Dashboard.tsx` | `@next/next/no-img-element` | Repeated image usage bypasses automatic optimization and can hurt mobile perf/LCP. | Migrate `<img>` to `next/image` with explicit width/height or responsive fill wrappers. | medium |
| `components/Dashboard.tsx`, `components/FirstTimeJourney.tsx`, `components/GuildBossBattle.tsx` | `react-hooks/exhaustive-deps` (missing deps) | These warnings are in central flows; naive fixes can cause extra effects/renders. | Refactor effect/callback boundaries first, then add deps intentionally. | medium |
| `components` (multiple dashboard-like cards) | repeated UI logic (pattern from warning clusters) | Similar loading/error/empty-state rendering repeated across cards slows bugfixes. | Extract a small shared `CardState` pattern component for loading/error/empty body. | medium |
| `app/api/*` admin/social routes | duplicated API error handling pattern | Similar try/catch + zod handling repeated across many routes. | Add a small route helper wrapper for Zod + ApiError response normalization. | medium |
| `components/OrganizationsHub.tsx` + `components/OrganizationAdminPortal.tsx` | confusing prop/type surface growth | Portal and hub props are expanding quickly with role/status variants. | Split view model mapping from rendering props and consolidate shared org types. | medium |

## 3) Deeper Refactors

Defer until feature freeze or dedicated cleanup sprint.

| File Path | Warning Type | Why It Matters | Suggested Fix | Risk |
| --- | --- | --- | --- | --- |
| `components/Dashboard.tsx` | large component / hook-density (multiple warnings concentrated) | High surface area increases regression risk; difficult to reason about lifecycle interactions. | Break into feature-specific containers (auth gating, tab orchestration, overlays, notifications poller). | high |
| `lib/server/eventsOrganizations.ts`, `lib/server/organizationManagement.ts`, moderation routes | repeated server permission checks | Permission logic duplication risks policy drift over time. | Introduce shared authorization helper layer for org/event/admin role checks with test coverage. | high |
| `components/InternalAdminDashboard.tsx` + admin cards | shared dashboard card patterns | Inconsistent state handling can produce fragmented admin UX and harder bug triage. | Build a common admin card shell with standard refresh/session/error/notice handling. | medium |
| `components/*` + `lib/client/dashboardApi.ts` call sites | repeated fetch/loading/error patterns | Inconsistent fetch lifecycles increase UI bugs and stale state handling complexity. | Introduce shared client data hooks for authed fetch, loading/error, and retry semantics. | high |

## Applied in this pass (LOW-RISK ONLY)

- Updated `components/CampusBossRaid.tsx`
- Updated `components/StreakCard.tsx`
- Updated `components/GuildBossBattle.tsx`
- Updated `components/FieldNoteComposer.tsx`

No auth, RLS, moderation permission, or school verification logic was modified.
