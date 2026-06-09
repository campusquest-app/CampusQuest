"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import {
  parseAvatar,
  isV1CustomAvatarData,
  isDiceBearAvatarPayload,
  SKIN_TONES,
  HAIR_STYLES,
  HAIR_COLORS,
  CLOTHES_STYLES,
  CLOTHES_COLORS,
  type CustomAvatarData,
} from "@/lib/avatarOptions";
import type { DiceBearAvatarV2 } from "@/lib/dicebearAvatar";
import { getPropIconForClass, getPropIconForWeapon } from "@/lib/characterClasses";

function getSkinColor(id: string): string {
  return SKIN_TONES.find((t) => t.id === id)?.color ?? "#e8b4a0";
}
function getHairColor(id: string): string {
  return HAIR_COLORS.find((c) => c.id === id)?.color ?? "#4a3728";
}
function getClothesColor(id: string): string {
  return CLOTHES_COLORS.find((c) => c.id === id)?.color ?? "#68ABE8";
}
function darken(hex: string, pct: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 0xff) * (1 - pct));
  const g = Math.max(0, ((n >> 8) & 0xff) * (1 - pct));
  const b = Math.max(0, (n & 0xff) * (1 - pct));
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}
function lighten(hex: string, pct: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + (255 - (n >> 16 & 0xff)) * pct);
  const g = Math.min(255, ((n >> 8) & 0xff) + (255 - (n >> 8 & 0xff)) * pct);
  const b = Math.min(255, (n & 0xff) + (255 - (n & 0xff)) * pct);
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

/** Body width multiplier from body type */
function bodyWidth(body: string): number {
  if (body === "slim") return 0.88;
  if (body === "broad") return 1.12;
  return 1;
}

/** Slight shoulder/neck scale by gender (in addition to body type) */
function genderScale(gender: string): number {
  if (gender === "feminine") return 0.94;
  if (gender === "masculine") return 1.06;
  return 1;
}

/** Full avatar: head, hair, neck, body, arms, legs, shoes — animated human style */
function CustomAvatarSvg({
  data,
  size = 80,
  portraitSize = size,
}: {
  data: CustomAvatarData;
  size?: number;
  /** Visual slot size — controls head crop threshold, not SVG render resolution. */
  portraitSize?: number;
}) {
  const gradientId = useId().replace(/:/g, "");
  const skin = getSkinColor(data.skin);
  const skinShade = darken(skin, 0.18);
  const skinHighlight = lighten(skin, 0.12);
  const hair = getHairColor(data.hairColor);
  const hairShade = darken(hair, 0.22);
  const clothes = getClothesColor(data.clothesColor);
  const clothesShade = darken(clothes, 0.2);
  const accessory = darken(clothes, 0.08);
  const accessoryShade = darken(clothes, 0.26);
  const pantsColor = darken(clothes, 0.25); // pants slightly darker than top
  const pantsShade = darken(pantsColor, 0.15);
  const shoeColor = "#2d1f14";
  const shoeShade = darken(shoeColor, 0.2);
  const bw = bodyWidth(data.body);
  const gw = genderScale(data.gender ?? "neutral");
  const bodyScale = bw * gw;

  const w = 140;
  const h = 200;
  const cx = w / 2;

  // —— Layout: full figure proportions ——
  const headCenterY = 36;
  const headRx = 20;
  const headRy = 20;
  const neckW = 16 * bodyScale;
  const neckY = headCenterY + headRy - 1;
  const neckH = 14;
  const shoulderY = neckY + neckH + 2;
  const waistY = 120;
  const ankleY = 160;
  const groundY = h;

  const torsoW = 50 * bodyScale;
  const armOut = 30 * bodyScale;
  const armWidth = 14 * bodyScale;
  const elbowY = shoulderY + 34;
  const handY = waistY - 6;
  const handR = 8;

  const legW = 13 * bodyScale;
  const legGap = 5;
  const leftLegOut = cx - legW - legGap / 2;
  const leftLegIn = cx - legGap / 2;
  const rightLegIn = cx + legGap / 2;
  const rightLegOut = cx + legW + legGap / 2;

  const neckTop = neckY + 2;

  // —— Legs (pants): two legs, waist to ankle with slight taper ——
  const kneeY = 138;
  const leftLeg = `M ${leftLegOut} ${waistY} L ${leftLegIn} ${waistY}
    Q ${leftLegIn} ${kneeY} ${leftLegIn - 3} ${ankleY}
    L ${leftLegIn - 3} ${ankleY + 8} L ${leftLegOut + 3} ${ankleY + 8}
    Q ${leftLegOut} ${kneeY} ${leftLegOut + 3} ${ankleY} Z`;
  const rightLeg = `M ${rightLegIn} ${waistY} L ${rightLegOut} ${waistY}
    Q ${rightLegOut} ${kneeY} ${rightLegOut - 3} ${ankleY}
    L ${rightLegOut - 3} ${ankleY + 8} L ${rightLegIn + 3} ${ankleY + 8}
    Q ${rightLegIn} ${kneeY} ${rightLegIn + 3} ${ankleY} Z`;

  // —— Shoes: rounded feet ——
  const leftShoe = `M ${leftLegOut + 2} ${ankleY + 3} Q ${leftLegOut - 3} ${groundY - 3} ${leftLegOut + 8} ${groundY - 1}
    L ${leftLegIn - 5} ${groundY - 1} Q ${leftLegIn + 3} ${groundY - 3} ${leftLegIn - 2} ${ankleY + 3} Z`;
  const rightShoe = `M ${rightLegIn + 2} ${ankleY + 3} Q ${rightLegIn - 3} ${groundY - 3} ${rightLegIn + 5} ${groundY - 1}
    L ${rightLegOut - 8} ${groundY - 1} Q ${rightLegOut + 3} ${groundY - 3} ${rightLegOut - 2} ${ankleY + 3} Z`;

  // —— Torso (shirt): shoulders to waist only ——
  const torsoPath = `M ${cx - torsoW / 2} ${shoulderY}
    L ${cx - torsoW / 2 + 5} ${waistY} L ${cx + torsoW / 2 - 5} ${waistY} L ${cx + torsoW / 2} ${shoulderY}
    Q ${cx + neckW / 2 + 2} ${neckTop + 4} ${cx + 4} ${neckTop} Q ${cx} ${neckTop - 2} ${cx - 4} ${neckTop} Q ${cx - neckW / 2 - 2} ${neckTop + 4} ${cx - torsoW / 2} ${shoulderY} Z`;

  // —— Arms: upper + forearm + hand (thicker for visibility) ——
  const aw = armWidth / 2;
  const leftUpper = `M ${cx - torsoW / 2 - 2} ${shoulderY + 2} Q ${cx - armOut - aw} ${shoulderY + 8} ${cx - armOut} ${elbowY - 4} Q ${cx - armOut + aw} ${elbowY + 4} ${cx - armOut - aw} ${elbowY + 10} Q ${cx - torsoW / 2 - 8} ${shoulderY + 14} ${cx - torsoW / 2 - 2} ${shoulderY + 2} Z`;
  const leftForearm = `M ${cx - armOut - aw} ${elbowY + 8} Q ${cx - armOut - aw - 4} ${elbowY + 22} ${cx - armOut - aw - 2} ${handY} Q ${cx - armOut - aw - 2} ${handY + 12} ${cx - armOut + aw + 2} ${handY + 10} Q ${cx - armOut + aw} ${elbowY + 12} ${cx - armOut - aw} ${elbowY + 8} Z`;
  const rightUpper = `M ${cx + torsoW / 2 + 2} ${shoulderY + 2} Q ${cx + armOut + aw} ${shoulderY + 8} ${cx + armOut} ${elbowY - 4} Q ${cx + armOut - aw} ${elbowY + 4} ${cx + armOut + aw} ${elbowY + 10} Q ${cx + torsoW / 2 + 8} ${shoulderY + 14} ${cx + torsoW / 2 + 2} ${shoulderY + 2} Z`;
  const rightForearm = `M ${cx + armOut + aw} ${elbowY + 8} Q ${cx + armOut + aw + 4} ${elbowY + 22} ${cx + armOut + aw + 2} ${handY} Q ${cx + armOut + aw + 2} ${handY + 12} ${cx + armOut - aw - 2} ${handY + 10} Q ${cx + armOut - aw} ${elbowY + 12} ${cx + armOut + aw} ${elbowY + 8} Z`;

  const sleeveY = shoulderY + 18;
  const clothesPaths: Record<string, string> = {
    tshirt: `M ${cx - torsoW / 2} ${shoulderY} L ${cx - torsoW / 2 - 3} ${sleeveY} L ${cx - torsoW / 2 + 5} ${waistY} L ${cx + torsoW / 2 - 5} ${waistY} L ${cx + torsoW / 2 + 3} ${sleeveY} L ${cx + torsoW / 2} ${shoulderY}
      Q ${cx + neckW / 2 + 2} ${neckTop + 4} ${cx + 4} ${neckTop} Q ${cx} ${neckTop - 2} ${cx - 4} ${neckTop} Q ${cx - neckW / 2 - 2} ${neckTop + 4} ${cx - torsoW / 2} ${shoulderY} Z`,
    hoodie: `M ${cx - torsoW / 2 - 5} ${shoulderY - 2} L ${cx - torsoW / 2 - 5} ${sleeveY} L ${cx - torsoW / 2 + 5} ${waistY} L ${cx + torsoW / 2 - 5} ${waistY} L ${cx + torsoW / 2 + 5} ${sleeveY} L ${cx + torsoW / 2 + 5} ${shoulderY - 2}
      Q ${cx + neckW / 2 + 4} ${neckTop + 2} ${cx + 7} ${neckTop - 4} Q ${cx} ${neckTop - 10} ${cx - 7} ${neckTop - 4} Q ${cx - neckW / 2 - 4} ${neckTop + 2} ${cx - torsoW / 2 - 5} ${shoulderY - 2} Z
      M ${cx - 12} ${neckTop - 2} a 7 7 0 1 1 24 0 a 7 7 0 1 1 -24 0 Z`,
    tank: `M ${cx - torsoW / 2 + 8} ${shoulderY} L ${cx - torsoW / 2 + 12} ${sleeveY} L ${cx - torsoW / 2 + 5} ${waistY} L ${cx + torsoW / 2 - 5} ${waistY} L ${cx + torsoW / 2 - 12} ${sleeveY} L ${cx + torsoW / 2 - 8} ${shoulderY}
      Q ${cx + neckW / 2} ${neckTop + 2} ${cx + 2} ${neckTop} Q ${cx} ${neckTop - 4} ${cx - 2} ${neckTop} Q ${cx - neckW / 2} ${neckTop + 2} ${cx - torsoW / 2 + 8} ${shoulderY} Z`,
    collared: `M ${cx - torsoW / 2} ${shoulderY} L ${cx - torsoW / 2 - 2} ${sleeveY} L ${cx - torsoW / 2 + 5} ${waistY} L ${cx + torsoW / 2 - 5} ${waistY} L ${cx + torsoW / 2 + 2} ${sleeveY} L ${cx + torsoW / 2} ${shoulderY}
      Q ${cx + neckW / 2 + 4} ${neckTop + 6} ${cx + 6} ${neckTop} L ${cx} ${neckTop - 4} L ${cx - 6} ${neckTop} Q ${cx - neckW / 2 - 4} ${neckTop + 6} ${cx - torsoW / 2} ${shoulderY} Z`,
    sweater: `M ${cx - torsoW / 2 - 4} ${shoulderY - 2} L ${cx - torsoW / 2 - 5} ${sleeveY} L ${cx - torsoW / 2 + 5} ${waistY} L ${cx + torsoW / 2 - 5} ${waistY} L ${cx + torsoW / 2 + 5} ${sleeveY} L ${cx + torsoW / 2 + 4} ${shoulderY - 2}
      Q ${cx + neckW / 2 + 2} ${neckTop + 2} ${cx + 4} ${neckTop} Q ${cx} ${neckTop - 4} ${cx - 4} ${neckTop} Q ${cx - neckW / 2 - 2} ${neckTop + 2} ${cx - torsoW / 2 - 4} ${shoulderY - 2} Z`,
  };
  const clothesPath = clothesPaths[data.clothes] ?? clothesPaths.tshirt;

  // —— Head: round shape ——
  const headPath = `M ${cx} ${headCenterY - headRy}
    Q ${cx + headRx} ${headCenterY - headRy} ${cx + headRx} ${headCenterY}
    Q ${cx + headRx} ${headCenterY + headRy} ${cx} ${headCenterY + headRy}
    Q ${cx - headRx} ${headCenterY + headRy} ${cx - headRx} ${headCenterY}
    Q ${cx - headRx} ${headCenterY - headRy} ${cx} ${headCenterY - headRy} Z`;

  const neckPath = `M ${cx - neckW / 2} ${neckY} 
    L ${cx - neckW / 2 + 3} ${neckY + neckH} 
    L ${cx + neckW / 2 - 3} ${neckY + neckH} 
    L ${cx + neckW / 2} ${neckY} Z`;

  // Face layout (used by hair and face elements)
  const eyeY = headCenterY - 5;
  const eyeOffsetX = 8;
  const eyeW = 3.2;
  const eyeH = 2.4;
  const browY = headCenterY - 11;
  const mouthY = headCenterY + 9;
  const noseY = headCenterY + 1.5;
  const faceId = data.face ?? "smile";
  const eyeColor = "#1a1510";
  const mouthColor = "#8b6f63";
  const browColor = "#3a2d22";

  // Hair: (1) back = behind head only, never through neck/body; (2) top = on top of head covering forehead, drawn after head
  const headTopY = headCenterY - headRy;
  const headBottomY = headCenterY + headRy;
  const foreheadY = browY + 2; // hairline: hair top path stops here so it doesn't cover face
  const hairPaths: Record<string, { back?: string; top: string }> = {
    short: {
      top: `M ${cx - headRx - 2} ${foreheadY} Q ${cx - 24} ${headCenterY - 16} ${cx} ${headTopY + 4} Q ${cx + 24} ${headCenterY - 16} ${cx + headRx + 2} ${foreheadY} Q ${cx + headRx - 1} ${foreheadY + 2} ${cx} ${foreheadY + 4} Q ${cx - headRx + 1} ${foreheadY + 2} ${cx - headRx - 2} ${foreheadY} Z`,
    },
    long: {
      back: `M ${cx - headRx - 4} ${headCenterY} Q ${cx - 26} ${headCenterY - 12} ${cx} ${headTopY + 6} Q ${cx + 26} ${headCenterY - 12} ${cx + headRx + 4} ${headCenterY} L ${cx + headRx + 2} ${headBottomY - 2} Q ${cx} ${headBottomY + 2} ${cx - headRx - 2} ${headBottomY - 2} Z`,
      top: `M ${cx - headRx - 2} ${foreheadY} Q ${cx - 24} ${headCenterY - 16} ${cx} ${headTopY + 4} Q ${cx + 24} ${headCenterY - 16} ${cx + headRx + 2} ${foreheadY} Q ${cx + headRx - 1} ${foreheadY + 2} ${cx} ${foreheadY + 4} Q ${cx - headRx + 1} ${foreheadY + 2} ${cx - headRx - 2} ${foreheadY} Z`,
    },
    curly: {
      top: `M ${cx - headRx - 2} ${foreheadY} Q ${cx - 25} ${headCenterY - 14} ${cx} ${headTopY + 2} Q ${cx + 25} ${headCenterY - 14} ${cx + headRx + 2} ${foreheadY} Q ${cx + headRx} ${foreheadY + 3} ${cx} ${foreheadY + 5} Q ${cx - headRx} ${foreheadY + 3} ${cx - headRx - 2} ${foreheadY} Z`,
    },
    buzz: {
      top: `M ${cx - headRx} ${foreheadY + 1} Q ${cx - 22} ${headCenterY - 14} ${cx} ${headTopY + 6} Q ${cx + 22} ${headCenterY - 14} ${cx + headRx} ${foreheadY + 1} Q ${cx} ${foreheadY + 3} ${cx - headRx} ${foreheadY + 1} Z`,
    },
    ponytail: {
      back: `M ${cx - headRx} ${headCenterY - 4} Q ${cx + 2} ${headCenterY - 6} ${cx + headRx + 4} ${headCenterY + 2} L ${cx + headRx + 4} ${headBottomY - 2} Q ${cx} ${headBottomY} ${cx - headRx} ${headBottomY - 2} Z`,
      top: `M ${cx - headRx - 2} ${foreheadY} Q ${cx - 24} ${headCenterY - 16} ${cx} ${headTopY + 4} Q ${cx + 24} ${headCenterY - 16} ${cx + headRx + 2} ${foreheadY} Q ${cx + headRx - 1} ${foreheadY + 2} ${cx} ${foreheadY + 4} Q ${cx - headRx + 1} ${foreheadY + 2} ${cx - headRx - 2} ${foreheadY} Z`,
    },
    bun: {
      back: `M ${cx - 8} ${headCenterY - 20} a 10 10 0 1 1 16 0 a 10 10 0 1 1 -16 0 Z`,
      top: `M ${cx - headRx - 2} ${foreheadY} Q ${cx - 24} ${headCenterY - 16} ${cx} ${headTopY + 4} Q ${cx + 24} ${headCenterY - 16} ${cx + headRx + 2} ${foreheadY} Q ${cx + headRx - 1} ${foreheadY + 2} ${cx} ${foreheadY + 4} Q ${cx - headRx + 1} ${foreheadY + 2} ${cx - headRx - 2} ${foreheadY} Z`,
    },
    waves: {
      top: `M ${cx - headRx - 2} ${foreheadY} Q ${cx - 24} ${headCenterY - 15} ${cx} ${headTopY + 3} Q ${cx + 24} ${headCenterY - 15} ${cx + headRx + 2} ${foreheadY} Q ${cx + headRx} ${foreheadY + 3} ${cx} ${foreheadY + 5} Q ${cx - headRx} ${foreheadY + 3} ${cx - headRx - 2} ${foreheadY} Z`,
    },
    bald: { top: "" },
  };
  const hairStyle = hairPaths[data.hair] ?? hairPaths.short;

  // —— Cosmetics: backpack / hat / glasses ——
  const backpackId = data.backpack ?? "none";
  const hatId = data.hat ?? "none";
  const glassesId = data.glasses ?? "none";

  const backpackEl: JSX.Element | null = (() => {
    if (backpackId === "none") return null;
    if (backpackId === "cape") {
      const capeTop = shoulderY + 4;
      const capeBottom = ankleY + 4;
      const capePath = `M ${cx - torsoW / 2 + 2} ${capeTop}
        Q ${cx} ${capeTop + 14} ${cx + torsoW / 2 - 2} ${capeTop}
        Q ${cx + torsoW / 2 + 10} ${capeTop + 30} ${cx + 10} ${capeBottom}
        Q ${cx} ${capeBottom + 6} ${cx - 10} ${capeBottom}
        Q ${cx - torsoW / 2 - 10} ${capeTop + 30} ${cx - torsoW / 2 + 2} ${capeTop} Z`;
      return <path d={capePath} fill={accessory} fillOpacity={0.55} stroke={accessoryShade} strokeWidth={0.7} />;
    }
    if (backpackId === "satchel") {
      const bagX = cx + torsoW / 2 + 6;
      const bagY = waistY - 8;
      return (
        <>
          <path
            d={`M ${cx + 6} ${shoulderY + 6} Q ${cx + 14} ${waistY - 6} ${bagX - 2} ${bagY + 2}`}
            fill="none"
            stroke={accessoryShade}
            strokeWidth={1.2}
            strokeLinecap="round"
            opacity={0.85}
          />
          <rect
            x={bagX - 10}
            y={bagY}
            width={18}
            height={18}
            rx={4}
            fill={accessory}
            stroke={accessoryShade}
            strokeWidth={0.8}
          />
          <path
            d={`M ${bagX - 10} ${bagY + 7} L ${bagX + 8} ${bagY + 7}`}
            stroke={accessoryShade}
            strokeWidth={0.7}
            opacity={0.7}
          />
        </>
      );
    }
    // backpack (default)
    const packW = 20 * bodyScale;
    const packH = 34;
    const packX = cx - torsoW / 2 - packW + 6;
    const packY = shoulderY + 10;
    return (
      <>
        <rect
          x={packX}
          y={packY}
          width={packW}
          height={packH}
          rx={7}
          fill={accessory}
          stroke={accessoryShade}
          strokeWidth={0.9}
        />
        <path
          d={`M ${packX + 4} ${packY + 8} Q ${cx - torsoW / 2 + 1} ${packY + 14} ${cx - torsoW / 2 + 4} ${packY + 22}`}
          fill="none"
          stroke={accessoryShade}
          strokeWidth={1.1}
          strokeLinecap="round"
          opacity={0.75}
        />
      </>
    );
  })();

  const hatEl: JSX.Element | null = (() => {
    if (hatId === "none") return null;
    const topY = headTopY - 8;
    const brimY = foreheadY - 1;
    if (hatId === "crown") {
      const gold = "#c5a028";
      const goldShade = darken(gold, 0.18);
      const crownPath = `M ${cx - 16} ${brimY + 2} L ${cx - 10} ${topY + 10} L ${cx - 2} ${brimY - 4} L ${cx + 6} ${topY + 10} L ${cx + 16} ${brimY + 2} Z`;
      return (
        <>
          <path d={crownPath} fill={gold} stroke={goldShade} strokeWidth={0.9} />
          <rect x={cx - 16} y={brimY + 2} width={32} height={6} rx={3} fill={gold} stroke={goldShade} strokeWidth={0.9} />
        </>
      );
    }
    if (hatId === "wizard") {
      const purple = "#5e35b1";
      const purpleShade = darken(purple, 0.2);
      const hatPath = `M ${cx - 2} ${topY - 16} L ${cx - 18} ${brimY + 4} Q ${cx} ${brimY - 2} ${cx + 18} ${brimY + 4} Z`;
      return (
        <>
          <path d={hatPath} fill={purple} stroke={purpleShade} strokeWidth={0.9} />
          <ellipse cx={cx} cy={brimY + 4} rx={20} ry={4} fill={purple} fillOpacity={0.75} />
        </>
      );
    }
    if (hatId === "beanie") {
      const beaniePath = `M ${cx - headRx + 2} ${foreheadY + 1}
        Q ${cx} ${headTopY - 10} ${cx + headRx - 2} ${foreheadY + 1}
        Q ${cx} ${foreheadY + 6} ${cx - headRx + 2} ${foreheadY + 1} Z`;
      return (
        <>
          <path d={beaniePath} fill={accessory} stroke={accessoryShade} strokeWidth={0.9} />
          <circle cx={cx} cy={headTopY - 10} r={3} fill={accessoryShade} opacity={0.8} />
        </>
      );
    }
    // cap
    const capPath = `M ${cx - headRx + 2} ${foreheadY + 1}
      Q ${cx} ${headTopY - 8} ${cx + headRx - 2} ${foreheadY + 1}
      Q ${cx} ${foreheadY + 5} ${cx - headRx + 2} ${foreheadY + 1} Z`;
    const brimPath = `M ${cx - 6} ${foreheadY + 6} Q ${cx + 10} ${foreheadY + 9} ${cx + 18} ${foreheadY + 7}`;
    return (
      <>
        <path d={capPath} fill={accessory} stroke={accessoryShade} strokeWidth={0.9} />
        <path d={brimPath} fill="none" stroke={accessoryShade} strokeWidth={2.2} strokeLinecap="round" opacity={0.8} />
      </>
    );
  })();

  const glassesEl: JSX.Element | null = (() => {
    if (glassesId === "none") return null;
    const frame = "rgba(26,21,16,0.8)";
    const lens = glassesId === "sunglasses" ? "rgba(10,10,10,0.35)" : "rgba(255,255,255,0.12)";
    const r = glassesId === "round" ? 5.6 : 5.2;
    const rx = glassesId === "square" ? 5.2 : r;
    const ry = glassesId === "square" ? 4.4 : r;
    return (
      <>
        <rect x={cx - eyeOffsetX - rx} y={eyeY - ry} width={rx * 2} height={ry * 2} rx={r} fill={lens} stroke={frame} strokeWidth={1.2} />
        <rect x={cx + eyeOffsetX - rx} y={eyeY - ry} width={rx * 2} height={ry * 2} rx={r} fill={lens} stroke={frame} strokeWidth={1.2} />
        <path d={`M ${cx - 2} ${eyeY} L ${cx + 2} ${eyeY}`} stroke={frame} strokeWidth={1.2} strokeLinecap="round" />
        <path d={`M ${cx - eyeOffsetX - rx} ${eyeY - 1} Q ${cx - eyeOffsetX - rx - 6} ${eyeY - 2} ${cx - eyeOffsetX - rx - 9} ${eyeY}`} stroke={frame} strokeWidth={1.2} strokeLinecap="round" opacity={0.9} />
        <path d={`M ${cx + eyeOffsetX + rx} ${eyeY - 1} Q ${cx + eyeOffsetX + rx + 6} ${eyeY - 2} ${cx + eyeOffsetX + rx + 9} ${eyeY}`} stroke={frame} strokeWidth={1.2} strokeLinecap="round" opacity={0.9} />
      </>
    );
  })();

  const nosePath = `M ${cx} ${noseY} Q ${cx + 0.5} ${noseY + 4} ${cx} ${noseY + 5.5}`;
  const noseBridge = `M ${cx - 0.4} ${browY + 3} L ${cx} ${noseY}`;

  const faceElements: Record<string, JSX.Element> = {
    default: (
      <>
        <path d={`M ${cx - eyeOffsetX - 3.5} ${browY + 0.3} Q ${cx - eyeOffsetX} ${browY - 0.5} ${cx - eyeOffsetX + 3.5} ${browY + 0.3}`} fill="none" stroke={browColor} strokeWidth={0.75} strokeLinecap="round" />
        <path d={`M ${cx + eyeOffsetX - 3.5} ${browY + 0.3} Q ${cx + eyeOffsetX} ${browY - 0.5} ${cx + eyeOffsetX + 3.5} ${browY + 0.3}`} fill="none" stroke={browColor} strokeWidth={0.75} strokeLinecap="round" />
        <ellipse cx={cx - eyeOffsetX} cy={eyeY} rx={eyeW} ry={eyeH} fill={eyeColor} />
        <ellipse cx={cx + eyeOffsetX} cy={eyeY} rx={eyeW} ry={eyeH} fill={eyeColor} />
        <ellipse cx={cx - eyeOffsetX + 0.8} cy={eyeY - 0.4} rx={0.65} ry={0.5} fill="rgba(255,255,255,0.4)" />
        <ellipse cx={cx + eyeOffsetX + 0.8} cy={eyeY - 0.4} rx={0.65} ry={0.5} fill="rgba(255,255,255,0.4)" />
        <path d={noseBridge} fill="none" stroke={skinShade} strokeWidth={0.45} strokeLinecap="round" opacity={0.5} />
        <path d={nosePath} fill="none" stroke={skinShade} strokeWidth={0.5} strokeLinecap="round" />
        <path d={`M ${cx - 4} ${mouthY} Q ${cx} ${mouthY + 1.2} ${cx + 4} ${mouthY}`} fill="none" stroke={mouthColor} strokeWidth={0.9} strokeLinecap="round" />
      </>
    ),
    smile: (
      <>
        <path d={`M ${cx - eyeOffsetX - 3.5} ${browY + 0.2} Q ${cx - eyeOffsetX} ${browY - 0.8} ${cx - eyeOffsetX + 3.5} ${browY + 0.2}`} fill="none" stroke={browColor} strokeWidth={0.75} strokeLinecap="round" />
        <path d={`M ${cx + eyeOffsetX - 3.5} ${browY + 0.2} Q ${cx + eyeOffsetX} ${browY - 0.8} ${cx + eyeOffsetX + 3.5} ${browY + 0.2}`} fill="none" stroke={browColor} strokeWidth={0.75} strokeLinecap="round" />
        <ellipse cx={cx - eyeOffsetX} cy={eyeY} rx={eyeW} ry={eyeH} fill={eyeColor} />
        <ellipse cx={cx + eyeOffsetX} cy={eyeY} rx={eyeW} ry={eyeH} fill={eyeColor} />
        <ellipse cx={cx - eyeOffsetX + 0.8} cy={eyeY - 0.4} rx={0.65} ry={0.5} fill="rgba(255,255,255,0.4)" />
        <ellipse cx={cx + eyeOffsetX + 0.8} cy={eyeY - 0.4} rx={0.65} ry={0.5} fill="rgba(255,255,255,0.4)" />
        <path d={noseBridge} fill="none" stroke={skinShade} strokeWidth={0.45} strokeLinecap="round" opacity={0.5} />
        <path d={nosePath} fill="none" stroke={skinShade} strokeWidth={0.5} strokeLinecap="round" />
        <path d={`M ${cx - 4} ${mouthY} Q ${cx} ${mouthY + 3.5} ${cx + 4} ${mouthY}`} fill="none" stroke={mouthColor} strokeWidth={1} strokeLinecap="round" />
      </>
    ),
    happy: (
      <>
        <path d={`M ${cx - eyeOffsetX - 3.5} ${browY - 0.2} Q ${cx - eyeOffsetX} ${browY - 1.8} ${cx - eyeOffsetX + 3.5} ${browY - 0.2}`} fill="none" stroke={browColor} strokeWidth={0.75} strokeLinecap="round" />
        <path d={`M ${cx + eyeOffsetX - 3.5} ${browY - 0.2} Q ${cx + eyeOffsetX} ${browY - 1.8} ${cx + eyeOffsetX + 3.5} ${browY - 0.2}`} fill="none" stroke={browColor} strokeWidth={0.75} strokeLinecap="round" />
        <ellipse cx={cx - eyeOffsetX} cy={eyeY - 0.2} rx={eyeW} ry={eyeH * 0.95} fill={eyeColor} />
        <ellipse cx={cx + eyeOffsetX} cy={eyeY - 0.2} rx={eyeW} ry={eyeH * 0.95} fill={eyeColor} />
        <ellipse cx={cx - eyeOffsetX + 0.8} cy={eyeY - 0.65} rx={0.65} ry={0.5} fill="rgba(255,255,255,0.4)" />
        <ellipse cx={cx + eyeOffsetX + 0.8} cy={eyeY - 0.65} rx={0.65} ry={0.5} fill="rgba(255,255,255,0.4)" />
        <path d={noseBridge} fill="none" stroke={skinShade} strokeWidth={0.45} strokeLinecap="round" opacity={0.5} />
        <path d={nosePath} fill="none" stroke={skinShade} strokeWidth={0.5} strokeLinecap="round" />
        <path d={`M ${cx - 4.5} ${mouthY + 0.5} Q ${cx} ${mouthY + 4.5} ${cx + 4.5} ${mouthY + 0.5}`} fill="none" stroke={mouthColor} strokeWidth={1.05} strokeLinecap="round" />
      </>
    ),
    calm: (
      <>
        <path d={`M ${cx - eyeOffsetX - 3.5} ${browY + 0.5} Q ${cx - eyeOffsetX} ${browY} ${cx - eyeOffsetX + 3.5} ${browY + 0.5}`} fill="none" stroke={browColor} strokeWidth={0.7} strokeLinecap="round" />
        <path d={`M ${cx + eyeOffsetX - 3.5} ${browY + 0.5} Q ${cx + eyeOffsetX} ${browY} ${cx + eyeOffsetX + 3.5} ${browY + 0.5}`} fill="none" stroke={browColor} strokeWidth={0.7} strokeLinecap="round" />
        <ellipse cx={cx - eyeOffsetX} cy={eyeY} rx={eyeW * 0.95} ry={eyeH * 0.9} fill={eyeColor} />
        <ellipse cx={cx + eyeOffsetX} cy={eyeY} rx={eyeW * 0.95} ry={eyeH * 0.9} fill={eyeColor} />
        <ellipse cx={cx - eyeOffsetX + 0.75} cy={eyeY - 0.35} rx={0.6} ry={0.45} fill="rgba(255,255,255,0.35)" />
        <ellipse cx={cx + eyeOffsetX + 0.75} cy={eyeY - 0.35} rx={0.6} ry={0.45} fill="rgba(255,255,255,0.35)" />
        <path d={noseBridge} fill="none" stroke={skinShade} strokeWidth={0.45} strokeLinecap="round" opacity={0.5} />
        <path d={nosePath} fill="none" stroke={skinShade} strokeWidth={0.48} strokeLinecap="round" />
        <path d={`M ${cx - 3.5} ${mouthY + 0.4} Q ${cx} ${mouthY + 2.2} ${cx + 3.5} ${mouthY + 0.4}`} fill="none" stroke={mouthColor} strokeWidth={0.85} strokeLinecap="round" />
      </>
    ),
    serious: (
      <>
        <path d={`M ${cx - eyeOffsetX - 3.5} ${browY + 0.8} L ${cx - eyeOffsetX + 3.5} ${browY + 0.8}`} fill="none" stroke={browColor} strokeWidth={0.7} strokeLinecap="round" />
        <path d={`M ${cx + eyeOffsetX - 3.5} ${browY + 0.8} L ${cx + eyeOffsetX + 3.5} ${browY + 0.8}`} fill="none" stroke={browColor} strokeWidth={0.7} strokeLinecap="round" />
        <ellipse cx={cx - eyeOffsetX} cy={eyeY} rx={eyeW * 1.02} ry={eyeH * 0.88} fill={eyeColor} />
        <ellipse cx={cx + eyeOffsetX} cy={eyeY} rx={eyeW * 1.02} ry={eyeH * 0.88} fill={eyeColor} />
        <ellipse cx={cx - eyeOffsetX + 0.75} cy={eyeY - 0.35} rx={0.6} ry={0.45} fill="rgba(255,255,255,0.35)" />
        <ellipse cx={cx + eyeOffsetX + 0.75} cy={eyeY - 0.35} rx={0.6} ry={0.45} fill="rgba(255,255,255,0.35)" />
        <path d={noseBridge} fill="none" stroke={skinShade} strokeWidth={0.45} strokeLinecap="round" opacity={0.5} />
        <path d={nosePath} fill="none" stroke={skinShade} strokeWidth={0.5} strokeLinecap="round" />
        <line x1={cx - 3.5} y1={mouthY + 0.4} x2={cx + 3.5} y2={mouthY + 0.4} stroke={mouthColor} strokeWidth={0.9} strokeLinecap="round" />
      </>
    ),
    wink: (
      <>
        <path d={`M ${cx - eyeOffsetX - 3.5} ${browY + 0.2} Q ${cx - eyeOffsetX} ${browY - 0.8} ${cx - eyeOffsetX + 3.5} ${browY + 0.2}`} fill="none" stroke={browColor} strokeWidth={0.75} strokeLinecap="round" />
        <path d={`M ${cx + eyeOffsetX - 3.5} ${browY + 0.6} Q ${cx + eyeOffsetX} ${browY + 1.2} ${cx + eyeOffsetX + 3.5} ${browY + 0.6}`} fill="none" stroke={browColor} strokeWidth={0.7} strokeLinecap="round" />
        <ellipse cx={cx - eyeOffsetX} cy={eyeY} rx={eyeW} ry={eyeH} fill={eyeColor} />
        <ellipse cx={cx - eyeOffsetX + 0.8} cy={eyeY - 0.4} rx={0.65} ry={0.5} fill="rgba(255,255,255,0.4)" />
        <path d={`M ${cx + eyeOffsetX - 2} ${eyeY} Q ${cx + eyeOffsetX} ${eyeY + 1.5} ${cx + eyeOffsetX + 2} ${eyeY}`} fill="none" stroke={mouthColor} strokeWidth={0.95} strokeLinecap="round" />
        <path d={noseBridge} fill="none" stroke={skinShade} strokeWidth={0.45} strokeLinecap="round" opacity={0.5} />
        <path d={nosePath} fill="none" stroke={skinShade} strokeWidth={0.5} strokeLinecap="round" />
        <path d={`M ${cx - 4} ${mouthY} Q ${cx} ${mouthY + 3.5} ${cx + 4} ${mouthY}`} fill="none" stroke={mouthColor} strokeWidth={1} strokeLinecap="round" />
      </>
    ),
  };
  const faceEl = faceElements[faceId] ?? faceElements.smile;

  const portraitCrop = portraitSize <= 96;
  const viewBox = portraitCrop ? `${cx - 46} 0 92 94` : `0 0 ${w} ${h}`;

  return (
    <svg
      viewBox={viewBox}
      width="100%"
      height="100%"
      className="block max-h-full max-w-full"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="45%">
          <stop offset="0%" stopColor={skinHighlight} stopOpacity={0.3} />
          <stop offset="55%" stopColor={skinHighlight} stopOpacity={0} />
          <stop offset="100%" stopColor={skinShade} stopOpacity={0.85} />
        </linearGradient>
      </defs>
      <g transform={`translate(${w},0) scale(-1,1)`}>
        {/* 1. Shoes (back layer) */}
        <path d={leftShoe} fill={shoeColor} stroke={shoeShade} strokeWidth={0.8} />
        <path d={rightShoe} fill={shoeColor} stroke={shoeShade} strokeWidth={0.8} />
        {/* 2. Legs (pants) */}
        <path d={leftLeg} fill={pantsColor} stroke={pantsShade} strokeWidth={0.6} />
        <path d={rightLeg} fill={pantsColor} stroke={pantsShade} strokeWidth={0.6} />
        {/* 2.5 Backpack / cape (behind torso) */}
        {backpackEl}
        {/* 3. Torso / clothes */}
        <path d={clothesPath} fill={clothes} stroke={clothesShade} strokeWidth={1} fillRule="nonzero" />
        {/* 4. Arms (skin) */}
        <path d={leftUpper} fill={skin} stroke={skinShade} strokeWidth={0.8} />
        <path d={leftForearm} fill={skin} stroke={skinShade} strokeWidth={0.8} />
        <ellipse cx={cx - armOut - aw} cy={handY + 6} rx={handR * 0.75} ry={handR} fill={skin} stroke={skinShade} strokeWidth={0.5} />
        <path d={rightUpper} fill={skin} stroke={skinShade} strokeWidth={0.8} />
        <path d={rightForearm} fill={skin} stroke={skinShade} strokeWidth={0.8} />
        <ellipse cx={cx + armOut + aw} cy={handY + 6} rx={handR * 0.75} ry={handR} fill={skin} stroke={skinShade} strokeWidth={0.5} />
        {/* 5. Hair back (behind head only) */}
        {hairStyle.back && <path d={hairStyle.back} fill={hairShade} />}
        {hairStyle.back && <path d={hairStyle.back} fill={hair} fillOpacity={0.92} />}
        {/* 6. Neck */}
        <path d={neckPath} fill={skin} />
        <path d={neckPath} fill={skinShade} fillOpacity={0.15} />
        {/* 7. Head */}
        <path d={headPath} fill={skin} />
        <path d={headPath} fill={`url(#${gradientId})`} fillOpacity={0.28} />
        {/* 8. Hair top (forehead + crown) */}
        {hairStyle.top && <path d={hairStyle.top} fill={hair} />}
        {/* 8.5 Hat (on top of hair/head) */}
        {hatEl}
        {/* 9. Face */}
        {faceEl}
        {/* 10. Glasses (on top of face) */}
        {glassesEl}
      </g>
    </svg>
  );
}

function DiceBearAvatarSvg({ data }: { data: DiceBearAvatarV2 }) {
  const [markup, setMarkup] = useState<string | null>(null);
  const cacheKey = JSON.stringify(data);

  useEffect(() => {
    let cancelled = false;
    void import("@/lib/dicebearSvg").then((mod) => {
      if (cancelled) return;
      setMarkup(mod.createDiceBearSvgString(data));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cacheKey = JSON.stringify(data)
  }, [cacheKey]);

  if (markup === null || markup === "") {
    return (
      <span className="avatar-display-dicebear avatar-display-dicebear--loading" aria-hidden />
    );
  }
  return (
    <span
      className="avatar-display-dicebear"
      // SVG is generated locally by DiceBear from validated JSON only (client).
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

function avatarFramePadding(size: number): number {
  return Math.max(1, Math.round(size * 0.04));
}

function isAvatarImageUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function AvatarFrame({
  size,
  fitParent = false,
  className = "",
  children,
  propIcon,
}: {
  size: number;
  fitParent?: boolean;
  className?: string;
  children: ReactNode;
  propIcon?: string | null;
}) {
  const pad = avatarFramePadding(fitParent ? 96 : size);
  const frameStyle: React.CSSProperties = fitParent
    ? { width: "100%", height: "100%" }
    : { width: size, height: size };
  const badgeSize = fitParent ? 26 : Math.max(14, size * 0.32);

  return (
    <span className={`avatar-display-frame ${className}`.trim()} style={frameStyle}>
      <span className="avatar-display-frame__inner" style={{ padding: pad }}>
        {children}
      </span>
      {propIcon ? (
        <span
          className="absolute bottom-0 right-0 flex items-center justify-center rounded-full border border-uri-gold/50 bg-uri-navy/90 text-white shadow"
          style={{ width: badgeSize, height: badgeSize, fontSize: badgeSize * 0.62 }}
          aria-hidden
        >
          {propIcon}
        </span>
      ) : null}
    </span>
  );
}

function getPropIcon(classId?: string | null, starterWeapon?: string | null): string | null {
  return getPropIconForClass(classId ?? "") ?? getPropIconForWeapon(starterWeapon ?? "") ?? null;
}

export function AvatarDisplay({
  avatar,
  size = 80,
  fitParent = false,
  className = "",
  classId,
  starterWeapon,
  showProp = true,
}: {
  avatar: string;
  size?: number;
  /** Fill the parent container (use inside sized avatar rings). */
  fitParent?: boolean;
  className?: string;
  /** When set, shows class prop icon (e.g. 📚 for Knight). */
  classId?: string | null;
  /** When set and no classId, shows weapon icon as prop. */
  starterWeapon?: string | null;
  /** If false, prop badge is hidden even when classId/starterWeapon are set. */
  showProp?: boolean;
}) {
  const propIcon = showProp ? getPropIcon(classId, starterWeapon) : null;
  const parsed = parseAvatar(avatar);
  const customRenderSize = fitParent ? 128 : Math.max(32, size);

  if (parsed && isDiceBearAvatarPayload(parsed)) {
    return (
      <AvatarFrame size={size} fitParent={fitParent} className={className} propIcon={propIcon}>
        <DiceBearAvatarSvg data={parsed} />
      </AvatarFrame>
    );
  }

  if (parsed && isV1CustomAvatarData(parsed)) {
    return (
      <AvatarFrame size={size} fitParent={fitParent} className={className} propIcon={propIcon}>
        <CustomAvatarSvg data={parsed} size={customRenderSize} portraitSize={size} />
      </AvatarFrame>
    );
  }

  if (isAvatarImageUrl(avatar)) {
    return (
      <AvatarFrame size={size} fitParent={fitParent} className={className} propIcon={propIcon}>
        <img src={avatar.trim()} alt="" className="avatar-display-img" />
      </AvatarFrame>
    );
  }

  const emoji = avatar && avatar.length <= 4 && !avatar.startsWith("{") ? avatar : "🎓";
  return (
    <AvatarFrame size={size} fitParent={fitParent} className={className} propIcon={propIcon}>
      <span
        className="flex h-full w-full items-center justify-center leading-none"
        style={{ fontSize: Math.max(12, Math.round((fitParent ? 96 : size) * 0.46)) }}
        aria-hidden
      >
        {emoji}
      </span>
    </AvatarFrame>
  );
}
