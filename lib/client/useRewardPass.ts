"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, requestRewardPass, rewardIssueFromUnknown } from "@/lib/client/partnersApi";
import { rewardPassSecondsLeft, type RewardAccessIssue, type StudentRewardPass } from "@/lib/partners/rewardAccess";

/** Ask for a fresh pass this many seconds before the current one runs out. */
export const REWARD_PASS_REFRESH_LEAD_SECONDS = 12;

export type RewardPassState =
  | { status: "loading" }
  | { status: "active"; pass: StudentRewardPass; secondsLeft: number; refreshing: boolean; serverNowMs: number }
  | { status: "lapsed"; pass: StudentRewardPass }
  | { status: "issue"; issue: RewardAccessIssue; message: string | null };

/** Issues that mean the account or offer stopped qualifying; the pass must disappear immediately. */
const HARD_ISSUES: ReadonlySet<RewardAccessIssue> = new Set<RewardAccessIssue>([
  "login_required",
  "verification_required",
  "ineligible",
  "coming_soon",
  "expired",
  "unavailable",
]);

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function monotonicNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** Server time when the pass arrived, paired with device wall-clock and monotonic readings taken at the same moment. */
export type ServerClockAnchor = { serverMs: number; wallMs: number; monoMs: number };

/**
 * Current server time estimated from the anchor. Uses whichever device clock reports more elapsed time:
 * moving the wall clock backwards cannot stretch a pass, and a monotonic clock paused by device sleep
 * cannot either.
 */
export function estimateServerNowMs(anchor: ServerClockAnchor, wallNowMs: number, monoNowMs: number): number {
  const elapsed = Math.max(0, wallNowMs - anchor.wallMs, monoNowMs - anchor.monoMs);
  return anchor.serverMs + elapsed;
}

/**
 * Server-issued reward pass lifecycle: fetch, count down on the server clock, refresh before expiry,
 * and stop showing the pass as valid when it expires, the server denies it, or the device goes offline.
 */
export function useRewardPass(partnerId: string): { state: RewardPassState; retry: () => void } {
  const [pass, setPass] = useState<StudentRewardPass | null>(null);
  const [anchor, setAnchor] = useState<ServerClockAnchor | null>(null);
  const [issue, setIssue] = useState<{ issue: RewardAccessIssue; message: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const inFlight = useRef(false);
  const authorized = useRef(false);
  const mounted = useRef(true);
  const lastRefreshAttempt = useRef(0);

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      if (inFlight.current) return;
      if (!isOnline()) {
        setPass(null);
        setIssue({ issue: "offline", message: null });
        setLoading(false);
        return;
      }
      inFlight.current = true;
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      try {
        const sentAt = Date.now();
        const sentMono = monotonicNow();
        const { pass: next } = await requestRewardPass(partnerId, authorized.current);
        if (!mounted.current) return;
        const receivedAt = Date.now();
        const receivedMono = monotonicNow();
        const serverNow = Date.parse(next.serverNow);
        if (!Number.isFinite(serverNow)) throw new Error("Invalid pass timestamp");
        authorized.current = true;
        setAnchor({
          serverMs: serverNow,
          wallMs: (sentAt + receivedAt) / 2,
          monoMs: (sentMono + receivedMono) / 2,
        });
        setPass(next);
        setIssue(null);
        setNowMs(receivedAt);
      } catch (error) {
        if (!mounted.current) return;
        const nextIssue = rewardIssueFromUnknown(error);
        const message = errorMessage(error, "") || null;
        if (mode === "initial" || HARD_ISSUES.has(nextIssue) || nextIssue === "offline") {
          setPass(null);
          setIssue({ issue: nextIssue, message: HARD_ISSUES.has(nextIssue) ? message : null });
        }
      } finally {
        inFlight.current = false;
        if (mounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [partnerId],
  );

  useEffect(() => {
    mounted.current = true;
    authorized.current = false;
    void load("initial");
    return () => {
      mounted.current = false;
    };
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const serverNowMs = anchor ? estimateServerNowMs(anchor, nowMs, monotonicNow()) : nowMs;
  const secondsLeft = pass && anchor ? rewardPassSecondsLeft(pass, 0, serverNowMs) : 0;

  useEffect(() => {
    if (!pass || issue || refreshing || inFlight.current) return;
    if (secondsLeft <= 0 || secondsLeft > REWARD_PASS_REFRESH_LEAD_SECONDS) return;
    if (Date.now() - lastRefreshAttempt.current < 4000) return;
    lastRefreshAttempt.current = Date.now();
    void load("refresh");
  }, [pass, issue, refreshing, secondsLeft, load]);

  useEffect(() => {
    const goOffline = () => {
      setPass(null);
      setIssue({ issue: "offline", message: null });
    };
    const goOnline = () => void load(authorized.current ? "refresh" : "initial");
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setNowMs(Date.now());
        void load(authorized.current ? "refresh" : "initial");
      }
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const retry = useCallback(() => void load(authorized.current ? "refresh" : "initial"), [load]);

  let state: RewardPassState;
  if (issue) state = { status: "issue", issue: issue.issue, message: issue.message };
  else if (loading && !pass) state = { status: "loading" };
  else if (pass && secondsLeft > 0) state = { status: "active", pass, secondsLeft, refreshing, serverNowMs };
  else if (pass) state = { status: "lapsed", pass };
  else state = { status: "loading" };

  return { state, retry };
}
