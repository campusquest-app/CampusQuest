import { describe, expect, it } from "vitest";
import {
  rankUserSearchCandidates,
  userSearchMatchScore,
} from "@/lib/server/userSearchRanking";

describe("userSearchMatchScore", () => {
  it("prioritizes username prefix over display name contains", () => {
    expect(userSearchMatchScore("ni", "nick", "Someone")).toBe(100);
    expect(userSearchMatchScore("ni", "other", "Nick")).toBe(90);
    expect(userSearchMatchScore("ni", "other", "Denise")).toBe(60);
  });
});

describe("rankUserSearchCandidates", () => {
  it("ranks connected users before other matches", () => {
    const ranked = rankUserSearchCandidates(
      "a",
      [
        { userId: "other", username: "alex", displayName: "Alex" },
        { userId: "friend", username: "ari", displayName: "Ari" },
      ],
      new Set(["friend"]),
      10,
    );

    expect(ranked.map((row) => row.userId)).toEqual(["friend", "other"]);
  });
});
