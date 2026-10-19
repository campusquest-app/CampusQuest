"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { getAppToast, subscribeAppToast } from "@/lib/client/appToast";

/**
 * Viewport-fixed toast above the bottom nav. Feed banners that sit in the
 * document under Memories are never used for Ember / reaction feedback.
 */
export function AppToastHost() {
  const toast = useSyncExternalStore(subscribeAppToast, getAppToast, () => null);
  if (!toast || typeof document === "undefined") return null;

  return createPortal(
    <div className="cq-app-toast-host" role="status" aria-live="polite" aria-atomic="true">
      <p className={`cq-app-toast cq-app-toast--${toast.tone}`} key={toast.id}>
        {toast.message}
      </p>
    </div>,
    document.body,
  );
}
