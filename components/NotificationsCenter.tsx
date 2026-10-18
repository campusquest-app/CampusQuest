"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import {
  BadgeCheck,
  Bell,
  Flame,
  CalendarDays,
  Megaphone,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Tag,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { fetchAuthed, patchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import {
  buildNotificationDisplayItems,
  formatNotificationTime,
  notificationIconKind,
  type NotificationFilter,
  type NotificationIconKind,
} from "@/lib/client/notificationCenterModel";
import {
  avatarFromConnectionProfile,
  respondToConnectionRequest,
} from "@/lib/client/socialConnectionsClient";
import { emitSocialSync, subscribeSocialSync } from "@/lib/client/socialSync";
import { AvatarDisplay } from "./AvatarDisplay";
import { ScreenDataState } from "@/components/ui/ScreenDataState";
import { PendingTagsInbox } from "@/components/quad/PendingTagsInbox";

export type NotificationDestination = {
  type: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  actorId?: string | null;
};

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

function notificationHasDestination(notification: NotificationItem): boolean {
  const type = notification.relatedEntityType;
  const id = notification.relatedEntityId;
  if (
    id &&
    (type === "quad_post" ||
      type === "conversation" ||
      type === "event" ||
      type === "student_organization" ||
      type === "organization")
  ) {
    return true;
  }
  return Boolean(notification.actorId);
}

const NOTIFICATION_ICONS: Record<NotificationIconKind, LucideIcon> = {
  message: MessageCircle,
  social: UserPlus,
  event: CalendarDays,
  announcement: Megaphone,
  organization: Users,
  safety: ShieldCheck,
  verification: BadgeCheck,
  marketplace: Tag,
  quad: Sparkles,
  general: Bell,
};

export function NotificationsCenter({
  onUnreadCountChange,
  personalization: _personalization,
  embedded,
  theme = "default",
  onOpenQuadPost,
  onOpenDestination,
}: {
  onUnreadCountChange?: (count: number) => void;
  personalization?: { discoveryFocus?: string[] } | null;
  /** Render inside Inbox (no duplicate page chrome). */
  embedded?: boolean;
  theme?: "default" | "inbox";
  /** Open a Quad post from a tag/like/comment notification (marks read first). */
  onOpenQuadPost?: (postId: string, options?: { revealPhotoTags?: boolean }) => void;
  /** Open the notification's existing destination (post, event, chat, profile, org). */
  onOpenDestination?: (notification: NotificationDestination) => void;
}) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [respondingRequestId, setRespondingRequestId] = useState<string | null>(null);
  const [respondingTagKey, setRespondingTagKey] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [serverUnreadCount, setServerUnreadCount] = useState(0);
  const serverUnreadRef = useRef(0);

  const unreadCount = Math.max(
    serverUnreadCount,
    notifications.filter((notification) => !notification.readAt).length,
  );

  /** The badge mirrors the server total (the list only holds the newest 80 rows). */
  function reportUnread(next: number) {
    const safe = Math.max(0, next);
    serverUnreadRef.current = safe;
    setServerUnreadCount(safe);
    onUnreadCountChange?.(safe);
  }

  async function loadNotifications(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const data = await fetchAuthed<{ notifications: NotificationItem[]; unreadCount: number }>("/api/notifications?limit=80");
      setNotifications(data.notifications ?? []);
      reportUnread(Number(data.unreadCount ?? 0));
      if (options?.silent) setError(null);
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

  const displayItems = useMemo(
    () => buildNotificationDisplayItems(notifications, filter),
    [notifications, filter],
  );

  async function markRead(notificationIds: string | string[]) {
    const ids = Array.from(new Set(Array.isArray(notificationIds) ? notificationIds : [notificationIds]));
    if (ids.length === 0) return;
    const results = await Promise.allSettled(
      ids.map((id) => postAuthed(`/api/notifications/${id}/read`, {})),
    );
    const readIds = new Set(ids.filter((_, index) => results[index].status === "fulfilled"));
    if (readIds.size > 0) {
      const readAt = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((notification) =>
          readIds.has(notification.id) && !notification.readAt ? { ...notification, readAt } : notification,
        ),
      );
      reportUnread(serverUnreadRef.current - readIds.size);
      emitSocialSync({ source: "notifications" });
    }
    if (readIds.size < ids.length) {
      setActionToast("Could not mark as read. Try again.");
    }
  }

  async function toggleFavorite(notificationId: string, next: boolean) {
    setTogglingId(notificationId);
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
      setActionToast(favoriteError instanceof Error ? favoriteError.message : "Could not update favorite.");
    } finally {
      setTogglingId(null);
    }
  }

  async function markAllRead() {
    setMarkingAll(true);
    try {
      await postAuthed("/api/notifications/read-all", {});
      const readAt = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((notification) =>
          notification.type === "friend_request"
            ? notification
            : { ...notification, readAt: notification.readAt ?? readAt },
        ),
      );
      emitSocialSync({ source: "notifications" });
      await loadNotifications({ silent: true });
    } catch (markAllError) {
      setActionToast(markAllError instanceof Error ? markAllError.message : "Could not mark all as read.");
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
      setActionToast("This follow request is no longer available.");
      return;
    }
    setRespondingRequestId(requestId);
    try {
      await respondToConnectionRequest(requestId, action);
      const username = notification.actorUsername ?? "this student";
      setActionToast(
        action === "accept" ? `You are now following ${username}` : "Follow request declined",
      );
      setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
      if (!notification.readAt) reportUnread(serverUnreadRef.current - 1);
      emitSocialSync({ source: "notifications" });
    } catch (respondError) {
      setActionToast(respondError instanceof Error ? respondError.message : "Could not respond to follow request.");
      await loadNotifications({ silent: true });
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
      setActionToast("This tag request is no longer available.");
      return;
    }
    const key = `${notification.id}:${action}`;
    setRespondingTagKey(key);
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
      if (!notification.readAt) await markRead(notification.id);
      setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
      emitSocialSync({ source: "inbox" });
    } catch (err) {
      setActionToast(err instanceof Error ? err.message : "Could not update tag.");
    } finally {
      setRespondingTagKey(null);
    }
  }

  const isInbox = embedded && theme === "inbox";

  const filterControl = (
    <div
      role="group"
      aria-label="Filter notifications"
      className={`cq-notif-filter ${isInbox ? "" : "cq-notif-filter--light"}`}
    >
      {(["all", "unread"] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={filter === value}
          onClick={() => setFilter(value)}
          className={`cq-notif-filter__option ${filter === value ? "cq-notif-filter__option--active" : ""}`}
        >
          {value === "all" ? "All" : "Unread"}
          {value === "unread" && unreadCount > 0 ? (
            <span className="cq-notif-filter__count">{unreadCount > 99 ? "99+" : unreadCount}</span>
          ) : null}
        </button>
      ))}
    </div>
  );

  const headerRow = isInbox ? (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      {filterControl}
      <button
        type="button"
        disabled={markingAll || unreadCount === 0}
        onClick={() => void markAllRead()}
        className="min-h-[44px] px-1 text-xs font-semibold text-[#0095f6] disabled:opacity-40"
      >
        {markingAll ? "Marking…" : "Mark all read"}
      </button>
    </div>
  ) : embedded ? (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-cq-border">
      {filterControl}
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
    <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="font-display font-semibold text-cq-foreground">Notifications</h3>
        <p className="text-xs text-cq-muted mt-1">{unreadCount} unread</p>
      </div>
      {filterControl}
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
      {!loading && !error && notifications.length > 0 && displayItems.length === 0 ? (
        <ScreenDataState
          variant="empty"
          message="No unread notifications."
          detail="Everything here has been read."
          compact
          className={embedded ? "mx-4 my-4" : "my-4"}
        />
      ) : null}

      <div className={listWrapClass} {...(isInbox ? { "data-cq-scroll-root": true } : {})}>
        {displayItems.map((item) => {
          const notification = item.notification;
          const isUnread = item.unreadIds.length > 0;
          const isGroupedConversation = item.messageCount > 1;
          const isFriendRequest = notification.type === "friend_request";
          const isTagApproval = notification.type === "quad_post_tag_approval";
          const isEmberNotice = notification.type === "quad_post_ember";
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
            notification.type === "quad_post_ember" ||
            notification.type === "quad_post_comment" ||
            notification.type === "quad_post_tag" ||
            notification.type === "quad_post_mention" ||
            notification.type === "quad_post_tag_approval";
          const canOpenPost =
            Boolean(onOpenQuadPost) &&
            isQuadPostNotif &&
            notification.relatedEntityType === "quad_post" &&
            Boolean(notification.relatedEntityId);
          const canOpenDestination = Boolean(onOpenDestination) && notificationHasDestination(notification);
          const canOpen = canOpenPost || canOpenDestination;
          const showActorAvatar =
            !isEmberNotice &&
            (isActorSocial || (Boolean(notification.actorId) && Boolean(notification.actorUsername)));
          const TypeIcon = isEmberNotice ? Flame : NOTIFICATION_ICONS[notificationIconKind(notification.type)];

          return (
            <article
              key={item.key}
              data-cq-notification-type={notification.type}
              className={`${itemClass(!isUnread)}${canOpen ? " cursor-pointer" : ""}`}
              role={canOpen ? "button" : undefined}
              tabIndex={canOpen ? 0 : undefined}
              aria-label={canOpen ? `${isUnread ? "Unread: " : ""}${notification.title}` : undefined}
              onClick={
                canOpen
                  ? () => {
                      void (async () => {
                        if (isUnread) await markRead(item.unreadIds);
                        if (canOpenPost) {
                          onOpenQuadPost?.(notification.relatedEntityId!, {
                            revealPhotoTags:
                              notification.type === "quad_post_tag" ||
                              notification.type === "quad_post_tag_approval",
                          });
                          return;
                        }
                        onOpenDestination?.({
                          type: notification.type,
                          relatedEntityType: notification.relatedEntityType,
                          relatedEntityId: notification.relatedEntityId,
                          actorId: notification.actorId ?? null,
                        });
                      })();
                    }
                  : undefined
              }
              onKeyDown={
                canOpen
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
                <div className="relative shrink-0">
                  {showActorAvatar ? (
                    <div className={`overflow-hidden rounded-full bg-[#262626] ${isInbox ? "h-11 w-11" : "cq-avatar-slot w-10 h-10 border border-cq-border"}`}>
                      <AvatarDisplay avatar={actorAvatar} fitParent size={isInbox ? 44 : 40} />
                    </div>
                  ) : (
                    <div
                      className={`cq-notif-icon cq-notif-icon--${notificationIconKind(notification.type)} ${isInbox ? "h-11 w-11" : "h-10 w-10"}`}
                      aria-hidden
                    >
                      <TypeIcon size={20} strokeWidth={2} color={isEmberNotice ? "#A78BFA" : undefined} />
                    </div>
                  )}
                  {isUnread ? <span className="cq-notif-unread-dot" aria-hidden /> : null}
                </div>
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
                      {isUnread && !isFriendRequest ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void markRead(item.unreadIds);
                          }}
                          className={`min-h-[36px] px-2.5 py-1 rounded-md text-[11px] font-semibold ${
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
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleTagApprovalFromNotification(notification, "approve");
                        }}
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
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleTagApprovalFromNotification(notification, "reject");
                        }}
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
                    <time
                      dateTime={notification.createdAt}
                      title={new Date(notification.createdAt).toLocaleString()}
                    >
                      {formatNotificationTime(notification.createdAt)}
                    </time>
                    {isGroupedConversation ? ` · ${item.messageCount} messages` : null}
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
