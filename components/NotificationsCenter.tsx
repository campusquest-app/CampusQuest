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
  embedded,
}: {
  onUnreadCountChange?: (count: number) => void;
  personalization?: { discoveryFocus?: string[] } | null;
  /** Render inside Inbox (no duplicate page chrome). */
  embedded?: boolean;
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
      setNotifications((prev) => {
        const next = prev.map((notification) =>
          notification.id === notificationId ? { ...notification, readAt: new Date().toISOString() } : notification,
        );
        onUnreadCountChange?.(next.filter((n) => !n.readAt).length);
        return next;
      });
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

  const headerRow = embedded ? (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
      <p className="text-xs text-white/60">
        {unreadCount === 0 ? "All caught up" : `${unreadCount} unread`}
      </p>
      <button
        type="button"
        disabled={markingAll || unreadCount === 0}
        onClick={() => void markAllRead()}
        className="px-3 py-2 rounded-lg text-xs font-semibold border border-uri-keaney/40 text-uri-keaney hover:bg-uri-keaney/10 disabled:opacity-50"
      >
        {markingAll ? "Marking..." : "Mark all as read"}
      </button>
    </div>
  ) : (
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
  );

  const listWrapClass = embedded
    ? "px-2 py-2 space-y-2 max-h-[min(50vh,28rem)] overflow-y-auto overscroll-y-contain"
    : "space-y-2";

  const itemClass = (read: boolean) =>
    embedded
      ? `rounded-xl border p-3 space-y-1.5 ${
          read ? "border-white/10 bg-white/[0.03]" : "border-uri-keaney/35 bg-white/[0.04]"
        }`
      : `card p-4 border ${read ? "border-white/10" : "border-uri-keaney/35"} space-y-1.5`;

  const emptyCopy = embedded
    ? "You're caught up. RSVPs, org updates, and campus activity will show up here."
    : "No notifications yet. When something needs your attention, it will appear here.";

  const body = (
    <>
      {headerRow}
      {error ? (
        <div
          className={`rounded-lg border border-rose-400/40 bg-rose-500/10 py-2 text-xs text-rose-200 ${
            embedded ? "mx-4 mt-3" : ""
          } px-3`}
        >
          {error}
        </div>
      ) : null}
      {loading ? (
        <div className={`space-y-2 ${embedded ? "px-4 pt-3" : ""}`}>
          <div className="h-16 rounded-xl bg-white/10 animate-pulse" />
          <div className="h-16 rounded-xl bg-white/10 animate-pulse" />
        </div>
      ) : null}
      {!loading && notifications.length === 0 ? (
        <p className={`text-sm text-white/60 ${embedded ? "px-4 py-10 text-center" : ""}`}>{emptyCopy}</p>
      ) : null}

      <div className={listWrapClass}>
        {prioritizedNotifications.map((notification) => (
          <article key={notification.id} className={itemClass(Boolean(notification.readAt))}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-white font-semibold text-sm">{notification.title}</p>
              {!notification.readAt ? (
                <button
                  type="button"
                  onClick={() => void markRead(notification.id)}
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-white/20 text-white/80 hover:bg-white/10 flex-shrink-0"
                >
                  Mark read
                </button>
              ) : null}
            </div>
            <p className="text-sm text-white/75">{notification.body}</p>
            <p className="text-[11px] text-white/50">{new Date(notification.createdAt).toLocaleString()}</p>
          </article>
        ))}
      </div>
    </>
  );

  return embedded ? (
    <div className="flex flex-col min-h-0">{body}</div>
  ) : (
    <section className="space-y-4">{body}</section>
  );
}
