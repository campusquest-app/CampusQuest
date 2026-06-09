export function formatPostedAgo(iso: string, nowMs = Date.now()): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "Recently";
  const diffSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
  if (diffSec < 60) return "Just now";
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

export function formatExpiresIn(iso: string, nowMs = Date.now()): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "Expires soon";
  const diffSec = Math.max(0, Math.floor((ts - nowMs) / 1000));
  if (diffSec <= 0) return "Expired";
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `Expires in ${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) {
    return remMins > 0 ? `Expires in ${hours}h ${remMins}m` : `Expires in ${hours}h`;
  }
  return `Expires in ${Math.floor(hours / 24)}d`;
}
