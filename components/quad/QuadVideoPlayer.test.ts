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
  it("renders play/pause then mute inside one bottom-left control group", () => {
    const group = player.indexOf('className="cq-quad-video-controls"');
    const play = player.indexOf('data-cq-video-control="play"');
    const mute = player.indexOf('data-cq-video-control="mute"');
    expect(group).toBeGreaterThan(0);
    expect(play).toBeGreaterThan(group);
    expect(mute).toBeGreaterThan(play);
    expect(player.match(/data-cq-video-control="play"/g)).toHaveLength(1);
    expect(player.match(/data-cq-video-control="mute"/g)).toHaveLength(1);
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
