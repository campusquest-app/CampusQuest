import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..");
const player = readFileSync(join(root, "components/quad/QuadVideoPlayer.tsx"), "utf8");
const css = readFileSync(join(root, "app/globals.css"), "utf8");

function cssRule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `missing rule ${selector}`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
}

describe("QuadVideoPlayer controls layout", () => {
  it("keeps mute in the bottom-left group and hides permanent play while playing", () => {
    const group = player.indexOf('className="cq-quad-video-controls"');
    const play = player.indexOf('data-cq-video-control="play"');
    const mute = player.indexOf('data-cq-video-control="mute"');
    expect(group).toBeGreaterThan(0);
    expect(play).toBeGreaterThan(group);
    expect(mute).toBeGreaterThan(play);
    expect(player).toContain("{!playing ? (");
    expect(player).toContain("cq-quad-video-flash");
    expect(player.match(/data-cq-video-control="play"/g)).toHaveLength(1);
    expect(player.match(/data-cq-video-control="mute"/g)).toHaveLength(1);
  });

  it("uses hysteresis autoplay coordinator with muted playsInline playback", () => {
    expect(player).toContain("registerFeedVideoAutoplay");
    expect(player).toContain("reportFeedVideoVisibility");
    expect(player).toContain("QUAD_VIDEO_IO_ROOT_MARGIN");
    expect(player).toContain("userPausedRef");
    expect(player).toContain("playsInline");
    expect(player).toContain("autoPlay=");
    expect(player).toContain('preload={attachedSrc ? (prefersReducedData() ? "none" : "metadata") : "none"}');
  });

  it("seeks from the shared timeline with pointer and keyboard handlers", () => {
    expect(player).toContain('data-cq-video-control="scrub"');
    expect(player).toContain('role="slider"');
    expect(player).toContain("seekToClientX");
    expect(player).toContain('e.key === "ArrowRight"');
    expect(player).toContain('e.key === "ArrowLeft"');
    expect(player).toContain("data-cq-gesture-block=\"all\"");
    expect(player.match(/cq-quad-video-scrub/g)?.length).toBeGreaterThan(0);
    expect(player).not.toContain("pointer-events-none absolute bottom-0");
    const scrubRule = cssRule(".cq-quad-video-scrub");
    expect(scrubRule).toMatch(/left:\s*0/);
    expect(scrubRule).toMatch(/right:\s*0/);
    expect(scrubRule).toMatch(/touch-action:\s*none/);
    expect(cssRule(".cq-quad-video-scrub__bar")).toMatch(/height:\s*4px/);
    expect(cssRule(".cq-quad-video-scrub--active .cq-quad-video-scrub__handle")).toMatch(/opacity:\s*1/);
  });

  it("positions only the group, not the individual buttons", () => {
    const groupRule = cssRule(".cq-quad-video-controls");
    expect(groupRule).toMatch(/position:\s*absolute/);
    expect(groupRule).toMatch(/left:\s*0\.75rem/);
    expect(groupRule).toMatch(/bottom:\s*0\.75rem/);
    expect(groupRule).toMatch(/gap:/);

    const muteRule = cssRule(".cq-quad-video-sound");
    expect(muteRule).not.toMatch(/position:\s*absolute/);
    expect(muteRule).not.toMatch(/\b(left|right|bottom):/);

    const playButton = player.slice(player.indexOf('data-cq-video-control="play"'));
    expect(playButton.slice(0, playButton.indexOf(">"))).not.toMatch(/\babsolute\b/);
  });
});
