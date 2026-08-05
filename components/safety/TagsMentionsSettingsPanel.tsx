"use client";

import { useEffect, useState } from "react";
import { DrawerSubPanelShell } from "@/components/DrawerSubPanelShell";
import { fetchAuthed, patchAuthed } from "@/lib/client/dashboardApi";

type Prefs = {
  allowTagsFrom: "everyone" | "following" | "nobody";
  allowMentionsFrom: "everyone" | "following" | "nobody";
  manuallyApproveTags: boolean;
};

const OPTIONS: { value: Prefs["allowTagsFrom"]; label: string }[] = [
  { value: "everyone", label: "Allow from everyone" },
  { value: "following", label: "Allow from people you follow" },
  { value: "nobody", label: "Don’t allow" },
];

export function TagsMentionsSettingsPanel({ onBack }: { onBack: () => void }) {
  const [prefs, setPrefs] = useState<Prefs>({
    allowTagsFrom: "everyone",
    allowMentionsFrom: "everyone",
    manuallyApproveTags: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchAuthed<Prefs>("/api/me/tag-preferences")
      .then((data) => {
        if (!cancelled) {
          setPrefs({
            allowTagsFrom: data.allowTagsFrom,
            allowMentionsFrom: data.allowMentionsFrom,
            manuallyApproveTags: data.manuallyApproveTags,
          });
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load settings.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(next: Partial<Prefs>) {
    setSaving(true);
    setError(null);
    try {
      const data = await patchAuthed<Prefs, Record<string, unknown>>("/api/me/tag-preferences", {
        allowTagsFrom: next.allowTagsFrom,
        allowMentionsFrom: next.allowMentionsFrom,
        manuallyApproveTags: next.manuallyApproveTags,
      });
      setPrefs({
        allowTagsFrom: data.allowTagsFrom,
        allowMentionsFrom: data.allowMentionsFrom,
        manuallyApproveTags: data.manuallyApproveTags,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DrawerSubPanelShell title="Tags and mentions" onBack={onBack}>
      <div className="space-y-5 px-1 pb-8">
        {loading ? <p className="text-sm text-white/55">Loading…</p> : null}
        {error ? (
          <p className="text-sm text-amber-400" role="alert">
            {error}
          </p>
        ) : null}

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-white">Who can tag you</h3>
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={saving || loading}
              onClick={() => void save({ ...prefs, allowTagsFrom: opt.value })}
              className={`flex w-full min-h-[44px] items-center rounded-xl border px-3 text-left text-sm ${
                prefs.allowTagsFrom === opt.value
                  ? "border-uri-keaney bg-uri-keaney/15 text-white"
                  : "border-white/12 bg-white/[0.04] text-white/80"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-white">Who can mention you</h3>
          {OPTIONS.map((opt) => (
            <button
              key={`m-${opt.value}`}
              type="button"
              disabled={saving || loading}
              onClick={() => void save({ ...prefs, allowMentionsFrom: opt.value })}
              className={`flex w-full min-h-[44px] items-center rounded-xl border px-3 text-left text-sm ${
                prefs.allowMentionsFrom === opt.value
                  ? "border-uri-keaney bg-uri-keaney/15 text-white"
                  : "border-white/12 bg-white/[0.04] text-white/80"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </section>

        <section>
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void save({ ...prefs, manuallyApproveTags: !prefs.manuallyApproveTags })}
            className={`flex w-full min-h-[48px] items-center justify-between rounded-xl border px-3 text-sm ${
              prefs.manuallyApproveTags
                ? "border-uri-keaney bg-uri-keaney/15 text-white"
                : "border-white/12 bg-white/[0.04] text-white/80"
            }`}
          >
            <span>
              <span className="block font-semibold">Manually approve tags</span>
              <span className="block text-xs text-white/55">
                Review tags before they appear on your profile.
              </span>
            </span>
            <span aria-hidden>{prefs.manuallyApproveTags ? "On" : "Off"}</span>
          </button>
        </section>
      </div>
    </DrawerSubPanelShell>
  );
}
