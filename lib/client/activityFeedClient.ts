import { fetchAuthed } from "@/lib/client/dashboardApi";
import type { ServerActivityEvent } from "@/lib/activityFeed";

export async function fetchMyActivityFeed(limit = 50): Promise<ServerActivityEvent[]> {
  const data = await fetchAuthed<{ events: ServerActivityEvent[] }>(`/api/me/activity-feed?limit=${limit}`);
  return data.events ?? [];
}
