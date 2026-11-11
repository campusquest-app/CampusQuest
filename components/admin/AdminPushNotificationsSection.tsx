"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminSectionIntro } from "@/components/admin/AdminUi";
import { ApiRequestError, fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";

type Audience = "opted_in" | "verified_students" | "local_business" | "user";
type DestinationKind = "campus_feed" | "local_businesses" | "events" | "student_perks" | "post" | "event";

type PlanResult = {
  broadcastId: string;
  status: string;
  duplicate: boolean;
  appleContacted: boolean;
  inAppCount: number;
  pushCount: number;
  acceptedCount: number;
  failedCount: number;
  skipped: Record<string, number>;
  message: string;
};

const AUDIENCES: Array<{ id: Audience; label: string }> = [
  { id: "opted_in", label: "All opted-in users" },
  { id: "verified_students", label: "Verified URI students" },
  { id: "local_business", label: "Local Business accounts" },
  { id: "user", label: "A specific user" },
];

const DESTINATIONS: Array<{ id: DestinationKind; label: string }> = [
  { id: "campus_feed", label: "Campus Feed" },
  { id: "local_businesses", label: "Local Businesses" },
  { id: "events", label: "Events" },
  { id: "student_perks", label: "Student Perks" },
  { id: "post", label: "A specific public post" },
  { id: "event", label: "A specific event" },
];

type RegisteredDevice = {
  id: string;
  platform: string;
  environment: string;
  enabled: boolean;
  lastSeenAt: string;
  permissionStatus: string | null;
};

function newKey() {
  return crypto.randomUUID();
}

export function AdminPushNotificationsSection() {
  const [title, setTitle] = useState("CampusQuest Test 🐏");
  const [message, setMessage] = useState("Push notifications are working! Welcome to CampusQuest.");
  const [audience, setAudience] = useState<Audience>("user");
  const [userId, setUserId] = useState("");
  const [accountLabel, setAccountLabel] = useState<string | null>(null);
  const [devices, setDevices] = useState<RegisteredDevice[]>([]);
  const [devicesLoaded, setDevicesLoaded] = useState(false);
  const [apnsReady, setApnsReady] = useState<boolean | null>(null);
  const [category, setCategory] = useState<"announcements" | "perks">("announcements");
  const [destinationKind, setDestinationKind] = useState<DestinationKind>("campus_feed");
  const [targetId, setTargetId] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(newKey);
  const [confirming, setConfirming] = useState<"test" | "audience" | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PlanResult | null>(null);

  const previewTitle = title.trim() || "Notification";
  const previewBody = message.trim() || "Message";
  const destinationLabel = DESTINATIONS.find((item) => item.id === destinationKind)?.label ?? "Campus Feed";

  const destination = useMemo(() => {
    if (destinationKind === "post") return { kind: "post" as const, postId: targetId.trim() };
    if (destinationKind === "event") return { kind: "event" as const, eventId: targetId.trim() };
    return { kind: destinationKind };
  }, [destinationKind, targetId]);

  useEffect(() => {
    let cancelled = false;
    void fetchAuthed<{
      account: { userId: string; username: string | null; displayName: string | null };
      devices: RegisteredDevice[];
      apns: { configured: boolean };
    }>("/api/internal/admin/push-broadcasts")
      .then((data) => {
        if (cancelled) return;
        setApnsReady(data.apns.configured);
        setUserId(data.account.userId);
        setAccountLabel(data.account.displayName || data.account.username || "Signed-in admin");
        setDevices(data.devices);
      })
      .catch(() => {
        if (!cancelled) setAccountLabel(null);
      })
      .finally(() => {
        if (!cancelled) setDevicesLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function changeField<T>(apply: (value: T) => void, value: T) {
    apply(value);
    setIdempotencyKey(newKey());
    setResult(null);
  }

  async function submit(mode: "test" | "audience") {
    setPending(true);
    setError(null);
    try {
      const data = await postAuthed<PlanResult, Record<string, unknown>>("/api/internal/admin/push-broadcasts", {
        idempotencyKey,
        mode,
        audience: mode === "test" ? "user" : audience,
        userId: userId.trim() || null,
        title: title.trim(),
        body: message.trim(),
        category,
        destination,
        confirm: mode === "test" ? "TEST" : confirmText.trim(),
      });
      setResult(data);
      setConfirming(null);
      setConfirmText("");
    } catch (submitError) {
      const text =
        submitError instanceof ApiRequestError
          ? submitError.message
          : submitError instanceof Error
            ? submitError.message
            : "Could not plan the notification.";
      setError(text);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <AdminSectionIntro
        title="Push Notifications"
        description="The test below is filled in for your signed-in admin account. It sends only after you click Send test. Apple’s response does not mean the phone displayed the alert."
      />

      <p className="text-xs text-white/55">
        APNs sender: {apnsReady == null ? "checking…" : apnsReady ? "configured" : "not configured"}
      </p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form
          className="cq-admin-panel space-y-4 p-4"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-white/50">Notification title</span>
            <input
              value={title}
              maxLength={80}
              onChange={(event) => changeField(setTitle, event.target.value)}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-white/50">Message</span>
            <textarea
              value={message}
              maxLength={180}
              rows={3}
              onChange={(event) => changeField(setMessage, event.target.value)}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-white/50">Audience</span>
            <select
              value={audience}
              onChange={(event) => changeField(setAudience, event.target.value as Audience)}
              className="w-full rounded-xl border border-white/15 bg-uri-navy px-3 py-2 text-sm text-white"
            >
              {AUDIENCES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {audience === "user" ? (
            <div className="space-y-2">
              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-white/50">Test account</span>
                <input
                  value={userId}
                  onChange={(event) => changeField(setUserId, event.target.value)}
                  placeholder="Profile id for the test user"
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
                />
              </label>
              <p className="text-xs text-white/55">
                {accountLabel ? `Recipient: ${accountLabel}. ` : ""}
                Send test uses this profile only.
              </p>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/70">
                <p className="font-semibold text-white/80">Registered iPhones</p>
                {!devicesLoaded ? <p className="mt-1">Checking this account…</p> : null}
                {devicesLoaded && devices.length === 0 ? (
                  <p className="mt-1">
                    None yet. On your iPhone, sign in, open Settings, then Push notifications, and allow alerts.
                  </p>
                ) : null}
                {devices.map((device) => (
                  <p key={device.id} className="mt-1">
                    {device.platform} · {device.environment} · {device.enabled ? "active" : "disabled"}
                    {device.permissionStatus ? ` · ${device.permissionStatus}` : ""} · last seen{" "}
                    {new Date(device.lastSeenAt).toLocaleString()}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-white/50">Category</span>
            <select
              value={category}
              onChange={(event) => changeField(setCategory, event.target.value as "announcements" | "perks")}
              className="w-full rounded-xl border border-white/15 bg-uri-navy px-3 py-2 text-sm text-white"
            >
              <option value="announcements">CampusQuest announcements</option>
              <option value="perks">Student Perks (promotional, opt-in)</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-white/50">Destination</span>
            <select
              value={destinationKind}
              onChange={(event) => changeField(setDestinationKind, event.target.value as DestinationKind)}
              className="w-full rounded-xl border border-white/15 bg-uri-navy px-3 py-2 text-sm text-white"
            >
              {DESTINATIONS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {destinationKind === "post" || destinationKind === "event" ? (
            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/50">
                {destinationKind === "post" ? "Public post id" : "Event id"}
              </span>
              <input
                value={targetId}
                onChange={(event) => changeField(setTargetId, event.target.value)}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
              />
            </label>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || !userId.trim()}
              onClick={() => {
                setError(null);
                setConfirming("test");
              }}
              className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Send test notification
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setError(null);
                setConfirmText("");
                setConfirming("audience");
              }}
              className="rounded-xl bg-uri-keaney px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Send to selected audience
            </button>
          </div>
          <p className="text-xs text-white/45">
            A test reaches only the selected user’s registered iPhones. An audience send asks you to type SEND.
            Apple accepting a request does not mean the phone displayed it.
          </p>
        </form>

        <aside className="space-y-3" aria-label="Live preview">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Live preview</p>
          <div className="mx-auto w-[280px] rounded-[2rem] border border-white/15 bg-black p-3 shadow-xl">
            <div className="rounded-[1.4rem] bg-gradient-to-b from-slate-800 to-slate-950 px-3 pb-6 pt-8">
              <p className="text-center text-[11px] text-white/70">9:41</p>
              <div className="mt-6 rounded-2xl bg-white/12 p-3 backdrop-blur">
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-uri-keaney text-[10px] font-bold">CQ</span>
                  <span className="text-[11px] font-semibold text-white/80">CampusQuest</span>
                  <span className="ml-auto text-[10px] text-white/40">now</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-white">{previewTitle}</p>
                <p className="mt-1 text-xs leading-relaxed text-white/75">{previewBody}</p>
              </div>
              <p className="mt-4 text-center text-[10px] text-white/40">Opens {destinationLabel}</p>
            </div>
          </div>
        </aside>
      </div>

      {confirming ? (
        <div className="cq-admin-panel space-y-3 p-4" role="dialog" aria-labelledby="push-confirm-title">
          <h3 id="push-confirm-title" className="font-semibold text-white">
            {confirming === "test" ? "Plan a test for one user?" : "Plan this audience notification?"}
          </h3>
          <p className="text-sm text-white/65">
            {confirming === "test"
              ? "This sends only to the user id above. Other accounts are not included."
              : `Audience: ${AUDIENCES.find((item) => item.id === audience)?.label}. Type SEND to submit it.`}
          </p>
          {confirming === "audience" ? (
            <input
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              aria-label="Type SEND to confirm"
              className="w-full max-w-xs rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
            />
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending || (confirming === "audience" && confirmText.trim() !== "SEND")}
              onClick={() => void submit(confirming)}
              className="rounded-xl bg-uri-keaney px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {pending ? "Sending…" : confirming === "test" ? "Send test" : "Send"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(null)}
              className="rounded-xl px-4 py-2 text-sm text-white/70"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-amber-300" role="alert">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className="cq-admin-panel space-y-1 p-4 text-sm text-white/80">
          <p>{result.message}</p>
          <p>Apple accepted a request: {result.appleContacted ? "yes" : "no"}</p>
          <p>
            Accepted {result.acceptedCount}. Rejected or not sent {result.failedCount}. In-app {result.inAppCount}.
            Duplicate: {result.duplicate ? "yes" : "no"}.
          </p>
          <p className="text-xs text-white/45">Plan {result.broadcastId}</p>
        </div>
      ) : null}
    </div>
  );
}
