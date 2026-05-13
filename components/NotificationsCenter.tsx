"use client";

import { useEffect, useState } from "react";
import { fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  readAt: string | null;
  createdAt: string;
};

export function NotificationsCenter({
  onUnreadCountChange,
  personalization,
}: {
  onUnreadCountChange?: (count: number) => void;
  personalization?: { discoveryFocus?: string[] } | null;
}) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const unreadCount = notifications.filter((notification) => !notification.readAt).length;

  async function loadNotifications() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAuthed<{ notifications: NotificationItem[]; unreadCount: number }>("/api/notifications?limit=80");
      setNotifications(data.notifications ?? []);
      onUnreadCountChange?.(data.unreadCount ?? 0);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function markRead(notificationId: string) {
    try {
      await postAuthed(`/api/notifications/${notificationId}/read`, {});
      setNotifications((prev) =>
        prev.map((notification) =>
          notification.id === notificationId ? { ...notification, readAt: new Date().toISOString() } : notification,
        ),
      );
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : "Could not mark notification as read.");
    }
  }

  async function markAllRead() {
    setMarkingAll(true);
    setError(null);
    try {
      await postAuthed("/api/notifications/read-all", {});
      setNotifications((prev) => prev.map((notification) => ({ ...notification, readAt: notification.readAt ?? new Date().toISOString() })));
      onUnreadCountChange?.(0);
    } catch (markAllError) {
      setError(markAllError instanceof Error ? markAllError.message : "Could not mark all as read.");
    } finally {
      setMarkingAll(false);
    }
  }

  const prioritizedNotifications = [...notifications].sort((a, b) => {
    const focus = new Set(personalization?.discoveryFocus ?? []);
    const score = (type: string) => {
      if (focus.has("events") && (type === "event_rsvp_reminder" || type === "organization_event_announcement")) return 0;
      if (focus.has("meet_students") && (type === "direct_message" || type === "connection_accepted")) return 1;
      return 2;
    };
    const scoreDiff = score(a.type) - score(b.type);
    if (scoreDiff !== 0) return scoreDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <section className="space-y-4">
      <div className="card p-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display font-semibold text-white">Notifications</h3>
          <p className="text-xs text-white/60 mt-1">{unreadCount} unread</p>
        </div>
        <button
          type="button"
          disabled={markingAll || unreadCount === 0}
          onClick={() => void markAllRead()}
          className="px-3 py-2 rounded-lg text-xs font-semibold border border-uri-keaney/40 text-uri-keaney hover:bg-uri-keaney/10 disabled:opacity-50"
        >
          {markingAll ? "Marking..." : "Mark all as read"}
        </button>
      </div>
      {error ? <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</div> : null}
      {loading ? (
        <div className="space-y-2">
          <div className="h-16 rounded-xl bg-white/10 animate-pulse" />
          <div className="h-16 rounded-xl bg-white/10 animate-pulse" />
        </div>
      ) : null}
      {!loading && notifications.length === 0 ? (
        <p className="text-sm text-white/60">No notifications yet. We’ll let you know when something important happens.</p>
      ) : null}

      <div className="space-y-2">
        {prioritizedNotifications.map((notification) => (
          <article
            key={notification.id}
            className={`card p-4 border ${notification.readAt ? "border-white/10" : "border-uri-keaney/35"} space-y-1.5`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-white font-semibold text-sm">{notification.title}</p>
              {!notification.readAt ? (
                <button
                  type="button"
                  onClick={() => void markRead(notification.id)}
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-white/20 text-white/80 hover:bg-white/10"
                >
                  Mark read
                </button>
              ) : null}
            </div>
            <p className="text-sm text-white/75">{notification.body}</p>
            <p className="text-[11px] text-white/50">
              {new Date(notification.createdAt).toLocaleString()} · {notification.type}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
