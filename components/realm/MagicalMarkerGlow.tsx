"use client";

/**
 * Atmospheric aura + particle shimmer behind a Realm magical pin.
 * Colors come from the marker's assigned palette (`--cq-marker-glow`).
 * Decorative only — never intercepts pointer events.
 */
export function MagicalMarkerGlow({
  active = false,
  selected = false,
  particleCount = 0,
}: {
  active?: boolean;
  selected?: boolean;
  particleCount?: number;
}) {
  const auraClass = [
    "marker-aura",
    active ? "marker-aura--active" : "",
    selected ? "marker-aura--selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <span className={auraClass} aria-hidden />
      {particleCount > 0 ? (
        <span className="marker-particles" aria-hidden>
          {Array.from({ length: particleCount }, (_, i) => (
            <span
              key={i}
              className="marker-particle"
              style={{
                ["--p-i" as string]: i,
                ["--p-n" as string]: particleCount,
                animationDelay: `${(i * -2.4) / Math.max(1, particleCount)}s`,
              }}
            />
          ))}
        </span>
      ) : null}
      {selected ? <span className="marker-aura-ring" aria-hidden /> : null}
    </>
  );
}
