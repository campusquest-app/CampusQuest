import { describe, expect, it } from "vitest";
import { buildLocalCharacterFromServer } from "@/lib/client/profileCharacter";

describe("buildLocalCharacterFromServer", () => {
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
});
