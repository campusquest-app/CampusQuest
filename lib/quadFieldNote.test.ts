import { describe, expect, it } from "vitest";
import { quadPostRowToFieldNote, type QuadPostApiRow } from "./quadFieldNote";

const baseRow: QuadPostApiRow = {
  id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  user_id: "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
  body: "Hello Quad",
  proof_url: null,
  visibility: "public",
  ram_marks: [],
  nod_count: 2,
  hype_count: 1,
  verify_count: 0,
  assist_count: 0,
  created_at: "2026-06-18T12:00:00.000Z",
  profiles: {
    display_name: "Jordan",
    username: "jordan_kim",
    avatar_custom_json: null,
  },
};

describe("quadPostRowToFieldNote", () => {
  it("maps comments_count from API rows", () => {
    const note = quadPostRowToFieldNote({ ...baseRow, comments_count: 5 });
    expect(note.commentCount).toBe(5);
    expect(note.isPersisted).toBe(true);
  });

  it("defaults commentCount to 0 when missing", () => {
    const note = quadPostRowToFieldNote(baseRow);
    expect(note.commentCount).toBe(0);
  });
});
