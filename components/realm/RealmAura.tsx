"use client";

/**
 * Static ambient "realm energy" over the map surface: deep-navy edge tint,
 * vignette, glowing frame, and fantasy HUD corner brackets. Pure CSS,
 * pointer-events: none — map gestures and controls are unaffected.
 */
export function RealmAura() {
  return (
    <div className="cq-realm-aura" aria-hidden>
      <span className="cq-realm-aura-tint" />
      <span className="cq-realm-aura-vignette" />
      <span className="cq-realm-aura-frame" />
      <span className="cq-realm-aura-corner cq-realm-aura-corner--tl" />
      <span className="cq-realm-aura-corner cq-realm-aura-corner--tr" />
      <span className="cq-realm-aura-corner cq-realm-aura-corner--bl" />
      <span className="cq-realm-aura-corner cq-realm-aura-corner--br" />
    </div>
  );
}
