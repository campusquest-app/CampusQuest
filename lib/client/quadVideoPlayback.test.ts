import { describe, expect, it, vi } from "vitest";
import { setVideoElementMuted, shouldShowVideoMuteControl, unmuteVideoElement } from "@/lib/client/quadVideoPlayback";

function fakeMedia() {
  const el = {
    muted: true,
    defaultMuted: true,
    paused: true,
    currentTime: 4.2,
    volume: 0,
    removeAttribute: vi.fn(),
    play: vi.fn(async () => {
      el.paused = false;
    }),
  };
  return el;
}

describe("quad video playback mute", () => {
  it("unmutes in place and keeps the playhead", async () => {
    const el = fakeMedia();
    await expect(unmuteVideoElement(el as unknown as HTMLMediaElement)).resolves.toBe(true);
    expect(el.muted).toBe(false);
    expect(el.volume).toBe(1);
    expect(el.removeAttribute).toHaveBeenCalledWith("muted");
    expect(el.currentTime).toBe(4.2);
    expect(el.play).toHaveBeenCalledOnce();
  });

  it("stays muted when the browser rejects audible playback", async () => {
    const el = fakeMedia();
    el.play = vi.fn(async () => {
      throw new Error("NotAllowedError");
    });
    await expect(unmuteVideoElement(el as unknown as HTMLMediaElement)).resolves.toBe(false);
    expect(el.muted).toBe(true);
  });

  it("stays muted when the element ignores the unmuted flag", async () => {
    const el = fakeMedia();
    el.play = vi.fn(async () => {
      el.paused = false;
      el.muted = true;
    });
    await expect(unmuteVideoElement(el as unknown as HTMLMediaElement)).resolves.toBe(false);
    expect(el.muted).toBe(true);
  });

  it("mutes immediately without a play call", () => {
    const el = fakeMedia();
    el.muted = false;
    el.paused = false;
    setVideoElementMuted(el as unknown as HTMLMediaElement, true);
    expect(el.muted).toBe(true);
    expect(el.play).not.toHaveBeenCalled();
  });

  it("hides the speaker control only for a confirmed silent container", () => {
    expect(shouldShowVideoMuteControl(null)).toBe(true);
    expect(shouldShowVideoMuteControl(true)).toBe(true);
    expect(shouldShowVideoMuteControl(false)).toBe(false);
  });
});
