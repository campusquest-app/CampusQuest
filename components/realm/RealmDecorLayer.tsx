"use client";

/**
 * Layer 2.5 — decorative fantasy flourishes (visual only).
 * Every element is pointer-events: none and positioned away from location pins,
 * so map interactions are never blocked.
 */

type RealmDecor = {
  id: string;
  emoji: string;
  /** Percentage position in the shared 100 × 77.25 map space. */
  x: number;
  y: number;
  size: "sm" | "md";
  /** Animation stagger in seconds. */
  delay: number;
  float?: boolean;
};

const REALM_DECORATIONS: RealmDecor[] = [
  { id: "crystal-west", emoji: "🔮", x: 22, y: 30, size: "md", delay: 0.4, float: true },
  { id: "shrine-north", emoji: "⚜️", x: 36, y: 24, size: "sm", delay: 1.1, float: true },
  { id: "dragon-east", emoji: "🐉", x: 78, y: 22, size: "md", delay: 0, float: true },
  /* Banner + quest board sit on the Quad lawn's edge by the pathways (pin is at 46,50) */
  { id: "banner-quad-edge", emoji: "🚩", x: 41.5, y: 51.5, size: "sm", delay: 0.8 },
  { id: "treasure-southwest", emoji: "💰", x: 17, y: 62, size: "sm", delay: 1.6 },
  { id: "quest-board-quad", emoji: "📜", x: 52, y: 48, size: "sm", delay: 0.6 },
  { id: "lantern-south", emoji: "🏮", x: 60, y: 68, size: "sm", delay: 1.3, float: true },
];

const REALM_SPARKLES: { id: string; x: number; y: number; delay: number }[] = [
  { id: "sp-1", x: 27, y: 44, delay: 0 },
  { id: "sp-2", x: 55, y: 27, delay: 1.4 },
  { id: "sp-3", x: 67, y: 60, delay: 2.6 },
  { id: "sp-4", x: 40, y: 67, delay: 0.9 },
  { id: "sp-5", x: 74, y: 36, delay: 2 },
  /* Fireflies drifting over the open Quad lawn (clear of the pin at 46,50) */
  { id: "quad-fly-1", x: 42.5, y: 47.5, delay: 0.5 },
  { id: "quad-fly-2", x: 50, y: 52.5, delay: 2.2 },
  { id: "quad-fly-3", x: 49, y: 47, delay: 3.4 },
];

export function RealmDecorLayer() {
  return (
    <div className="realm-decor-layer absolute inset-0 z-[2] pointer-events-none" aria-hidden>
      {REALM_DECORATIONS.map((decor) => (
        <span
          key={decor.id}
          className={`realm-decor ${decor.size === "md" ? "realm-decor--md" : "realm-decor--sm"} ${
            decor.float ? "realm-decor--float" : ""
          }`}
          style={{ left: `${decor.x}%`, top: `${decor.y}%`, animationDelay: `${decor.delay}s` }}
        >
          {decor.emoji}
        </span>
      ))}
      {REALM_SPARKLES.map((sparkle) => (
        <span
          key={sparkle.id}
          className="realm-sparkle"
          style={{ left: `${sparkle.x}%`, top: `${sparkle.y}%`, animationDelay: `${sparkle.delay}s` }}
        />
      ))}
      <div className="realm-magic-light absolute inset-0" />
    </div>
  );
}
