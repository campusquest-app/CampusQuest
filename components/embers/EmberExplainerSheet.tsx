"use client";

import { Flame } from "lucide-react";
import { EMBER_COLOR_ACTIVE, EMBER_COPY } from "@/lib/embers";

export function EmberExplainerSheet({
  open,
  onAcknowledge,
  body = EMBER_COPY.explainerBody,
}: {
  open: boolean;
  onAcknowledge: () => void;
  body?: string;
}) {
  if (!open) return null;

  return (
    <div className="cq-ember-explainer" role="dialog" aria-labelledby="cq-ember-explainer-title" aria-modal="true">
      <button type="button" className="cq-ember-explainer__backdrop" aria-label="Dismiss" onClick={onAcknowledge} />
      <div className="cq-ember-explainer__sheet">
        <div className="cq-ember-explainer__icon" aria-hidden>
          <Flame size={22} strokeWidth={2} color={EMBER_COLOR_ACTIVE} />
        </div>
        <h2 id="cq-ember-explainer-title" className="cq-ember-explainer__title">
          {EMBER_COPY.explainerTitle}
        </h2>
        <p className="cq-ember-explainer__body">{body}</p>
        <button type="button" className="cq-ember-explainer__ack" onClick={onAcknowledge}>
          {EMBER_COPY.explainerAck}
        </button>
      </div>
    </div>
  );
}
