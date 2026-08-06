import { afterEach, describe, expect, it } from "vitest";
import {
  getQuadFeedUnmuted,
  setQuadFeedUnmuted,
  subscribeQuadFeedMute,
} from "@/lib/client/quadFeedMuteStore";

describe("quadFeedMuteStore", () => {
  afterEach(() => {
    setQuadFeedUnmuted(false);
  });

  it("starts muted for a fresh session", () => {
    expect(getQuadFeedUnmuted()).toBe(false);
  });

  it("shares unmute preference across subscribers without resetting playback state", () => {
    let notified = 0;
    const unsub = subscribeQuadFeedMute(() => {
      notified += 1;
    });
    setQuadFeedUnmuted(true);
    expect(getQuadFeedUnmuted()).toBe(true);
    expect(notified).toBe(1);
    setQuadFeedUnmuted(true);
    expect(notified).toBe(1);
    setQuadFeedUnmuted(false);
    expect(getQuadFeedUnmuted()).toBe(false);
    expect(notified).toBe(2);
    unsub();
  });
});
