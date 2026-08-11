"use client";

import { useEffect, useState } from "react";
import { DrawerSubPanelShell } from "@/components/DrawerSubPanelShell";
import { fetchAuthed, patchAuthed } from "@/lib/client/dashboardApi";
import {
  checkNativePushPermission,
  enableNativePushNotifications,
  isNativeCapacitorApp,
  openIosNotificationSettings,
  syncNativePushIfAuthorized,
} from "@/lib/client/nativePush";

type Settings = {
  pushEnabled: boolean;
  messagesEnabled: boolean;
  socialEnabled: boolean;
  eventsEnabled: boolean;
};

export function PushNotificationsSettingsPanel({ onBack }: { onBack: () => void }) {
  const native = isNativeCapacitorApp();
  const [settings, setSettings] = useState<Settings>({
    pushEnabled: true,
    messagesEnabled: true,
    socialEnabled: true,
    eventsEnabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [osStatus, setOsStatus] = useState<"prompt" | "granted" | "denied" | "unavailable">("unavailable");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchAuthed<{ settings: Settings }>("/api/me/push-settings");
        if (!cancelled) setSettings(data.settings);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
      if (native) {
        const status = await checkNativePushPermission();
        if (!cancelled) setOsStatus(status);
        if (status === "granted") void syncNativePushIfAuthorized();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [native]);

  async function save(next: Partial<Settings>) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const data = await patchAuthed<{ settings: Settings }, Partial<Settings>>(
        "/api/me/push-settings",
        next,
      );
      setSettings(data.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleEnableOs() {
    setError(null);
    setMessage(null);
    const result = await enableNativePushNotifications();
    setOsStatus(result.status);
    if (result.ok) {
      setMessage("Push notifications enabled for this iPhone.");
      await save({ pushEnabled: true });
    } else {
      setError(result.message ?? "Could not enable notifications.");
    }
  }

  return (
    <DrawerSubPanelShell title="Push notifications" onBack={onBack}>
      <div className="space-y-5 px-1 pb-8">
        {loading ? <p className="text-sm text-white/55">Loading…</p> : null}
        {error ? (
          <p className="text-sm text-amber-400" role="alert">
            {error}
          </p>
        ) : null}
        {message ? <p className="text-sm text-emerald-300/90">{message}</p> : null}

        {native ? (
          <section className="rounded-2xl border border-white/[0.08] bg-cq-card/60 p-4 space-y-3">
            <p className="text-sm font-semibold text-white">iPhone permission</p>
            <p className="text-xs text-white/55 leading-relaxed">
              CampusQuest can send alerts for messages, connection requests, tags, and important updates.
              We never request OS permission until you choose Enable.
            </p>
            {osStatus === "granted" ? (
              <p className="text-xs text-emerald-300/90">System notifications are allowed.</p>
            ) : osStatus === "denied" ? (
              <div className="space-y-2">
                <p className="text-xs text-amber-200/90">
                  Notifications are blocked in iOS Settings. CampusQuest cannot prompt again from the app.
                </p>
                <button
                  type="button"
                  onClick={() => void openIosNotificationSettings()}
                  className="text-sm font-medium text-cyan-300"
                >
                  Open iOS Settings
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleEnableOs()}
                className="rounded-xl bg-uri-keaney px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Enable push notifications
              </button>
            )}
          </section>
        ) : (
          <p className="text-sm text-white/55">
            Install the CampusQuest iOS app to receive push alerts. Web uses the in-app inbox.
          </p>
        )}

        <section className="rounded-2xl border border-white/[0.08] bg-cq-card/60 divide-y divide-white/[0.06]">
          {(
            [
              ["pushEnabled", "Push notifications", "Master switch for native alerts"],
              ["messagesEnabled", "Messages", "Direct and group message alerts"],
              ["socialEnabled", "Social activity", "Tags, mentions, comments, connection requests"],
              ["eventsEnabled", "Events & opportunities", "Organization and event announcements"],
            ] as const
          ).map(([key, label, description]) => (
            <label key={key} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <span className="block text-sm font-medium text-white">{label}</span>
                <span className="block text-xs text-white/45">{description}</span>
              </span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-sky-400"
                checked={settings[key]}
                disabled={saving || loading}
                onChange={(e) => void save({ [key]: e.target.checked })}
              />
            </label>
          ))}
        </section>
      </div>
    </DrawerSubPanelShell>
  );
}
