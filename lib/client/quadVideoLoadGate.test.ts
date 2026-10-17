import { describe, expect, it } from "vitest";
import {
  acquireVideoLoadSlot,
  releaseVideoLoadSlot,
  resetVideoLoadGateForTests,
  videoLoadGateSnapshotForTests,
  QUAD_FEED_MAX_CONCURRENT_VIDEO_LOADS,
} from "@/lib/client/quadVideoLoadGate";

describe("quad video load gate", () => {
  it("allows only one concurrent video attachment by default", async () => {
    resetVideoLoadGateForTests();
    expect(QUAD_FEED_MAX_CONCURRENT_VIDEO_LOADS).toBe(1);

    await expect(acquireVideoLoadSlot("a")).resolves.toBe(true);
    expect(videoLoadGateSnapshotForTests().active).toBe(1);

    let secondGranted = false;
    const pending = acquireVideoLoadSlot("b").then((ok) => {
      secondGranted = ok;
      return ok;
    });
    expect(secondGranted).toBe(false);
    expect(videoLoadGateSnapshotForTests().waiting).toBe(1);

    releaseVideoLoadSlot("a");
    await expect(pending).resolves.toBe(true);
    expect(secondGranted).toBe(true);
    expect(videoLoadGateSnapshotForTests().holders).toEqual(["b"]);

    releaseVideoLoadSlot("b");
    expect(videoLoadGateSnapshotForTests().active).toBe(0);
  });

  it("cancels waiters on abort", async () => {
    resetVideoLoadGateForTests();
    await acquireVideoLoadSlot("a");
    const ac = new AbortController();
    const pending = acquireVideoLoadSlot("b", ac.signal);
    ac.abort();
    await expect(pending).resolves.toBe(false);
    releaseVideoLoadSlot("a");
    expect(videoLoadGateSnapshotForTests().waiting).toBe(0);
  });
});
