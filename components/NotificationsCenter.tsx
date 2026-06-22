"use client";

import { useEffect, useState, useMemo } from "react";
import { fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import {
  avatarFromConnectionProfile,
  respondToConnectionRequest,
} from "@/lib/client/socialConnectionsClient";
import { emitSocialSync, subscribeSocialSync } from "@/lib/client/socialSync";
import { AvatarDisplay } from "./AvatarDisplay";
import { ScreenDataState } from "@/components/ui/ScreenDataState";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  friendRequestId?: string | null;
  actorId?: string | null;
  actorUsername?: string | null;
  actorDisplayName?: string | null;
  actorAvatarUrl?: string | null;
  actorAvatarCustomJson?: string | null;
  readAt: string | null;
  createdAt: string;
  isFavorited?: boolean;
  favoritedAt?: string | null;
};

export function NotificationsCenter({
  onUnreadCountChange,
  personalization: _personalization,
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
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [respondingRequestId, setRespondingRequestId] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);

  const unreadCount = notifications.filter((notification) => !notification.readAt).length;

  async function loadNotifications(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const data = await fetchAuthed<{ notifications: NotificationItem[]; unreadCount: number }>("/api/notifications?limit=80");
      setNotifications(data.notifications ?? []);
      onUnreadCountChange?.(data.unreadCount ?? 0);
    } catch (loadError) {
      if (!options?.silent) {
        setError(loadError instanceof Error ? loadError.message : "Could not load notifications.");
      }
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }

  useEffect(() => {
    void loadNotifications();
    const unsubscribe = subscribeSocialSync(() => void loadNotifications({ silent: true }));
    const intervalId = window.setInterval(() => void loadNotifications({ silent: true }), 10_000);
    const refreshOnVisible = () => {
      if (document.visibilityState === "visible") {
        void loadNotifications({ silent: true });
      }
    };
    window.addEventListener("focus", refreshOnVisible);
    document.addEventListener("visibilitychange", refreshOnVisible);
    return () => {
      unsubscribe();
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshOnVisible);
      document.removeEventListener("visibilitychange", refreshOnVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!actionToast) return undefined;
    const tid = window.setTimeout(() => setActionToast(null), 2800);
    return () => window.clearTimeout(tid);
  }, [actionToast]);

  const sortedNotifications = useMemo(() => {
    return [...notifications].sort((a, b) => {
      const fa = a.isFavorited ? 1 : 0;
      const fb = b.isFavorited ? 1 : 0;
      if (fa !== fb) return fb - fa;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [notifications]);

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

  async function toggleFavorite(notificationId: string, next: boolean) {
    setTogglingId(notificationId);
    setError(null);
    try {
      const updated = await postAuthed<
        Omit<NotificationItem, "relatedEntityType" | "relatedEntityId"> & {
          relatedEntityType: string | null;
          relatedEntityId: string | null;
          isFavorited: boolean;
          favoritedAt: string | null;
        },
        { favorited: boolean }
      >(`/api/notifications/${notificationId}/favorite`, { favorited: next });
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId
            ? {
                ...n,
                isFavorited: updated.isFavorited,
                favoritedAt: updated.favoritedAt ?? null,
              }
            : n,
        ),
      );
    } catch (favoriteError) {
      setError(favoriteError instanceof Error ? favoriteError.message : "Could not update favorite.");
    } finally {
      setTogglingId(null);
    }
  }

  async function markAllRead() {
    setMarkingAll(true);
    setError(null);
    try {
      await postAuthed("/api/notifications/read-all", {});
      setNotifications((prev) => {
        const next = prev.map((notification) =>
          notification.type === "friend_request"
            ? notification
            : { ...notification, readAt: notification.readAt ?? new Date().toISOString() },
        );
        onUnreadCountChange?.(next.filter((n) => !n.readAt).length);
        return next;
      });
    } catch (markAllError) {
      setError(markAllError instanceof Error ? markAllError.message : "Could not mark all as read.");
    } finally {
      setMarkingAll(false);
    }
  }

  async function handleFriendRequestAction(
    notification: NotificationItem,
    action: "accept" | "decline",
  ) {
    const requestId = notification.friendRequestId ?? notification.relatedEntityId;
    if (!requestId) {
      setError("This follow request is no longer available.");
      return;
    }
    setRespondingRequestId(requestId);
    setError(null);
    try {
      await respondToConnectionRequest(requestId, action);
      const username = notification.actorUsername ?? "this student";
      setActionToast(
        action === "accept" ? `You are now following ${username}` : "Follow request declined",
      );
      setNotifications((prev) => {
        const next = prev.filter((n) => n.id !== notification.id);
        onUnreadCountChange?.(next.filter((n) => !n.readAt).length);
        return next;
      });
      emitSocialSync({ source: "notifications" });
    } catch (respondError) {
      setError(respondError instanceof Error ? respondError.message : "Could not respond to follow request.");
      await loadNotifications();
    } finally {
      setRespondingRequestId(null);
    }
  }

  const headerRow = embedded ? (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-cq-border">
      <p className="text-xs text-cq-muted">
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
        <h3 className="font-display font-semibold text-cq-foreground">Notifications</h3>
        <p className="text-xs text-cq-muted mt-1">{unreadCount} unread</p>
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
          read
            ? "border-cq-border bg-cq-card"
            : "border-cq-border border-l-[3px] border-l-uri-keaney bg-cq-elevated"
        }`
      : `card p-4 border ${
          read ? "border-cq-border" : "border-cq-border border-l-[3px] border-l-uri-keaney bg-cq-elevated"
        } space-y-1.5`;

  const emptyCopy = embedded
    ? "You're caught up. RSVPs, org updates, and campus activity will show up here."
    : "No notifications yet. When something needs your attention, it will appear here.";

  const body = (
    <>
      {actionToast ? (
        <div
          className={`rounded-lg border border-uri-keaney/40 bg-uri-navy/90 px-3 py-2 text-sm text-white ${
            embedded ? "mx-4 mt-3" : ""
          }`}
        >
          {actionToast}
        </div>
      ) : null}
      {headerRow}
      {error ? (
        <ScreenDataState
          variant="error"
          message="Could not load notifications."
          detail={error}
          onRetry={() => void loadNotifications()}
          compact
          className={embedded ? "mx-4 mt-3" : ""}
        />
      ) : null}
      {loading ? (
        <div className={`space-y-2 ${embedded ? "px-4 pt-3" : ""}`}>
          <div className="h-16 rounded-xl bg-slate-100 animate-pulse" />
          <div className="h-16 rounded-xl bg-slate-100 animate-pulse" />
        </div>
      ) : null}
      {!loading && !error && notifications.length === 0 ? (
        <ScreenDataState
          variant="empty"
          message={embedded ? "You're all caught up." : "No notifications yet."}
          detail={emptyCopy}
          compact
          className={embedded ? "mx-4 my-4" : "my-4"}
        />
      ) : null}

      <div className={listWrapClass}>
        {sortedNotifications.map((notification) => {
          const isFriendRequest = notification.type === "friend_request";
          const isActorSocial =
            isFriendRequest ||
            notification.type === "quad_post_like" ||
            notification.type === "quad_post_comment";
          const requestId = notification.friendRequestId ?? notification.relatedEntityId;
          const actorAvatar = avatarFromConnectionProfile({
            avatarUrl: notification.actorAvatarUrl ?? null,
            avatarCustomJson: notification.actorAvatarCustomJson ?? null,
          });

          return (
            <article key={notification.id} className={itemClass(Boolean(notification.readAt))}>
              <div className="flex items-start gap-3">
                {isActorSocial ? (
                  <div className="cq-avatar-slot w-10 h-10 border border-cq-border">
                    <AvatarDisplay avatar={actorAvatar} fitParent size={40} />
                  </div>
                ) : null}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-cq-foreground font-semibold text-sm min-w-0 flex-1">
                      {isActorSocial && notification.actorUsername
                        ? `@${notification.actorUsername}`
                        : notification.title}
                    </p>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        disabled={togglingId === notification.id}
                        onClick={() => void toggleFavorite(notification.id, !notification.isFavorited)}
                        className={`p-2 rounded-lg text-sm transition-colors disabled:opacity-50 ${
                          notification.isFavorited
                            ? "text-uri-gold bg-uri-gold/15 border border-uri-gold/35"
                            : "text-cq-muted hover:text-uri-gold border border-cq-border hover:bg-slate-100"
                        }`}
                        title={notification.isFavorited ? "Unfavorite" : "Favorite"}
                        aria-label={notification.isFavorited ? "Unfavorite" : "Favorite"}
                        aria-pressed={notification.isFavorited ?? false}
                      >
                        ★
                      </button>
                      {!notification.readAt && !isFriendRequest ? (
                        <button
                          type="button"
                          onClick={() => void markRead(notification.id)}
                          className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-cq-border text-slate-700 hover:bg-slate-100"
                        >
                          Mark read
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <p className="text-sm text-cq-muted">
                    {isFriendRequest && notification.actorUsername
                      ? `${notification.actorUsername} sent you a follow request`
                      : notification.body}
                  </p>
                  {isFriendRequest && requestId ? (
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        disabled={respondingRequestId === requestId}
                        onClick={() => void handleFriendRequestAction(notification, "accept")}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-uri-keaney text-uri-navy hover:bg-uri-keaney/90 disabled:opacity-60"
                      >
                        Follow Back
                      </button>
                      <button
                        type="button"
                        disabled={respondingRequestId === requestId}
                        onClick={() => void handleFriendRequestAction(notification, "decline")}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 border border-cq-border hover:bg-slate-100 disabled:opacity-60"
                      >
                        Deny
                      </button>
                    </div>
                  ) : null}
                  <p className="text-[11px] text-cq-muted">{new Date(notification.createdAt).toLocaleString()}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );

  return embedded ? (
    <div className="flex flex-col min-h-0">{body}</div>
  ) : (
    <section className="space-y-4">{body}</section>
  );
}
