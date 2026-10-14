"use client";

import { useEffect, useRef } from "react";
import {
  AlertTriangle,
  Clock,
  Loader2,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Store,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";
import { PartnerOverlayPortal } from "@/components/partners/PartnerOverlayPortal";
import { useRegisterImmersiveScreen } from "@/lib/client/nestedImmersiveScreen";
import { useLiveClock } from "@/lib/client/useLiveClock";
import { useRewardPass, type RewardPassState } from "@/lib/client/useRewardPass";
import {
  REWARD_ISSUE_COPY,
  REWARD_PASS_TTL_SECONDS,
  type RewardAccessIssue,
  type StudentRewardPass as Pass,
} from "@/lib/partners/rewardAccess";
import type { Partner } from "@/lib/partners/types";

type WakeLockSentinelLike = { release: () => Promise<void> };

/** Keeps the screen awake while a valid pass is showing so it doesn't dim in front of the cashier. */
function useScreenWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> } };
    if (!nav.wakeLock) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;
    nav.wakeLock
      .request("screen")
      .then((lock) => {
        if (cancelled) void lock.release().catch(() => {});
        else sentinel = lock;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}

export function StudentRewardPass({ partner, onClose }: { partner: Partner; onClose: () => void }) {
  useRegisterImmersiveScreen(true);
  const { state, retry } = useRewardPass(partner.id);
  const clock = useLiveClock(1000);
  useScreenWakeLock(state.status === "active");
  return (
    <PartnerOverlayPortal>
      <RewardPassView partner={partner} state={state} clock={clock} onClose={onClose} onRetry={retry} />
    </PartnerOverlayPortal>
  );
}

const ISSUE_ICONS: Record<RewardAccessIssue, LucideIcon> = {
  coming_soon: Clock,
  expired: Clock,
  unavailable: Clock,
  login_required: Lock,
  verification_required: ShieldAlert,
  ineligible: ShieldAlert,
  offline: WifiOff,
  error: AlertTriangle,
};

function formatClock(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function PassLogo({ pass, partner }: { pass: Pass; partner: Partner }) {
  const src = pass.partnerLogoUrl ?? partner.logoUrl;
  return (
    <span className="cq-pass__logo">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" decoding="async" />
      ) : (
        <Store className="h-6 w-6" aria-hidden strokeWidth={2} />
      )}
    </span>
  );
}

function PassCard({
  pass,
  partner,
  valid,
  secondsLeft,
  refreshing,
  clock,
  onRetry,
}: {
  pass: Pass;
  partner: Partner;
  valid: boolean;
  secondsLeft: number;
  refreshing: boolean;
  clock: Date;
  onRetry: () => void;
}) {
  const progress = Math.max(0, Math.min(1, secondsLeft / REWARD_PASS_TTL_SECONDS));
  return (
    <>
      <section className={`cq-pass__card${valid ? " is-valid" : " is-lapsed"}`} aria-label="Student reward pass">
        <span className="cq-pass__glow" aria-hidden />
        <div className="cq-pass__biz">
          <PassLogo pass={pass} partner={partner} />
          <span className="cq-pass__biz-name">{pass.partnerName}</span>
        </div>

        {pass.discountValue ? <p className="cq-pass__discount">{pass.discountValue}</p> : null}
        {pass.offerTitle ? <p className="cq-pass__offer">{pass.offerTitle}</p> : null}
        {pass.offerDescription ? <p className="cq-pass__offer-desc">{pass.offerDescription}</p> : null}

        {valid ? (
          <>
            <div className="cq-pass__verified">
              <ShieldCheck className="h-4 w-4" aria-hidden strokeWidth={2.4} />
              {pass.verifiedLabel}
            </div>
            {pass.studentName ? <p className="cq-pass__student">{pass.studentName}</p> : null}
            <div className="cq-pass__live">
              <span className="cq-pass__live-row">
                <span className="cq-pass__live-dot" aria-hidden />
                <span className="cq-pass__live-label">Live</span>
                <time className="cq-pass__live-time" dateTime={clock.toISOString()}>
                  {formatClock(clock)}
                </time>
                <span className="cq-pass__live-id">Pass {pass.passId}</span>
              </span>
              <span className="cq-pass__sweep" aria-hidden />
            </div>
            <div className="cq-pass__validity" role="status">
              <span className="cq-pass__meter" aria-hidden>
                <span className="cq-pass__meter-fill" style={{ transform: `scaleX(${progress})` }} />
              </span>
              <span className="cq-pass__validity-text">
                {refreshing ? "Refreshing pass\u2026" : `Valid for ${secondsLeft}s \u00b7 refreshes automatically`}
              </span>
            </div>
          </>
        ) : (
          <div className="cq-pass__lapsed" role="alert">
            <p className="cq-pass__lapsed-title">Pass expired</p>
            <p className="cq-pass__lapsed-text">This pass is no longer valid. Refresh to verify again.</p>
            <button type="button" className="cq-perk-btn cq-perk-btn--primary cq-tap-press touch-manipulation" onClick={onRetry}>
              <RefreshCw className="h-4 w-4" aria-hidden strokeWidth={2.3} />
              Refresh pass
            </button>
          </div>
        )}
      </section>

      {valid ? <p className="cq-pass__checkout">Show this screen at checkout</p> : null}
      {valid && pass.redemptionInstructions ? <p className="cq-pass__note">{pass.redemptionInstructions}</p> : null}
      {pass.rewardTerms ? <p className="cq-pass__terms">{pass.rewardTerms}</p> : null}
      <p className="cq-pass__disclaimer">
        This live pass shows CampusQuest checked your student status within the last minute. It is not a payment,
        receipt, or proof of purchase.
      </p>
    </>
  );
}

function IssueView({
  issue,
  message,
  onRetry,
  onClose,
}: {
  issue: RewardAccessIssue;
  message: string | null;
  onRetry: () => void;
  onClose: () => void;
}) {
  const Icon = ISSUE_ICONS[issue];
  const copy = REWARD_ISSUE_COPY[issue];
  const canRetry = issue === "offline" || issue === "error";
  return (
    <section className={`cq-pass__issue cq-pass__issue--${issue}`} role="alert">
      <span className="cq-pass__issue-icon" aria-hidden>
        <Icon className="h-7 w-7" strokeWidth={2.1} />
      </span>
      <h3 className="cq-pass__issue-title">{copy.title}</h3>
      <p className="cq-pass__issue-text">{message || copy.body}</p>
      <div className="cq-pass__issue-actions">
        {canRetry ? (
          <button type="button" className="cq-perk-btn cq-perk-btn--primary cq-tap-press touch-manipulation" onClick={onRetry}>
            <RefreshCw className="h-4 w-4" aria-hidden strokeWidth={2.3} />
            Try again
          </button>
        ) : null}
        <button type="button" className="cq-perk-btn cq-perk-btn--secondary cq-tap-press touch-manipulation" onClick={onClose}>
          Close
        </button>
      </div>
    </section>
  );
}

export function RewardPassView({
  partner,
  state,
  clock,
  onClose,
  onRetry,
}: {
  partner: Partner;
  state: RewardPassState;
  clock: Date;
  onClose: () => void;
  onRetry: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const titleId = `cq-pass-${partner.id}-title`;

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="cq-pass" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="cq-pass__inner">
        <header className="cq-pass__top">
          <button
            ref={closeRef}
            type="button"
            className="cq-perk-iconbtn cq-tap-press touch-manipulation"
            onClick={onClose}
            aria-label="Close reward pass"
          >
            <X className="h-5 w-5" aria-hidden strokeWidth={2.4} />
          </button>
          <h2 id={titleId} className="cq-pass__brand">
            CampusQuest <span>Community Quests</span>
          </h2>
          <span className="cq-pass__top-spacer" aria-hidden />
        </header>

        {state.status === "loading" ? (
          <section className="cq-pass__loading" role="status">
            <Loader2 className="h-7 w-7 cq-pass__spinner" aria-hidden strokeWidth={2.2} />
            <p>Verifying your student status{"\u2026"}</p>
          </section>
        ) : state.status === "issue" ? (
          <IssueView issue={state.issue} message={state.message} onRetry={onRetry} onClose={onClose} />
        ) : (
          <PassCard
            pass={state.pass}
            partner={partner}
            valid={state.status === "active"}
            secondsLeft={state.status === "active" ? state.secondsLeft : 0}
            refreshing={state.status === "active" && state.refreshing}
            clock={state.status === "active" ? new Date(state.serverNowMs) : clock}
            onRetry={onRetry}
          />
        )}
      </div>
    </div>
  );
}
