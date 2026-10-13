/** Apply mute without restarting the element. Unmute also clears the HTML attribute WebKit honors. */
export function setVideoElementMuted(el: HTMLMediaElement, muted: boolean): void {
  if (muted) {
    el.defaultMuted = true;
    el.muted = true;
    return;
  }
  el.defaultMuted = false;
  el.muted = false;
  try {
    el.volume = 1;
  } catch {
    // iOS exposes volume as read-only.
  }
  try {
    el.removeAttribute("muted");
  } catch {
    // ignore
  }
}

/**
 * Enable sound on an already-playing video. Must be called from a user gesture.
 * Returns false when the browser keeps the element muted or refuses playback,
 * and leaves the element muted in that case.
 */
export async function unmuteVideoElement(el: HTMLMediaElement): Promise<boolean> {
  const time = el.currentTime;
  setVideoElementMuted(el, false);
  try {
    await el.play();
  } catch {
    setVideoElementMuted(el, true);
    return false;
  }
  if (el.muted || el.paused) {
    setVideoElementMuted(el, true);
    return false;
  }
  if (Number.isFinite(time) && time > 0 && Math.abs(el.currentTime - time) > 0.35) {
    try {
      el.currentTime = time;
    } catch {
      // ignore
    }
  }
  return true;
}

/** Hide the speaker control only when the container positively has no audio track. */
export function shouldShowVideoMuteControl(sniffed: boolean | null): boolean {
  return sniffed !== false;
}
