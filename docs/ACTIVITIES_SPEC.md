# CampusQuest — Types of Activities & Rules

Reference for the four core activity types and game logic (aligned with the Python-style spec).

## Activity types

| Type   | Base XP | Stat gain              | Minutes scaling      |
|--------|---------|------------------------|----------------------|
| **gym**   | 80  | Strength +2            | —                    |
| **study** | 20  | Knowledge +max(1, min/20) | +5 XP per 10 min |
| **focus** | 15  | Focus +max(1, min/25)  | +5 XP per 10 min     |
| **social**| 10  | Social +1              | —                    |

## Proof verification

- Every logged activity **must have non-empty proof** (photo, screenshot, notes, or link).
- `verify_proof(activity)` rejects if proof is null or empty.

## Config

- **LEVEL_THRESHOLDS** (XP to reach next level): 1→2: 100, 2→3: 250, 3→4: 450, 4→5: 700; then +700 per level.
- **DAILY_MINIMUM_XP**: 20 (to count day as active for streak).
- **STREAK_MULTIPLIER_CAP**: 2.0. Multiplier = 1.0 + (streak_days × 0.05).

## Boss battles

- Start with exam name + HP (default 250). Study sessions deal damage.
- Damage = (Knowledge × 2) + (Focus × 2) + (study_minutes ÷ 10) × 5.
- On defeat: +100 XP, achievement "Defeated {exam_name} Boss", level-up check.

## Achievements (examples)

- First Quest Completed (after first activity).
- 7-Day Streak, 30-Day Streak.
- Reached Level N.
- Defeated {name} Boss.
