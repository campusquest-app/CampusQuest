import { describe, expect, it } from "vitest";
import { extractQrXpAwarded } from "@/lib/client/extractQrXpAwarded";

describe("extractQrXpAwarded", () => {
  it("reads camelCase and snake_case fields", () => {
    expect(extractQrXpAwarded({ xpAwarded: 25 })).toBe(25);
    expect(extractQrXpAwarded({ xp_awarded: 30 })).toBe(30);
    expect(extractQrXpAwarded({ scan: { xpAwarded: 15 } })).toBe(15);
    expect(extractQrXpAwarded({ reward_xp: 10 })).toBe(10);
  });

  it("returns 0 for invalid payloads", () => {
    expect(extractQrXpAwarded(null)).toBe(0);
    expect(extractQrXpAwarded({ xpAwarded: "nope" })).toBe(0);
  });
});
