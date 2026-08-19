"use client";

/**
 * Thin Capacitor bridge for the remote WebView shell.
 * Uses the injected `window.Capacitor` runtime from /native — no root @capacitor deps.
 * All helpers no-op safely in ordinary browsers.
 */

type CapPluginListenerHandle = { remove: () => void | Promise<void> };

type CapacitorRuntime = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: {
    Browser?: { open: (opts: { url: string }) => Promise<void> };
    Share?: {
      share: (opts: {
        title?: string;
        text?: string;
        url?: string;
        dialogTitle?: string;
      }) => Promise<unknown>;
    };
    Haptics?: {
      impact: (opts: { style: "LIGHT" | "MEDIUM" | "HEAVY" }) => Promise<void>;
      notification?: (opts: { type: "SUCCESS" | "WARNING" | "ERROR" }) => Promise<void>;
    };
    StatusBar?: {
      setStyle?: (opts: { style: string }) => Promise<void>;
      show?: () => Promise<void>;
      setBackgroundColor?: (opts: { color: string }) => Promise<void>;
    };
    Keyboard?: {
      setAccessoryBarVisible?: (opts: { isVisible: boolean }) => Promise<void>;
      addListener?: (
        event: string,
        cb: (payload: Record<string, unknown>) => void,
      ) => Promise<CapPluginListenerHandle> | CapPluginListenerHandle;
    };
    App?: {
      openUrl?: (opts: { url: string }) => Promise<void>;
    };
    SplashScreen?: {
      hide?: (opts?: { fadeOutDuration?: number }) => Promise<void>;
    };
  };
};

function getCapacitor(): CapacitorRuntime | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { Capacitor?: CapacitorRuntime }).Capacitor ?? null;
}

export function isNativeCapacitorApp(): boolean {
  return Boolean(getCapacitor()?.isNativePlatform?.());
}

/** Open http(s)/mailto/maps links outside the WebView when possible. */
export async function openExternalUrl(url: string): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) return;
  const cap = getCapacitor();
  if (cap?.isNativePlatform?.()) {
    try {
      if (cap.Plugins?.Browser?.open) {
        await cap.Plugins.Browser.open({ url: trimmed });
        return;
      }
    } catch {
      /* fall through */
    }
  }
  if (typeof window !== "undefined") {
    window.open(trimmed, "_blank", "noopener,noreferrer");
  }
}

export async function nativeShare(data: {
  title?: string;
  text?: string;
  url?: string;
}): Promise<"shared" | "copied" | "cancelled" | "unavailable"> {
  const cap = getCapacitor();
  if (cap?.isNativePlatform?.() && cap.Plugins?.Share?.share) {
    try {
      await cap.Plugins.Share.share({
        title: data.title,
        text: data.text,
        url: data.url,
        dialogTitle: data.title,
      });
      return "shared";
    } catch {
      return "cancelled";
    }
  }
  try {
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({
        title: data.title,
        text: data.text,
        url: data.url,
      });
      return "shared";
    }
  } catch {
    return "cancelled";
  }
  try {
    const blob = [data.text, data.url].filter(Boolean).join(" ").trim();
    if (blob && typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(blob);
      return "copied";
    }
  } catch {
    /* ignore */
  }
  return "unavailable";
}

export async function nativeImpact(style: "light" | "medium" | "heavy" = "light"): Promise<void> {
  const cap = getCapacitor();
  const map = { light: "LIGHT", medium: "MEDIUM", heavy: "HEAVY" } as const;
  if (cap?.isNativePlatform?.() && cap.Plugins?.Haptics?.impact) {
    try {
      await cap.Plugins.Haptics.impact({ style: map[style] });
      return;
    } catch {
      /* fall through */
    }
  }
  try {
    navigator.vibrate?.(style === "heavy" ? 28 : style === "medium" ? 18 : 10);
  } catch {
    /* ignore */
  }
}

/** Hide the Capacitor launch splash once the web splash is painted. No-ops on web. */
export async function hideNativeSplashScreen(): Promise<void> {
  const cap = getCapacitor();
  if (!cap?.isNativePlatform?.()) return;
  try {
    await cap.Plugins?.SplashScreen?.hide?.({ fadeOutDuration: 180 });
  } catch {
    /* plugin optional */
  }
}

/** Keep status bar readable over CampusQuest dark chrome. */
export async function configureNativeChrome(): Promise<void> {
  const cap = getCapacitor();
  if (!cap?.isNativePlatform?.()) return;
  try {
    await cap.Plugins?.StatusBar?.setStyle?.({ style: "DARK" });
    await cap.Plugins?.StatusBar?.setBackgroundColor?.({ color: "#07111f" });
    await cap.Plugins?.StatusBar?.show?.();
  } catch {
    /* plugin optional */
  }
  try {
    await cap.Plugins?.Keyboard?.setAccessoryBarVisible?.({ isVisible: true });
  } catch {
    /* plugin optional */
  }
}

/** Open iOS Settings for CampusQuest (for denied notification permission). */
export async function openNativeAppSettings(): Promise<void> {
  const cap = getCapacitor();
  if (!cap?.isNativePlatform?.()) return;
  const candidates = ["app-settings:", "App-Prefs:root=NOTIFICATIONS_ID"];
  for (const url of candidates) {
    try {
      if (cap.Plugins?.Browser?.open) {
        await cap.Plugins.Browser.open({ url });
        return;
      }
    } catch {
      /* try next */
    }
  }
  try {
    window.location.href = "app-settings:";
  } catch {
    /* ignore */
  }
}
