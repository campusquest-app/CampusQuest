type ActivityFeedRefreshListener = () => void;

const listeners = new Set<ActivityFeedRefreshListener>();

export function subscribeActivityFeedRefresh(listener: ActivityFeedRefreshListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function bumpActivityFeedRefresh(): void {
  listeners.forEach((listener) => listener());
}
