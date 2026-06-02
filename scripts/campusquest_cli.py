from __future__ import annotations

import json
import os
from dataclasses import dataclass, asdict
from datetime import datetime, date, timedelta
from typing import Dict, List, Optional


# Data file at project root (works when run as python scripts/campusquest_cli.py)
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(os.path.dirname(_SCRIPT_DIR), "campusquest_data.json")

# -----------------------------
# Config
# -----------------------------
BASE_XP = {
    "gym": 80,
    "study": 20,
    "focus": 15,
    "social": 10,
}

# XP needed to go from level -> next level
LEVEL_THRESHOLDS = {
    1: 100,
    2: 200,
    3: 350,
    4: 550,
    5: 800,
    6: 1100,
}

DAILY_MINIMUM_XP_FOR_STREAK = 20
STREAK_MULTIPLIER_CAP = 2.0


# -----------------------------
# Helpers
# -----------------------------
def today_str() -> str:
    return date.today().isoformat()


def parse_date(s: str) -> date:
    return datetime.strptime(s, "%Y-%m-%d").date()


def streak_multiplier(streak_days: int) -> float:
    mult = 1.0 + (streak_days * 0.05)  # +5% per day
    return min(mult, STREAK_MULTIPLIER_CAP)


def input_int(prompt: str, default: Optional[int] = None, min_value: Optional[int] = None) -> int:
    while True:
        raw = input(prompt).strip()
        if raw == "" and default is not None:
            val = default
        else:
            try:
                val = int(raw)
            except ValueError:
                print("Please enter a number.")
                continue
        if min_value is not None and val < min_value:
            print(f"Please enter a number >= {min_value}.")
            continue
        return val


def input_choice(prompt: str, choices: List[str]) -> str:
    choices_lower = [c.lower() for c in choices]
    while True:
        raw = input(prompt).strip().lower()
        if raw in choices_lower:
            return raw
        print(f"Choose one of: {', '.join(choices)}")


# -----------------------------
# Data Models
# -----------------------------
@dataclass
class Activity:
    activity_type: str  # gym | study | focus | social
    minutes: int
    proof: str
    tags: List[str]
    timestamp_iso: str
    earned_xp: int

    @property
    def day(self) -> str:
        return self.timestamp_iso[:10]  # YYYY-MM-DD


@dataclass
class BossBattle:
    name: str
    hp: int
    active: bool = True


@dataclass
class User:
    user_id: str
    name: str
    stats: Dict[str, int]
    xp: int
    level: int
    streak_days: int
    last_active_day: Optional[str]  # YYYY-MM-DD
    activities: List[Activity]
    achievements: List[str]
    current_boss: Optional[BossBattle] = None

    def ensure_stats(self) -> None:
        for k in ["strength", "knowledge", "focus", "social"]:
            self.stats.setdefault(k, 0)


# -----------------------------
# Core Logic
# -----------------------------
def verify_proof(proof: str) -> bool:
    """
    Placeholder verification: proof must not be empty.
    In a real app, this could be photo checks, screenshots, etc.
    """
    return bool(proof.strip())


def calculate_xp(user: User, activity_type: str, minutes: int) -> int:
    base = BASE_XP.get(activity_type, 0)

    # Scale study/focus by time
    if activity_type in ["study", "focus"]:
        base += (minutes // 10) * 5  # +5 XP per 10 minutes

    # Apply streak multiplier
    base = int(base * streak_multiplier(user.streak_days))
    return max(base, 0)


def apply_stat_increase(user: User, activity_type: str, minutes: int) -> None:
    user.ensure_stats()

    if activity_type == "gym":
        user.stats["strength"] += 2

    elif activity_type == "study":
        user.stats["knowledge"] += max(1, minutes // 20)

    elif activity_type == "focus":
        user.stats["focus"] += max(1, minutes // 25)

    elif activity_type == "social":
        user.stats["social"] += 1


def check_level_up(user: User) -> None:
    while user.level in LEVEL_THRESHOLDS and user.xp >= LEVEL_THRESHOLDS[user.level]:
        user.xp -= LEVEL_THRESHOLDS[user.level]
        user.level += 1
        add_achievement(user, f"Reached Level {user.level}")


def add_achievement(user: User, achievement: str) -> None:
    if achievement not in user.achievements:
        user.achievements.append(achievement)


def xp_earned_on_day(user: User, day_iso: str) -> int:
    return sum(a.earned_xp for a in user.activities if a.day == day_iso)


def update_streak_end_of_day(user: User, day_iso: str) -> None:
    earned_today = xp_earned_on_day(user, day_iso)
    if earned_today >= DAILY_MINIMUM_XP_FOR_STREAK:
        if user.last_active_day is None:
            user.streak_days = 1
        else:
            last = parse_date(user.last_active_day)
            current = parse_date(day_iso)
            if current == last + timedelta(days=1):
                user.streak_days += 1
            elif current == last:
                # already counted today (don't increase)
                pass
            else:
                user.streak_days = 1

        user.last_active_day = day_iso

        if user.streak_days == 7:
            add_achievement(user, "7-Day Streak")
        if user.streak_days == 30:
            add_achievement(user, "30-Day Streak")
    else:
        # If the user didn't meet minimum, streak breaks
        # Only break if day is after last_active_day (avoid breaking same-day)
        if user.last_active_day is not None:
            last = parse_date(user.last_active_day)
            current = parse_date(day_iso)
            if current > last:
                user.streak_days = 0


def start_boss_battle(user: User, name: str, hp: int = 250) -> None:
    user.current_boss = BossBattle(name=name, hp=hp, active=True)


def apply_boss_damage_from_study(user: User, study_minutes: int) -> Optional[str]:
    boss = user.current_boss
    if boss is None or not boss.active:
        return None

    user.ensure_stats()
    damage = (user.stats["knowledge"] * 2) + (user.stats["focus"] * 2) + (study_minutes // 10) * 5
    damage = max(1, damage)

    boss.hp -= damage
    if boss.hp <= 0:
        boss.hp = 0
        boss.active = False
        user.xp += 100
        add_achievement(user, f"Defeated {boss.name} Boss (+100 XP)")
        check_level_up(user)
        return f"⚔️ Boss defeated! You dealt {damage} damage. (+100 XP bonus)"
    return f"⚔️ You dealt {damage} damage. Boss HP remaining: {boss.hp}"


def log_activity(user: User, activity_type: str, minutes: int, proof: str, tags: List[str]) -> str:
    if activity_type not in BASE_XP:
        return "Unknown activity type."

    if not verify_proof(proof):
        return "Rejected: proof is empty."

    apply_stat_increase(user, activity_type, minutes)
    earned = calculate_xp(user, activity_type, minutes)
    user.xp += earned

    ts = datetime.now().isoformat(timespec="seconds")
    user.activities.append(
        Activity(
            activity_type=activity_type,
            minutes=minutes,
            proof=proof,
            tags=tags,
            timestamp_iso=ts,
            earned_xp=earned,
        )
    )

    if len(user.activities) == 1:
        add_achievement(user, "First Quest Completed")

    check_level_up(user)
    update_streak_end_of_day(user, ts[:10])

    boss_msg = None
    if activity_type == "study":
        boss_msg = apply_boss_damage_from_study(user, minutes)

    base_msg = f"✅ Logged {activity_type} (+{earned} XP)."
    if boss_msg:
        return base_msg + "\n" + boss_msg
    return base_msg


# -----------------------------
# Persistence
# -----------------------------
def load_data() -> Dict[str, User]:
    if not os.path.exists(DATA_FILE):
        return {}

    with open(DATA_FILE, "r", encoding="utf-8") as f:
        raw = json.load(f)

    users: Dict[str, User] = {}
    for user_id, u in raw.get("users", {}).items():
        activities = [Activity(**a) for a in u.get("activities", [])]
        boss_raw = u.get("current_boss")
        boss = BossBattle(**boss_raw) if boss_raw else None

        users[user_id] = User(
            user_id=user_id,
            name=u["name"],
            stats=u.get("stats", {}),
            xp=u.get("xp", 0),
            level=u.get("level", 1),
            streak_days=u.get("streak_days", 0),
            last_active_day=u.get("last_active_day"),
            activities=activities,
            achievements=u.get("achievements", []),
            current_boss=boss,
        )
        users[user_id].ensure_stats()

    return users


def save_data(users: Dict[str, User]) -> None:
    payload = {"users": {}}

    for user_id, user in users.items():
        payload["users"][user_id] = {
            "name": user.name,
            "stats": user.stats,
            "xp": user.xp,
            "level": user.level,
            "streak_days": user.streak_days,
            "last_active_day": user.last_active_day,
            "activities": [asdict(a) for a in user.activities],
            "achievements": user.achievements,
            "current_boss": asdict(user.current_boss) if user.current_boss else None,
        }

    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


# -----------------------------
# Display / UI
# -----------------------------
def print_user_summary(user: User) -> None:
    user.ensure_stats()
    print("\n==============================")
    print(f"👤 {user.name} (ID: {user.user_id})")
    print(f"⭐ Level: {user.level} | XP: {user.xp} | Streak: {user.streak_days} days")
    print("📊 Stats:")
    print(f"  Strength:  {user.stats['strength']}")
    print(f"  Knowledge:  {user.stats['knowledge']}")
    print(f"  Focus:      {user.stats['focus']}")
    print(f"  Social:     {user.stats['social']}")
    if user.current_boss and user.current_boss.active:
        print(f"🧟 Boss Battle: {user.current_boss.name} | HP: {user.current_boss.hp}")
    print("==============================\n")


def show_leaderboards(users: Dict[str, User]) -> None:
    if not users:
        print("No users yet.")
        return

    def top_by(key: str):
        return sorted(users.values(), key=lambda u: u.stats.get(key, 0), reverse=True)

    print("\n🏆 Leaderboards")
    print("------------------------------")
    for key in ["knowledge", "strength", "focus", "social"]:
        ranked = top_by(key)[:5]
        print(f"\nTop {key.capitalize()}:")
        for i, u in enumerate(ranked, start=1):
            print(f"  {i}. {u.name} — {u.stats.get(key,0)}")
    print("\nTop Level:")
    ranked_lvl = sorted(users.values(), key=lambda u: (u.level, u.xp), reverse=True)[:5]
    for i, u in enumerate(ranked_lvl, start=1):
        print(f"  {i}. {u.name} — Level {u.level} (XP {u.xp})")
    print()


def show_recent_activities(user: User, n: int = 10) -> None:
    if not user.activities:
        print("No activities logged yet.")
        return
    print(f"\n📝 Recent Activities (last {n})")
    print("------------------------------")
    for a in user.activities[-n:][::-1]:
        tags = f" tags={a.tags}" if a.tags else ""
        print(f"{a.timestamp_iso} | {a.activity_type} | {a.minutes} min | +{a.earned_xp} XP{tags}")
    print()


def show_achievements(user: User) -> None:
    if not user.achievements:
        print("No achievements yet.")
        return
    print("\n🏅 Achievements")
    print("------------------------------")
    for ach in user.achievements:
        print(f"• {ach}")
    print()


# -----------------------------
# CLI App
# -----------------------------
def create_user(users: Dict[str, User]) -> User:
    user_id = input("Enter a unique user ID (ex: aisha01): ").strip()
    while not user_id or user_id in users:
        print("That ID is invalid or already taken.")
        user_id = input("Enter a unique user ID: ").strip()

    name = input("Enter name: ").strip() or user_id

    user = User(
        user_id=user_id,
        name=name,
        stats={"strength": 0, "knowledge": 0, "focus": 0, "social": 0},
        xp=0,
        level=1,
        streak_days=0,
        last_active_day=None,
        activities=[],
        achievements=[],
        current_boss=None,
    )
    users[user_id] = user
    save_data(users)
    print("✅ User created.")
    return user


def choose_user(users: Dict[str, User]) -> Optional[User]:
    if not users:
        print("No users yet. Create one first.")
        return None

    print("\nUsers:")
    for uid, u in users.items():
        print(f"• {uid}: {u.name}")

    uid = input("Enter user ID: ").strip()
    if uid not in users:
        print("User not found.")
        return None
    return users[uid]


def log_activity_flow(users: Dict[str, User], user: User) -> None:
    print("\nActivity types: gym, study, focus, social")
    a_type = input_choice("Choose activity type: ", ["gym", "study", "focus", "social"])

    minutes = 0
    if a_type in ["study", "focus"]:
        minutes = input_int("Minutes (ex: 50): ", min_value=0)
    else:
        # gym/social can be 0 minutes and still count
        minutes = input_int("Minutes (optional, 0 ok): ", default=0, min_value=0)

    proof = input("Proof (type anything like 'photo', 'screenshot', 'notes'): ").strip()
    tags_raw = input("Tags (comma-separated, optional): ").strip()
    tags = [t.strip() for t in tags_raw.split(",") if t.strip()] if tags_raw else []

    msg = log_activity(user, a_type, minutes, proof, tags)
    print(msg)

    save_data(users)


def boss_battle_flow(users: Dict[str, User], user: User) -> None:
    name = input("Boss name (ex: 'MTH215 Midterm'): ").strip() or "Midterm Boss"
    hp = input_int("Boss HP (ex: 250): ", default=250, min_value=1)
    start_boss_battle(user, name, hp)
    save_data(users)
    print(f"🧟 Boss battle started: {name} (HP: {hp})")


def main():
    users = load_data()
    active_user: Optional[User] = None

    while True:
        print("\n=== CampusQuest (CLI) ===")
        print("1) Create user")
        print("2) Select user")
        print("3) Show active user summary")
        print("4) Log activity")
        print("5) Start boss battle")
        print("6) Show leaderboards")
        print("7) Show recent activities")
        print("8) Show achievements")
        print("9) Save & exit")

        choice = input_choice("Choose an option (1-9): ", [str(i) for i in range(1, 10)])

        if choice == "1":
            active_user = create_user(users)

        elif choice == "2":
            picked = choose_user(users)
            if picked:
                active_user = picked
                print(f"✅ Active user set to {active_user.name}")

        elif choice == "3":
            if not active_user:
                print("Select a user first.")
            else:
                print_user_summary(active_user)

        elif choice == "4":
            if not active_user:
                print("Select a user first.")
            else:
                log_activity_flow(users, active_user)

        elif choice == "5":
            if not active_user:
                print("Select a user first.")
            else:
                boss_battle_flow(users, active_user)

        elif choice == "6":
            show_leaderboards(users)

        elif choice == "7":
            if not active_user:
                print("Select a user first.")
            else:
                show_recent_activities(active_user, n=10)

        elif choice == "8":
            if not active_user:
                print("Select a user first.")
            else:
                show_achievements(active_user)

        elif choice == "9":
            save_data(users)
            print("💾 Saved. Bye!")
            break


if __name__ == "__main__":
    main()
