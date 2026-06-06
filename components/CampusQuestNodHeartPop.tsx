"use client";

import { useId } from "react";
import { Heart } from "lucide-react";

const SPARKS: { angle: number; tone: "cyan" | "lavender" }[] = [
  { angle: 0, tone: "cyan" },
  { angle: 48, tone: "lavender" },
  { angle: 96, tone: "lavender" },
  { angle: 148, tone: "cyan" },
  { angle: 196, tone: "lavender" },
  { angle: 244, tone: "cyan" },
  { angle: 292, tone: "lavender" },
  { angle: 336, tone: "cyan" },
];

const RUNE_ANGLES = [22, 78, 132, 208, 268, 318];
const DUST_ANGLES = [12, 62, 118, 172, 228, 284, 342];

export function CampusQuestNodHeartPop({ size = "lg" }: { size?: "md" | "lg" }) {
  const gradId = useId().replace(/:/g, "");

  return (
    <span className={`cq-nod-heart-pop ${size === "lg" ? "cq-nod-heart-pop--lg" : ""}`} aria-hidden>
      <span className="cq-nod-heart-pop__glow" />
      {DUST_ANGLES.map((angle) => (
        <span key={`dust-${angle}`} className="cq-nod-heart-pop__dust" style={{ ["--spark-angle" as string]: `${angle}deg` }} />
      ))}
      {RUNE_ANGLES.map((angle) => (
        <span key={`rune-${angle}`} className="cq-nod-heart-pop__rune" style={{ ["--spark-angle" as string]: `${angle}deg` }} />
      ))}
      {SPARKS.map(({ angle, tone }) => (
        <span
          key={`spark-${angle}`}
          className={`cq-nod-heart-pop__spark cq-nod-heart-pop__spark--${tone}`}
          style={{ ["--spark-angle" as string]: `${angle}deg` }}
        />
      ))}
      <span className="cq-nod-heart-pop__core">
        <svg width="0" height="0" className="absolute" aria-hidden>
          <defs>
            <linearGradient id={gradId} x1="8%" y1="0%" x2="92%" y2="100%">
              <stop offset="0%" stopColor="#6EDCFF" />
              <stop offset="38%" stopColor="#7DD3FC" />
              <stop offset="58%" stopColor="#A78BFA" />
              <stop offset="82%" stopColor="#B794F4" />
              <stop offset="100%" stopColor="#C4B5FD" />
            </linearGradient>
          </defs>
        </svg>
        <Heart
          className={size === "lg" ? "h-16 w-16 sm:h-20 sm:w-20" : "h-12 w-12"}
          fill={`url(#${gradId})`}
          stroke={`url(#${gradId})`}
          strokeWidth={1.35}
        />
      </span>
    </span>
  );
}
