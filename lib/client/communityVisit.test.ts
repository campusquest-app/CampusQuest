import { afterEach, describe, expect, it, vi } from "vitest";
import { beginCommunityVisit, scheduleEndCommunityVisit } from "@/lib/client/communityVisit";

describe("Community visit lifetime", () => {
  afterEach(() => {
    scheduleEndCommunityVisit(0);
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it("reuses the visit across a quick remount and starts a new one after the screen is gone", () => {
    vi.useFakeTimers();
    let n = 0;
    const createId = () => `visit-${++n}`;
    const first = beginCommunityVisit(createId);
    scheduleEndCommunityVisit(0);
    expect(beginCommunityVisit(createId)).toBe(first);
    scheduleEndCommunityVisit(0);
    vi.runAllTimers();
    expect(beginCommunityVisit(createId)).toBe("visit-2");
  });
});
