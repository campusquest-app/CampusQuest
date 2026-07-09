"use client";

/**
 * Soft radial aura behind a Realm map pin. Colors come from the marker's
 * tone palette (`--cq-marker-glow`); active markers breathe, the selected
 * marker gets a stronger aura plus a persistent glowing ring.
 */
export function MagicalMarkerGlow({
  active = false,
  selected = false,
}: {
  active?: boolean;
  selected?: boolean;
}) {
  const auraClass = [
    "cq-marker-aura",
    active ? "cq-marker-aura--active" : "",
    selected ? "cq-marker-aura--selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <span className={auraClass} aria-hidden />
      {selected ? <span className="cq-marker-aura-ring" aria-hidden /> : null}
    </>
  );
}
