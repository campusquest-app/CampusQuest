"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMap } from "@vis.gl/react-google-maps";
import { URI_MAP_CENTER } from "@/lib/realm/googleMapPose";

/**
 * Square particle field (px) centered on campus. It lives in the map's
 * `overlayLayer` pane, so it pans/zooms with the world and always renders
 * BELOW markers and map controls (which live in higher panes).
 */
const FIELD_SIZE = 2400;

type ParticleHue = "cyan" | "white" | "gold";

type MagicalParticle = {
  id: number;
  leftPct: number;
  topPct: number;
  size: number;
  hue: ParticleHue;
  driftX: number;
  driftY: number;
  driftDuration: number;
  twinkleDuration: number;
  delay: number;
  opacityMin: number;
  opacityMax: number;
};

/** Deterministic PRNG — stable particle layout, no render-time randomness. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mostly cool blue dust with occasional gold sparks — matches the CQ palette. */
const HUE_CYCLE: ParticleHue[] = ["cyan", "cyan", "white", "cyan", "gold", "white"];

function buildParticles(count: number): MagicalParticle[] {
  const rand = mulberry32(0x5eedca);
  return Array.from({ length: count }, (_, id) => {
    const gold = HUE_CYCLE[id % HUE_CYCLE.length] === "gold";
    return {
      id,
      leftPct: 3 + rand() * 94,
      topPct: 3 + rand() * 94,
      size: gold ? 2 + rand() * 1.5 : 2 + rand() * 3,
      hue: HUE_CYCLE[id % HUE_CYCLE.length],
      driftX: (rand() - 0.5) * 90,
      driftY: -(14 + rand() * 52),
      driftDuration: 16 + rand() * 16,
      twinkleDuration: 2.6 + rand() * 3.4,
      delay: -(rand() * 18),
      opacityMin: 0.1 + rand() * 0.15,
      opacityMax: 0.45 + rand() * 0.35,
    };
  });
}

/** Cap particle count by viewport so low-end phones stay smooth. */
function particleCountForViewport(): number {
  if (typeof window === "undefined") return 0;
  const width = window.innerWidth;
  if (width < 480) return 16;
  if (width < 900) return 22;
  return 30;
}

/**
 * Ambient magical dust drifting over the Realm map. CSS transform/opacity
 * animations only (Safari/iOS-safe); static when prefers-reduced-motion.
 */
export function MagicalParticleLayer({ enabled }: { enabled: boolean }) {
  const map = useMap();
  const [field, setField] = useState<HTMLDivElement | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(particleCountForViewport());
  }, []);

  useEffect(() => {
    if (!map || !enabled) return undefined;

    const div = document.createElement("div");
    div.className = "cq-magic-particle-field";
    div.style.width = `${FIELD_SIZE}px`;
    div.style.height = `${FIELD_SIZE}px`;
    div.setAttribute("aria-hidden", "true");

    class ParticleFieldOverlay extends google.maps.OverlayView {
      onAdd() {
        this.getPanes()?.overlayLayer.appendChild(div);
      }
      draw() {
        const projection = this.getProjection();
        if (!projection) return;
        const point = projection.fromLatLngToDivPixel(
          new google.maps.LatLng(URI_MAP_CENTER.lat, URI_MAP_CENTER.lng),
        );
        if (!point) return;
        div.style.left = `${point.x - FIELD_SIZE / 2}px`;
        div.style.top = `${point.y - FIELD_SIZE / 2}px`;
      }
      onRemove() {
        div.remove();
      }
    }

    const overlay = new ParticleFieldOverlay();
    overlay.setMap(map);
    setField(div);

    return () => {
      overlay.setMap(null);
      setField(null);
    };
  }, [map, enabled]);

  const particles = useMemo(() => buildParticles(count), [count]);

  if (!field || particles.length === 0) return null;

  return createPortal(
    <>
      <span className="cq-magic-constellation" aria-hidden />
      {particles.map((particle) => (
        <span
          key={particle.id}
          className={`cq-magic-particle cq-magic-particle--${particle.hue}`}
          style={{
            left: `${particle.leftPct}%`,
            top: `${particle.topPct}%`,
            width: `${particle.size}px`,
            height: `${particle.size}px`,
            ["--mp-dx" as string]: `${particle.driftX.toFixed(1)}px`,
            ["--mp-dy" as string]: `${particle.driftY.toFixed(1)}px`,
            ["--mp-drift-dur" as string]: `${particle.driftDuration.toFixed(1)}s`,
            ["--mp-twinkle-dur" as string]: `${particle.twinkleDuration.toFixed(1)}s`,
            ["--mp-delay" as string]: `${particle.delay.toFixed(1)}s`,
            ["--mp-o-min" as string]: particle.opacityMin.toFixed(2),
            ["--mp-o-max" as string]: particle.opacityMax.toFixed(2),
          }}
        />
      ))}
    </>,
    field,
  );
}
