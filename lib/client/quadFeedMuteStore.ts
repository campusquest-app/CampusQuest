/**
 * Session-scoped Quad feed mute preference.
 * Fresh load always starts muted; unmute persists for later videos in-session.
 */

let feedUnmuted = false;
const listeners = new Set<() => void>();

export function getQuadFeedUnmuted(): boolean {
  return feedUnmuted;
}

export function setQuadFeedUnmuted(next: boolean): void {
  if (feedUnmuted === next) return;
  feedUnmuted = next;
  for (const listener of Array.from(listeners)) listener();
}

export function subscribeQuadFeedMute(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
