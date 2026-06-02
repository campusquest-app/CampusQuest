"use client";

import { useMemo } from "react";
import { RUNE_HIEROGLYPHS, type RuneGlyphDef } from "@/components/scanner/runeGlyphs";

type ScannerRuneHieroglyphicsProps = {
  boosted?: boolean;
  lensLive?: boolean;
  iosMode?: boolean;
};

const EDGE_SLOTS = [
  { left: 5, top: 8 },
  { left: 86, top: 10 },
  { left: 4, top: 78 },
  { left: 88, top: 76 },
  { left: 46, top: 6 },
  { left: 44, top: 86 },
  { left: 12, top: 22 },
  { left: 84, top: 24 },
  { left: 10, top: 62 },
  { left: 85, top: 60 },
  { left: 22, top: 7 },
  { left: 74, top: 84 },
  { left: 8, top: 42 },
  { left: 90, top: 46 },
  { left: 48, top: 16 },
] as const;

function RuneSvg({ glyph, size }: { glyph: RuneGlyphDef; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={glyph.viewBox ?? "0 0 24 24"}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="cq-rune-glyph-svg overflow-visible"
      aria-hidden
    >
      {glyph.paths.map((d, i) => (
        <path
          key={`${glyph.id}-${i}`}
          d={d}
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

export function ScannerRuneHieroglyphics({
  boosted = false,
  lensLive = true,
  iosMode = false,
}: ScannerRuneHieroglyphicsProps) {
  const seeds = useMemo(
    () =>
      EDGE_SLOTS.map((slot, i) => ({
        ...slot,
        i,
        glyph: RUNE_HIEROGLYPHS[i % RUNE_HIEROGLYPHS.length]!,
        delay: (i * 0.37) % 2.8,
        floatDur: 4.8 + (i % 5) * 0.65,
        pulseDur: 3.1 + (i % 4) * 0.45,
        rotateDir: i % 2 === 0 ? 1 : -1,
        size: 24 + (i % 3) * 4,
      })),
    [],
  );

  const layerClass = boosted
    ? "cq-sigil-runes-layer--boosted"
    : lensLive
      ? "cq-sigil-runes-layer--live"
      : "";

  return (
    <div
      className={`cq-sigil-runes-layer pointer-events-none absolute inset-0 z-20 overflow-visible rounded-[inherit] ${iosMode ? "cq-sigil-runes-layer--ios" : ""} ${layerClass}`}
      aria-hidden
    >
      {seeds.map((s) => (
        <div
          key={s.i}
          className="cq-sigil-rune-glyph cq-scanner-rune-anim absolute text-cyan-100"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            ["--rune-delay" as string]: `${s.delay}s`,
            ["--rune-float-dur" as string]: `${s.floatDur}s`,
            ["--rune-pulse-dur" as string]: `${s.pulseDur}s`,
            ["--rune-rotate-deg" as string]: `${6 * s.rotateDir}deg`,
          }}
        >
          <RuneSvg glyph={s.glyph} size={s.size} />
        </div>
      ))}
    </div>
  );
}
