"use client";

import { useEffect, useState, useMemo } from "react";
import { fetchAuthed, patchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import {
  avatarFromConnectionProfile,
  respondToConnectionRequest,
} from "@/lib/client/socialConnectionsClient";
import { emitSocialSync, subscribeSocialSync } from "@/lib/client/socialSync";
import { AvatarDisplay } from "./AvatarDisplay";
import { ScreenDataState } from "@/components/ui/ScreenDataState";
import { PendingTagsInbox } from "@/components/quad/PendingTagsInbox";

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
  theme = "default",
  onOpenQuadPost,
}: {
  onUnreadCountChange?: (count: number) => void;
  personalization?: { discoveryFocus?: string[] } | null;
  /** Render inside Inbox (no duplicate page chrome). */
  embedded?: boolean;
  theme?: "default" | "inbox";
  /** Open a Quad post from a tag/like/comment notification (marks read first). */
  onOpenQuadPost?: (postId: string, options?: { revealPhotoTags?: boolean }) => void;
}) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [respondingRequestId, setRespondingRequestId] = useState<string | null>(null);
  const [respondingTagKey, setRespondingTagKey] = useState<string | null>(null);
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

  async function handleTagApprovalFromNotification(
    notification: NotificationItem,
    action: "approve" | "reject",
  ) {
    const postId = notification.relatedEntityId;
    if (!postId) {
      setError("This tag request is no longer available.");
      return;
    }
    const key = `${notification.id}:${action}`;
    setRespondingTagKey(key);
    setError(null);
    try {
      // Resolve the pending tag for this post + viewer, then approve/reject.
      const pending = await fetchAuthed<{ tags: { tagId: string; postId: string }[] }>("/api/me/pending-tags");
      const match = (pending.tags ?? []).find((t) => t.postId === postId);
      if (!match) {
        setActionToast("This tag was already reviewed.");
        setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
        return;
      }
      await patchAuthed(`/api/me/pending-tags/${match.tagId}`, { action });
      setActionToast(action === "approve" ? "Tag approved" : "Tag rejected");
      await markRead(notification.id);
      setNotifications((prev) => {
        const next = prev.filter((n) => n.id !== notification.id);
        onUnreadCountChange?.(next.filter((n) => !n.readAt).length);
        return next;
      });
      emitSocialSync({ source: "inbox" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update tag.");
    } finally {
      setRespondingTagKey(null);
    }
  }

  const isInbox = embedded && theme === "inbox";

  const headerRow = isInbox ? (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <p className="text-xs text-white/45">{unreadCount === 0 ? "All caught up" : `${unreadCount} unread`}</p>
      <button
        type="button"
        disabled={markingAll || unreadCount === 0}
        onClick={() => void markAllRead()}
        className="text-xs font-semibold text-[#0095f6] disabled:opacity-40"
      >
        {markingAll ? "Marking…" : "Mark all read"}
      </button>
    </div>
  ) : embedded ? (
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

  const listWrapClass = isInbox
    ? "flex-1 overflow-y-auto overscroll-y-contain"
    : embedded
      ? "px-2 py-2 space-y-2 max-h-[min(50vh,28rem)] overflow-y-auto overscroll-y-contain"
      : "space-y-2";

  const itemClass = (read: boolean) =>
    isInbox
      ? `cq-inbox-notif-row ${read ? "" : "cq-inbox-notif-row--unread"}`
      : embedded
        ? `rounded-xl border p-3 space-y-1.5 ${
            read
              ? "border-cq-border bg-cq-card"
              : "border-cq-border border-l-[3px] border-l-uri-keaney bg-cq-elevated"
          }`
        : `card p-4 border ${
            read ? "border-cq-border" : "border-cq-border border-l-[3px] border-l-uri-keaney bg-cq-elevated"
          } space-y-1.5`;

  const emptyCopy = isInbox
    ? "You're caught up. RSVPs, org updates, and campus activity will show up here."
    : embedded
      ? "You're caught up. RSVPs, org updates, and campus activity will show up here."
      : "No notifications yet. When something needs your attention, it will appear here.";

  const body = (
    <>
      {actionToast ? (
        <div
          className={`text-sm text-white ${
            isInbox ? "mx-4 mt-3 rounded-lg bg-white/10 px-3 py-2" : `rounded-lg border border-uri-keaney/40 bg-uri-navy/90 px-3 py-2 ${embedded ? "mx-4 mt-3" : ""}`
          }`}
        >
          {actionToast}
        </div>
      ) : null}
      {headerRow}
      <PendingTagsInbox embedded={Boolean(embedded || isInbox)} />
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
        <div className={`space-y-2 ${isInbox ? "px-4 pt-3" : embedded ? "px-4 pt-3" : ""}`}>
          <div className={`h-16 animate-pulse ${isInbox ? "bg-white/[0.06]" : "rounded-xl bg-slate-100"}`} />
          <div className={`h-16 animate-pulse ${isInbox ? "bg-white/[0.06]" : "rounded-xl bg-slate-100"}`} />
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

      <div className={listWrapClass} {...(isInbox ? { "data-cq-scroll-root": true } : {})}>
        {sortedNotifications.map((notification) => {
          const isFriendRequest = notification.type === "friend_request";
          const isTagApproval = notification.type === "quad_post_tag_approval";
          const isActorSocial =
            isFriendRequest ||
            isTagApproval ||
            notification.type === "quad_post_like" ||
            notification.type === "quad_post_comment" ||
            notification.type === "quad_post_tag" ||
            notification.type === "quad_post_mention";
          const requestId = notification.friendRequestId ?? notification.relatedEntityId;
          const actorAvatar = avatarFromConnectionProfile({
            avatarUrl: notification.actorAvatarUrl ?? null,
            avatarCustomJson: notification.actorAvatarCustomJson ?? null,
          });

          const isQuadPostNotif =
            notification.type === "quad_post_like" ||
            notification.type === "quad_post_comment" ||
            notification.type === "quad_post_tag" ||
            notification.type === "quad_post_mention" ||
            notification.type === "quad_post_tag_approval";
          const canOpenPost =
            Boolean(onOpenQuadPost) &&
            isQuadPostNotif &&
            notification.relatedEntityType === "quad_post" &&
            Boolean(notification.relatedEntityId);

          return (
            <article
              key={notification.id}
              className={`${itemClass(Boolean(notification.readAt))}${canOpenPost ? " cursor-pointer" : ""}`}
              role={canOpenPost ? "button" : undefined}
              tabIndex={canOpenPost ? 0 : undefined}
              onClick={
                canOpenPost
                  ? () => {
                      void (async () => {
                        if (!notification.readAt) await markRead(notification.id);
                        onOpenQuadPost?.(notification.relatedEntityId!, {
                          revealPhotoTags:
                            notification.type === "quad_post_tag" ||
                            notification.type === "quad_post_tag_approval",
                        });
                      })();
                    }
                  : undefined
              }
              onKeyDown={
                canOpenPost
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        (event.currentTarget as HTMLElement).click();
                      }
                    }
                  : undefined
              }
            >
              <div className="flex items-start gap-3">
                {isActorSocial ? (
                  <div className={`shrink-0 overflow-hidden rounded-full bg-[#262626] ${isInbox ? "h-11 w-11" : "cq-avatar-slot w-10 h-10 border border-cq-border"}`}>
                    <AvatarDisplay avatar={actorAvatar} fitParent size={isInbox ? 44 : 40} />
                  </div>
                ) : null}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`min-w-0 flex-1 text-sm font-semibold ${isInbox ? "text-white" : "text-cq-foreground"}`}>
                      {isActorSocial && notification.actorUsername
                        ? `@${notification.actorUsername}`
                        : notification.title}
                    </p>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        disabled={togglingId === notification.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          void toggleFavorite(notification.id, !notification.isFavorited);
                        }}
                        className={`p-2 rounded-lg text-sm transition-colors disabled:opacity-50 ${
                          notification.isFavorited
                            ? isInbox
                              ? "text-uri-gold"
                              : "text-uri-gold bg-uri-gold/15 border border-uri-gold/35"
                            : isInbox
                              ? "text-white/35 hover:text-white/60"
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
                          onClick={(event) => {
                            event.stopPropagation();
                            void markRead(notification.id);
                          }}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                            isInbox
                              ? "text-[#0095f6]"
                              : "border border-cq-border text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          Mark read
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <p className={`text-sm ${isInbox ? "text-white/55" : "text-cq-muted"}`}>
                    {isFriendRequest && notification.actorUsername
                      ? `${notification.actorUsername} sent you a follow request`
                      : notification.body}
                  </p>
                  {isFriendRequest && requestId ? (
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        disabled={respondingRequestId === requestId}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleFriendRequestAction(notification, "accept");
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60 ${
                          isInbox
                            ? "bg-[#0095f6] text-white"
                            : "bg-uri-keaney text-uri-navy hover:bg-uri-keaney/90"
                        }`}
                      >
                        Follow Back
                      </button>
                      <button
                        type="button"
                        disabled={respondingRequestId === requestId}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleFriendRequestAction(notification, "decline");
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60 ${
                          isInbox
                            ? "bg-white/10 text-white"
                            : "text-slate-700 border border-cq-border hover:bg-slate-100"
                        }`}
                      >
                        Deny
                      </button>
                    </div>
                  ) : null}
                  {isTagApproval ? (
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        disabled={respondingTagKey?.startsWith(`${notification.id}:`)}
                        onClick={() => void handleTagApprovalFromNotification(notification, "approve")}
                        className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60 ${
                          isInbox
                            ? "bg-[#0095f6] text-white"
                            : "bg-uri-keaney text-uri-navy hover:bg-uri-keaney/90"
                        }`}
                      >
                        Approve tag
                      </button>
                      <button
                        type="button"
                        disabled={respondingTagKey?.startsWith(`${notification.id}:`)}
                        onClick={() => void handleTagApprovalFromNotification(notification, "reject")}
                        className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60 ${
                          isInbox
                            ? "bg-white/10 text-white"
                            : "text-slate-700 border border-cq-border hover:bg-slate-100"
                        }`}
                      >
                        Reject
                      </button>
                    </div>
                  ) : null}
                  <p className={`text-[11px] ${isInbox ? "text-white/35" : "text-cq-muted"}`}>
                    {new Date(notification.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );

  return embedded ? (
    <div className={`flex min-h-0 flex-col ${isInbox ? "flex-1" : ""}`}>{body}</div>
  ) : (
    <section className="space-y-4">{body}</section>
  );
}
