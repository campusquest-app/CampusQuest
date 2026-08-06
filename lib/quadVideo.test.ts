import { describe, expect, it } from "vitest";
import {
  formatVideoDuration,
  isAllowedVideoMime,
  looksLikeVideoUrl,
  QUAD_VIDEO_MAX_DURATION_SECONDS,
  resolveQuadVideoMaxBytes,
  videoDurationErrorMessage,
} from "@/lib/quadVideo";
import { sniffVideoContainer } from "@/lib/server/quadVideoUpload";

describe("quad video helpers", () => {
  it("accepts common video mime types", () => {
    expect(isAllowedVideoMime("video/mp4")).toBe(true);
    expect(isAllowedVideoMime("video/quicktime")).toBe(true);
    expect(isAllowedVideoMime("video/webm")).toBe(true);
    expect(isAllowedVideoMime("image/jpeg")).toBe(false);
  });

  it("detects video URLs", () => {
    expect(looksLikeVideoUrl("https://x/y/clip.mp4")).toBe(true);
    expect(looksLikeVideoUrl("https://x/y/photo.jpg")).toBe(false);
  });

  it("formats duration", () => {
    expect(formatVideoDuration(0)).toBe("0:00");
    expect(formatVideoDuration(65)).toBe("1:05");
    expect(formatVideoDuration(180)).toBe("3:00");
  });

  it("enforces 180 second max constant", () => {
    expect(QUAD_VIDEO_MAX_DURATION_SECONDS).toBe(180);
    expect(videoDurationErrorMessage()).toContain("3 minutes");
  });

  it("resolves max bytes from env with floor", () => {
    expect(resolveQuadVideoMaxBytes("10485760")).toBe(10_485_760);
    expect(resolveQuadVideoMaxBytes("100")).toBe(80 * 1024 * 1024);
  });

  it("sniffs mp4 and webm containers", () => {
    const ftyp = Buffer.alloc(12);
    ftyp.writeUInt32BE(0x18, 0);
    ftyp.write("ftyp", 4);
    expect(sniffVideoContainer(ftyp)).toBe("mp4");

    const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(sniffVideoContainer(webm)).toBe("webm");

    expect(sniffVideoContainer(Buffer.from("notavideo!!"))).toBe("unknown");
  });
});
