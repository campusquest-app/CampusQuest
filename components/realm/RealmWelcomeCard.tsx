"use client";

import { useEffect } from "react";
import { Sparkles, X } from "lucide-react";

/**
 * First-open floating tip. Dismisses on Close, or when the parent calls
 * onDismiss after the user taps a landmark / quick action / map control.
 */
export function RealmWelcomeCard({
  visible,
  onDismiss,
}: {
  visible: boolean;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!visible) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, onDismiss]);

  if (!visible) return null;

  return (
    <aside className="cq-realm-welcome-card" role="dialog" aria-label="Welcome to The Realm">
      <div className="cq-realm-welcome-card-head">
        <span className="cq-realm-welcome-card-emoji" aria-hidden>
          👋
        </span>
        <p className="cq-realm-welcome-card-title">Welcome to The Realm</p>
        <button
          type="button"
          className="cq-realm-welcome-card-close touch-manipulation"
          onClick={onDismiss}
          aria-label="Dismiss welcome tip"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.4} />
        </button>
      </div>
      <ul className="cq-realm-welcome-card-list">
        <li>
          <Sparkles className="cq-realm-welcome-card-bullet" aria-hidden />
          Tap any landmark
        </li>
        <li>
          <Sparkles className="cq-realm-welcome-card-bullet" aria-hidden />
          Discover quests
        </li>
        <li>
          <Sparkles className="cq-realm-welcome-card-bullet" aria-hidden />
          Find live events
        </li>
      </ul>
    </aside>
  );
}
