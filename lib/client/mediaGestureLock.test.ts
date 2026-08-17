import { afterEach, describe, expect, it } from "vitest";
import {
  isMediaGestureLocked,
  lockMediaGesture,
  resetMediaGestureLock,
  unlockMediaGesture,
} from "@/lib/client/mediaGestureLock";

describe("mediaGestureLock", () => {
  afterEach(() => {
    resetMediaGestureLock();
  });

  it("refcounts lock acquisitions", () => {
    expect(isMediaGestureLocked()).toBe(false);

    lockMediaGesture();
    expect(isMediaGestureLocked()).toBe(true);

    lockMediaGesture();
    unlockMediaGesture();
    expect(isMediaGestureLocked()).toBe(true);

    unlockMediaGesture();
    expect(isMediaGestureLocked()).toBe(false);
  });

  it("does not go negative on extra unlock", () => {
    unlockMediaGesture();
    unlockMediaGesture();
    expect(isMediaGestureLocked()).toBe(false);
    lockMediaGesture();
    expect(isMediaGestureLocked()).toBe(true);
    unlockMediaGesture();
    expect(isMediaGestureLocked()).toBe(false);
  });
});
