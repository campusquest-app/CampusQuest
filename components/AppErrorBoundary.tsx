"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { CampusQuestLogo } from "@/components/CampusQuestLogo";
import { logError } from "@/lib/errorLogger";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logError(error, {
      component: "AppErrorBoundary",
      meta: { componentStack: info.componentStack },
    });
  }

  private handleTryAgain = (): void => {
    this.setState({ hasError: false, error: null });
  };

  private handleGoToQuad = (): void => {
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-uri-navy bg-gradient-to-b from-uri-navy via-[#061e3a] to-[#041a35] px-6 py-10 text-white">
        <CampusQuestLogo variant="auth" className="mb-6 opacity-95" />
        <h1 className="font-display text-xl font-semibold text-white">Something went wrong.</h1>
        <p className="mt-2 max-w-sm text-center text-sm leading-relaxed text-white/60">
          Try again or return to the Quad.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={this.handleTryAgain}
            className="inline-flex min-w-[7.5rem] items-center justify-center rounded-xl bg-uri-keaney px-5 py-2.5 text-sm font-semibold text-uri-navy transition hover:bg-uri-keaney/90"
          >
            Try Again
          </button>
          <button
            type="button"
            onClick={this.handleGoToQuad}
            className="inline-flex min-w-[7.5rem] items-center justify-center rounded-xl border border-white/25 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
          >
            Go to Quad
          </button>
        </div>
      </div>
    );
  }
}
