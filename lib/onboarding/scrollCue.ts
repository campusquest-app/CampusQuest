/**
 * Show a "more below" cue only while the scroller has content past the viewport
 * and the user has not reached the bottom.
 */
export function shouldShowScrollCue(
  metrics: { scrollHeight: number; clientHeight: number; scrollTop: number },
  edgePx = 8,
  remainingPx = 28,
): boolean {
  const overflow = metrics.scrollHeight - metrics.clientHeight;
  if (overflow <= edgePx) return false;
  return overflow - metrics.scrollTop > remainingPx;
}
