import { describe, expect, it } from "vitest";
import { buildLocalCharacterFromServer } from "@/lib/client/profileCharacter";

describe("buildLocalCharacterFromServer", () => {
  it("restores bio, equipment, and boss counts from profile + stats + game_state_json", () => {
    const uuid = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";
    const c = buildLocalCharacterFromServer(
      {
        id: uuid,
        username: "sam_rpg",
        display_name: "Sam",
        bio: "Hello campus",
        streak_days: 5,
        last_activity_date: "2026-05-10",
        avatar_custom_json: '{"v":2}',
        character_class_id: "rogue",
        starter_weapon: "guitar",
        scholar_guild_id: "arts",
        game_state_json: {
          equippedCosmetics: { hat: "h1", glasses: "g1", backpack: "b1" },
          unlockedCosmetics: ["h1", "g1", "b1", "x2"],
          finalBossesDefeatedCount: 2,
        },
      },
      {
        user_id: uuid,
        level: 7,
        total_xp: 900,
        strength: 10,
        stamina: 11,
        knowledge: 12,
        social: 13,
        focus: 14,
        bosses_defeated: 3,
      },
    );

    expect(c.bio).toBe("Hello campus");
    expect(c.equippedCosmetics).toEqual({ hat: "h1", glasses: "g1", backpack: "b1" });
    expect(c.unlockedCosmetics).toEqual(["h1", "g1", "b1", "x2"]);
    expect(c.finalBossesDefeatedCount).toBe(2);
    expect(c.bossesDefeatedCount).toBe(3);
    expect(c.totalXP).toBe(900);
    expect(c.classId).toBe("rogue");
  });

  it("uses Supabase id and avatar_custom_json when present", () => {
    const uuid = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    const c = buildLocalCharacterFromServer(
      {
        id: uuid,
        username: "alex_test",
        display_name: "Alex",
        streak_days: 2,
        last_activity_date: "2026-05-01",
        avatar_custom_json: '{"v":1}',
        character_class_id: "knight",
        starter_weapon: "textbook",
        scholar_guild_id: "engineering",
      },
      {
        user_id: uuid,
        level: 3,
        total_xp: 400,
        strength: 1,
        stamina: 2,
        knowledge: 3,
        social: 4,
        focus: 5,
      },
    );
    expect(c.id).toBe(uuid);
    expect(c.avatar).toBe('{"v":1}');
    expect(c.username).toBe("alex_test");
    expect(c.scholarGuildId).toBe("engineering");
  });

  it("prefers max of stats.final_bosses_defeated and game_state_json counter", () => {
    const uuid = "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33";
    const c = buildLocalCharacterFromServer(
      {
        id: uuid,
        username: "boss_killer",
        display_name: "Boss Killer",
        streak_days: 0,
        last_activity_date: null,
        game_state_json: { finalBossesDefeatedCount: 1 },
      },
      {
        user_id: uuid,
        level: 10,
        total_xp: 5000,
        strength: 1,
        stamina: 1,
        knowledge: 1,
        social: 1,
        focus: 1,
        final_bosses_defeated: 4,
      },
    );
    expect(c.finalBossesDefeatedCount).toBe(4);
  });
});
