import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  VIDEO_POSTER_TIMEOUT_MS,
  VIDEO_PROBE_TIMEOUT_MS,
  VideoMediaTimeoutError,
  captureVideoPoster,
  probeVideoFile,
} from "@/lib/client/probeVideoFile";

/** A <video> that never fires events — how iOS Safari treats an off-DOM, non-playing element. */
function silentVideo() {
  return {
    preload: "",
    muted: false,
    playsInline: false,
    src: "",
    onloadedmetadata: null as unknown,
    onloadeddata: null as unknown,
    onseeked: null as unknown,
    onerror: null as unknown,
    load: vi.fn(),
    removeAttribute: vi.fn(),
    canPlayType: () => "",
  };
}

let created: ReturnType<typeof silentVideo>[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  created = [];
  vi.stubGlobal("document", {
    createElement: () => {
      const v = silentVideo();
      created.push(v);
      return v;
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("video element helpers always settle", () => {
  it("rejects the poster capture after its timeout and tears the element down", async () => {
    const pending = captureVideoPoster("blob:test");
    const assertion = expect(pending).rejects.toBeInstanceOf(VideoMediaTimeoutError);
    await vi.advanceTimersByTimeAsync(VIDEO_POSTER_TIMEOUT_MS + 1);
    await assertion;
    expect(created[0]!.removeAttribute).toHaveBeenCalledWith("src");
    expect(created[0]!.onloadeddata).toBeNull();
  });

  it("rejects the metadata probe after its timeout", async () => {
    const file = new File([new Uint8Array(32)], "IMG_1.MOV", { type: "video/quicktime" });
    const pending = probeVideoFile(file);
    const assertion = expect(pending).rejects.toMatchObject({ name: "VideoMediaTimeoutError", step: "metadata" });
    await vi.advanceTimersByTimeAsync(VIDEO_PROBE_TIMEOUT_MS + 1);
    await assertion;
  });
});

describe("validation before any upload starts", () => {
  function probeWithDuration(durationSeconds: number) {
    const file = new File([new Uint8Array(32)], "IMG_2.MOV", { type: "video/quicktime" });
    const pending = probeVideoFile(file);
    const video = created[0]! as ReturnType<typeof silentVideo> & {
      duration: number;
      videoWidth: number;
      videoHeight: number;
    };
    video.duration = durationSeconds;
    video.videoWidth = 1080;
    video.videoHeight = 1920;
    (video.onloadedmetadata as () => void)();
    return pending;
  }

  beforeEach(() => {
    vi.stubGlobal("URL", { createObjectURL: () => "blob:probe", revokeObjectURL: vi.fn() });
  });

  it("accepts a 2:55 video with its duration and dimensions", async () => {
    await expect(probeWithDuration(175)).resolves.toMatchObject({ durationSeconds: 175, width: 1080, height: 1920 });
  });

  it.each([30, 120, 179.9])("accepts a %ss video under the size limit", async (seconds) => {
    await expect(probeWithDuration(seconds)).resolves.toMatchObject({ durationSeconds: seconds });
  });

  it("rejects an under-3-minute video over the size limit with the size message, not the duration message", async () => {
    const big = new File([new Uint8Array(8)], "IMG_4.MOV", { type: "video/quicktime" });
    Object.defineProperty(big, "size", { value: 251 * 1024 * 1024 });
    const error = await probeVideoFile(big).then(
      () => null,
      (e: unknown) => e as Error,
    );
    expect(error?.message).toBe("This video file is too large to upload.");
    expect(error?.message).not.toMatch(/minute/);
    expect(created).toHaveLength(0);
  });

  it("rejects a video longer than 3 minutes", async () => {
    await expect(probeWithDuration(181)).rejects.toThrow("This video is longer than the 3-minute limit.");
  });

  it("rejects an oversize video and an unsupported type without loading them", async () => {
    const huge = new File([new Uint8Array(8)], "IMG_3.MOV", { type: "video/quicktime" });
    Object.defineProperty(huge, "size", { value: 251 * 1024 * 1024 });
    await expect(probeVideoFile(huge)).rejects.toThrow("This video file is too large to upload.");

    const avi = new File([new Uint8Array(8)], "clip.avi", { type: "video/x-msvideo" });
    await expect(probeVideoFile(avi)).rejects.toThrow("This video format is not supported.");
    expect(created).toHaveLength(0);
  });
});
