import { describe, expect, it } from "vitest";
import { canUseSameOriginHistoryBack } from "@/lib/client/sameOriginHistoryBack";

const ORIGIN = "https://campusquestapp.com";

describe("canUseSameOriginHistoryBack", () => {
  it("uses history after an in-app Contact tap (Next.js history idx)", () => {
    expect(
      canUseSameOriginHistoryBack({
        historyLength: 2,
        referrer: "",
        currentOrigin: ORIGIN,
        historyIdx: 1,
      }),
    ).toBe(true);
  });

  it("uses history when the referrer is the CampusQuest origin", () => {
    expect(
      canUseSameOriginHistoryBack({
        historyLength: 3,
        referrer: `${ORIGIN}/`,
        currentOrigin: ORIGIN,
      }),
    ).toBe(true);
  });

  it("falls back on a direct Support URL visit", () => {
    expect(
      canUseSameOriginHistoryBack({
        historyLength: 1,
        referrer: "",
        currentOrigin: ORIGIN,
        historyIdx: 0,
      }),
    ).toBe(false);
    expect(
      canUseSameOriginHistoryBack({
        historyLength: 2,
        referrer: "",
        currentOrigin: ORIGIN,
        historyIdx: null,
      }),
    ).toBe(false);
  });

  it("does not go back to an external site", () => {
    expect(
      canUseSameOriginHistoryBack({
        historyLength: 4,
        referrer: "https://www.google.com/search?q=campusquest+support",
        currentOrigin: ORIGIN,
        historyIdx: 2,
      }),
    ).toBe(false);
  });
});
