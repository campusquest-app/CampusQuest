"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { logFailedMarkerClick, getMarkerUnavailableMessage } from "@/lib/realm/safeMarkerClick";

type Props = {
  children: ReactNode;
  markerId?: string | null;
  markerType?: string | null;
  onRecover?: () => void;
};

type State = {
  hasError: boolean;
};

/**
 * Keeps marker / location-sheet render failures local to The Realm so they
 * never bubble into AppErrorBoundary ("Something went wrong.").
 */
export class RealmMarkerErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logFailedMarkerClick({
      markerType: (this.props.markerType as "landmark") ?? "landmark",
      markerId: this.props.markerId ?? "unknown",
      source: "RealmMarkerErrorBoundary",
      lookupResult: "error",
      exception: error,
    });
    console.warn("[cq:realm-marker] sheet render failed", {
      markerId: this.props.markerId,
      markerType: this.props.markerType,
      componentStack: info.componentStack,
      message: error.message,
      stack: error.stack,
    });
  }

  componentDidUpdate(prevProps: Props): void {
    if (this.state.hasError && prevProps.markerId !== this.props.markerId) {
      this.setState({ hasError: false });
    }
  }

  private handleDismiss = (): void => {
    this.setState({ hasError: false });
    this.props.onRecover?.();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        className="fixed inset-x-0 bottom-0 z-[80] flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pointer-events-none"
        role="alert"
      >
        <div className="pointer-events-auto flex max-w-sm items-center gap-3 rounded-2xl border border-white/15 bg-[#0b1f3a]/95 px-4 py-3 text-sm text-white shadow-xl backdrop-blur">
          <p className="flex-1 leading-snug text-white/90">{getMarkerUnavailableMessage()}</p>
          <button
            type="button"
            onClick={this.handleDismiss}
            className="shrink-0 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white touch-manipulation hover:bg-white/25"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }
}
