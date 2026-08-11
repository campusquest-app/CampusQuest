"use client";

/**
 * Capacitor push bridge for the remote WebView shell.
 * Uses the native-injected Capacitor runtime (no root @capacitor npm dependency required).
 * No-ops on plain web browsers.
 */

import { getAccessToken } from "@/lib/client/apiSession";
import { postAuthed } from "@/lib/client/dashboardApi";

type CapPluginListenerHandle = { remove: () => void | Promise<void> };

type PushNotificationsPlugin = {
  requestPermissions: () => Promise<{ receive: string }>;
  checkPermissions: () => Promise<{ receive: string }>;
  register: () => Promise<void>;
  addListener: (
    event: string,
    cb: (payload: Record<string, unknown>) => void,
  ) => Promise<CapPluginListenerHandle> | CapPluginListenerHandle;
  getDeliveredNotifications?: () => Promise<{ notifications: unknown[] }>;
};

type CapacitorRuntime = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: {
    PushNotifications?: PushNotificationsPlugin;
    App?: {
      addListener: (
        event: string,
        cb: (payload: Record<string, unknown>) => void,
      ) => Promise<CapPluginListenerHandle> | CapPluginListenerHandle;
      openUrl?: (opts: { url: string }) => Promise<void>;
    };
  };
};

const PROMPT_SEEN_KEY = "cq_push_prepermission_seen";
const LAST_TOKEN_KEY = "cq_push_last_device_token";

export type PushDeepLink = {
  type: string;
  notificationId?: string;
  conversationId?: string;
  postId?: string;
  eventId?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
};

type PushDeepLinkListener = (link: PushDeepLink) => void;
const deepLinkListeners = new Set<PushDeepLinkListener>();

export function subscribePushDeepLink(listener: PushDeepLinkListener): () => void {
  deepLinkListeners.add(listener);
  return () => deepLinkListeners.delete(listener);
}

function emitDeepLink(link: PushDeepLink) {
  Array.from(deepLinkListeners).forEach((listener) => {
    try {
      listener(link);
    } catch {
      /* ignore listener failures */
    }
  });
}

function getCapacitor(): CapacitorRuntime | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: CapacitorRuntime }).Capacitor;
  return cap ?? null;
}

export function isNativeCapacitorApp(): boolean {
  const cap = getCapacitor();
  return Boolean(cap?.isNativePlatform?.());
}

function getPushPlugin(): PushNotificationsPlugin | null {
  const cap = getCapacitor();
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.PushNotifications ?? null;
}

function parseDeepLinkFromData(data: Record<string, unknown> | undefined): PushDeepLink | null {
  if (!data) return null;
  const type = String(data.type ?? "");
  if (!type) return null;
  const relatedEntityType = data.related_entity_type ?? data.relatedEntityType;
  const relatedEntityId = data.related_entity_id ?? data.relatedEntityId;
  const conversationId = data.conversation_id ?? data.conversationId;
  const postId = data.post_id ?? data.postId;
  const eventId = data.event_id ?? data.eventId;
  const notificationId = data.notification_id ?? data.notificationId;
  return {
    type,
    notificationId: notificationId ? String(notificationId) : undefined,
    conversationId: conversationId ? String(conversationId) : undefined,
    postId: postId ? String(postId) : undefined,
    eventId: eventId ? String(eventId) : undefined,
    relatedEntityType: relatedEntityType ? String(relatedEntityType) : undefined,
    relatedEntityId: relatedEntityId ? String(relatedEntityId) : undefined,
  };
}

async function registerTokenWithBackend(token: string) {
  const cap = getCapacitor();
  const platform = cap?.getPlatform?.() === "android" ? "android" : "ios";
  const environment =
    process.env.NODE_ENV === "production" ? "production" : "development";
  await postAuthed("/api/me/push-devices", {
    platform,
    deviceToken: token,
    appVersion: "1.0",
    environment,
  });
  try {
    window.localStorage.setItem(LAST_TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

let listenersAttached = false;
const listenerHandles: CapPluginListenerHandle[] = [];

async function attachPushListeners(plugin: PushNotificationsPlugin) {
  if (listenersAttached) return;
  listenersAttached = true;

  const registration = await plugin.addListener("registration", (token) => {
    const value = String((token as { value?: string }).value ?? "");
    if (!value) return;
    void registerTokenWithBackend(value).catch((err) => {
      console.warn("[cq:push] token register failed", err);
    });
  });
  listenerHandles.push(registration);

  const regError = await plugin.addListener("registrationError", (err) => {
    console.warn("[cq:push] registrationError", err);
  });
  listenerHandles.push(regError);

  const received = await plugin.addListener("pushNotificationReceived", () => {
    // Foreground: in-app inbox already polls; no extra UI for v1.
  });
  listenerHandles.push(received);

  const action = await plugin.addListener("pushNotificationActionPerformed", (event) => {
    const notification = (event as { notification?: { data?: Record<string, unknown> } }).notification;
    const link = parseDeepLinkFromData(notification?.data);
    if (link) emitDeepLink(link);
  });
  listenerHandles.push(action);
}

/** True when we should show a soft pre-permission sheet (native only, once). */
export function shouldOfferPushPrePermission(): boolean {
  if (!isNativeCapacitorApp()) return false;
  try {
    return window.localStorage.getItem(PROMPT_SEEN_KEY) !== "1";
  } catch {
    return true;
  }
}

export function markPushPrePermissionSeen(): void {
  try {
    window.localStorage.setItem(PROMPT_SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
}

export type PushPermissionStatus = "prompt" | "granted" | "denied" | "unavailable";

export async function checkNativePushPermission(): Promise<PushPermissionStatus> {
  const plugin = getPushPlugin();
  if (!plugin) return "unavailable";
  try {
    const status = await plugin.checkPermissions();
    if (status.receive === "granted") return "granted";
    if (status.receive === "denied") return "denied";
    return "prompt";
  } catch {
    return "unavailable";
  }
}

/**
 * Request OS permission (only after user opt-in from CampusQuest UI),
 * register for APNs, and persist the device token.
 */
export async function enableNativePushNotifications(): Promise<{
  ok: boolean;
  status: PushPermissionStatus;
  message?: string;
}> {
  const plugin = getPushPlugin();
  if (!plugin) return { ok: false, status: "unavailable", message: "Not running in the iOS app." };

  markPushPrePermissionSeen();
  await attachPushListeners(plugin);

  const current = await plugin.checkPermissions();
  let receive = current.receive;
  if (receive !== "granted") {
    const requested = await plugin.requestPermissions();
    receive = requested.receive;
  }

  if (receive !== "granted") {
    return {
      ok: false,
      status: receive === "denied" ? "denied" : "prompt",
      message: "Notifications are off. You can enable them in iOS Settings.",
    };
  }

  await plugin.register();
  return { ok: true, status: "granted" };
}

/** Start listening / refresh token if permission already granted (no prompt). */
export async function syncNativePushIfAuthorized(): Promise<void> {
  const plugin = getPushPlugin();
  if (!plugin) return;
  await attachPushListeners(plugin);
  try {
    const status = await plugin.checkPermissions();
    if (status.receive === "granted") {
      await plugin.register();
    }
  } catch (err) {
    console.warn("[cq:push] sync failed", err);
  }
}

/** Disable this device on logout / account switch. */
export async function disableNativePushOnLogout(): Promise<void> {
  if (!isNativeCapacitorApp()) return;
  let token: string | null = null;
  try {
    token = window.localStorage.getItem(LAST_TOKEN_KEY);
  } catch {
    token = null;
  }
  try {
    const accessToken = getAccessToken();
    if (accessToken) {
      await fetch("/api/me/push-devices", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(token ? { deviceToken: token } : { disableAll: true }),
        cache: "no-store",
      });
    }
  } catch {
    /* best-effort */
  }
  try {
    if (token) window.localStorage.removeItem(LAST_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export async function openIosNotificationSettings(): Promise<void> {
  const { openNativeAppSettings } = await import("@/lib/client/capacitorNative");
  await openNativeAppSettings();
}
