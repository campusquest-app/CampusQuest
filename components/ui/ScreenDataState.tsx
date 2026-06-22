"use client";

import type { ReactNode } from "react";

type ScreenDataStateBase = {
  className?: string;
  compact?: boolean;
};

type LoadingState = ScreenDataStateBase & {
  variant: "loading";
  message?: string;
  children?: ReactNode;
};

type ErrorState = ScreenDataStateBase & {
  variant: "error";
  message: string;
  detail?: string;
  onRetry?: () => void;
  retryLabel?: string;
};

type EmptyState = ScreenDataStateBase & {
  variant: "empty";
  message: string;
  detail?: string;
  action?: ReactNode;
};

export type ScreenDataStateProps = LoadingState | ErrorState | EmptyState;

export function ScreenDataState(props: ScreenDataStateProps) {
  const { className = "", compact = false } = props;
  const shell = `cq-screen-data-state cq-empty-state rounded-2xl border border-white/10 bg-white/[0.03] text-center ${
    compact ? "px-4 py-8" : "px-5 py-10"
  } ${className}`;

  if (props.variant === "loading") {
    return (
      <div className={shell} role="status" aria-live="polite" aria-busy="true">
        <span
          className="mx-auto mb-3 inline-block h-7 w-7 rounded-full border-2 border-uri-keaney/35 border-t-uri-keaney animate-spin"
          aria-hidden
        />
        <p className="text-sm font-medium text-white/80">{props.message ?? "Loading…"}</p>
        {props.children}
      </div>
    );
  }

  if (props.variant === "error") {
    return (
      <div className={`${shell} border-rose-400/30 bg-rose-500/[0.06]`} role="alert">
        <p className="text-sm font-semibold text-rose-100">{props.message}</p>
        {props.detail ? <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-rose-100/75">{props.detail}</p> : null}
        {props.onRetry ? (
          <button
            type="button"
            onClick={props.onRetry}
            className="mt-4 inline-flex items-center justify-center rounded-xl border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
          >
            {props.retryLabel ?? "Retry"}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={shell} role="status">
      <p className="text-sm font-semibold text-white/90">{props.message}</p>
      {props.detail ? <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-white/55">{props.detail}</p> : null}
      {props.action ? <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{props.action}</div> : null}
    </div>
  );
}
