"use client";

import type { ReactNode } from "react";
import type { DiceBearAvatarV2, DiceBearStyleId } from "@/lib/dicebearAvatar";
import {
  BG_FANTASY_PRESETS,
  HAIR_COLOR_SWATCHES,
  SKIN_TONE_SWATCHES,
  dicebearAdvancedUi as U,
  hairstyleNumberLabel,
} from "@/lib/dicebearAdvancedOptions";

function ForgeSection({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-amber-400/20 bg-gradient-to-br from-black/30 via-uri-navy/40 to-uri-keaney/10 p-3 sm:p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="flex items-start gap-2 mb-3">
        <span className="text-lg shrink-0 drop-shadow-[0_0_8px_rgba(251,191,36,0.35)]" aria-hidden>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200/95 leading-snug break-words">
            {title}
          </p>
          {subtitle ? (
            <p className="text-[10px] text-white/45 mt-1 leading-relaxed break-words">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}

/** Text option chips: wrap in a responsive grid so labels never overflow horizontally. */
function OptionGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-4 gap-2">{children}</div>;
}

/** Compact color swatches with captions below. */
function SwatchGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-x-2 gap-y-3">{children}</div>
  );
}

const CHIP =
  "inline-flex min-w-0 w-full min-h-[2.75rem] items-start rounded-xl border px-2.5 py-2 text-left text-[11px] font-medium leading-snug text-white/90 break-words [overflow-wrap:anywhere] hyphens-auto";

const BACKDROP_CARD =
  "flex min-w-0 w-full min-h-[3.25rem] flex-col justify-center gap-1 rounded-xl border px-2.5 py-2.5 text-left";

function jsonEq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function DiceBearBackgroundPicker({
  data,
  applyBg,
}: {
  data: DiceBearAvatarV2;
  applyBg: (backgroundColor: string[]) => void;
}) {
  const o = data.options;

  return (
    <ForgeSection icon="🌌" title="Background" subtitle="Color behind your avatar">
      <OptionGrid>
        {BG_FANTASY_PRESETS.map((b) => {
          const active = jsonEq(o.backgroundColor, b.backgroundColor);
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => applyBg(b.backgroundColor)}
              className={`relative ${BACKDROP_CARD} ${
                active
                  ? "border-2 border-uri-keaney bg-uri-keaney/20 shadow-[0_0_18px_rgba(104,171,232,0.32)] ring-2 ring-uri-keaney/35"
                  : "border-white/12 bg-white/5 hover:border-white/25"
              }`}
            >
              {active ? (
                <span
                  className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-uri-keaney text-[11px] font-bold text-white shadow-md"
                  aria-hidden
                >
                  ✓
                </span>
              ) : null}
              <span className="text-[11px] font-semibold text-white leading-snug truncate w-full pr-5">{b.label}</span>
              <span className="text-[10px] text-white/45 leading-snug truncate w-full">{b.sub}</span>
            </button>
          );
        })}
      </OptionGrid>
    </ForgeSection>
  );
}

function skinPatch(style: DiceBearStyleId, skinColor: string[]): Record<string, unknown> {
  if (style === "micah") return { baseColor: skinColor };
  return { skinColor };
}

export function DiceBearForgeControls({
  data,
  patchOptions,
  applyBg,
  hideBackground = false,
}: {
  data: DiceBearAvatarV2;
  patchOptions: (partial: Record<string, unknown>) => void;
  applyBg: (backgroundColor: string[]) => void;
  hideBackground?: boolean;
}) {
  const st = data.style;
  const o = data.options;

  const loreleiShared = (neutral: boolean) => (
    <>
      <ForgeSection icon="💇" title="Hairstyles">
        <OptionGrid>
          {U.LORELEI_HAIR.map((h, i) => (
            <button
              key={h.v}
              type="button"
              onClick={() => patchOptions({ hair: [h.v] })}
              className={`${CHIP} transition-all ${
                jsonEq(o.hair, [h.v]) ? "border-uri-keaney bg-uri-keaney/25 text-white" : "border-white/12 bg-white/5 text-white/85 hover:border-uri-keaney/40"
              }`}
            >
              {hairstyleNumberLabel(i)}
            </button>
          ))}
        </OptionGrid>
      </ForgeSection>
      <ForgeSection icon="👁️" title="Eyes" subtitle="Gaze & intent">
        <OptionGrid>
          {U.LORELEI_EYES.map((h) => (
            <button
              key={h.v}
              type="button"
              onClick={() => patchOptions({ eyes: [h.v] })}
              className={`${CHIP} ${
                jsonEq(o.eyes, [h.v]) ? "border-uri-keaney bg-uri-keaney/25 text-white" : "border-white/12 bg-white/5 text-white/85"
              }`}
            >
              {h.label}
            </button>
          ))}
        </OptionGrid>
      </ForgeSection>
      <ForgeSection icon="🗣️" title="Expression" subtitle="Mouth & mood">
        <OptionGrid>
          {U.LORELEI_MOUTH.map((h) => (
            <button
              key={h.v}
              type="button"
              onClick={() => patchOptions({ mouth: [h.v] })}
              className={`${CHIP} ${
                jsonEq(o.mouth, [h.v]) ? "border-uri-keaney bg-uri-keaney/25 text-white" : "border-white/12 bg-white/5 text-white/85"
              }`}
            >
              {h.label}
            </button>
          ))}
        </OptionGrid>
      </ForgeSection>
      <ForgeSection icon="👓" title="Spectacles" subtitle="Worn arcana">
        <OptionGrid>
          {U.LORELEI_GLASSES.map((h) => (
            <button
              key={String(h.v)}
              type="button"
              onClick={() =>
                h.v == null
                  ? patchOptions({ glassesProbability: 0 })
                  : patchOptions({ glasses: [h.v], glassesProbability: 100 })
              }
              className={`${CHIP} ${
                h.v == null
                  ? o.glassesProbability === 0 ||
                      !Array.isArray(o.glasses) ||
                      o.glasses.length === 0
                    ? "border-uri-keaney bg-uri-keaney/25 text-white"
                    : "border-white/12 bg-white/5"
                  : jsonEq(o.glasses, [h.v])
                    ? "border-uri-keaney bg-uri-keaney/25 text-white"
                    : "border-white/12 bg-white/5 text-white/85"
              }`}
            >
              {h.label}
            </button>
          ))}
        </OptionGrid>
      </ForgeSection>
      <ForgeSection icon="🌸" title="Hair charm" subtitle="Floral accent">
        <OptionGrid>
          {U.LORELEI_HAT_FLOWERS.map((h) => (
            <button
              key={String(h.v)}
              type="button"
              onClick={() =>
                h.v
                  ? patchOptions({ hairAccessories: ["flowers"], hairAccessoriesProbability: 100 })
                  : patchOptions({ hairAccessoriesProbability: 0 })
              }
              className={`${CHIP} ${
                h.v
                  ? jsonEq(o.hairAccessories, ["flowers"]) &&
                      (o.hairAccessoriesProbability as number) !== 0
                    ? "border-uri-keaney bg-uri-keaney/25 text-white"
                    : "border-white/12 bg-white/5 text-white/85"
                  : (o.hairAccessoriesProbability === 0 || o.hairAccessories == null) && !h.v
                    ? "border-uri-keaney bg-uri-keaney/25 text-white"
                    : "border-white/12 bg-white/5 text-white/85"
              }`}
            >
              {h.label}
            </button>
          ))}
        </OptionGrid>
      </ForgeSection>
    </>
  );

  const pixelShared = (neutral: boolean) => (
    <>
      <ForgeSection icon="💇" title="Hairstyles">
        <OptionGrid>
          {U.PIXEL_HAIR.map((h, i) => (
            <button
              key={h.v}
              type="button"
              onClick={() => patchOptions({ hair: [h.v] })}
              className={`${CHIP} ${
                jsonEq(o.hair, [h.v]) ? "border-uri-keaney bg-uri-keaney/25 text-white" : "border-white/12 bg-white/5 text-white/85"
              }`}
            >
              {hairstyleNumberLabel(i)}
            </button>
          ))}
        </OptionGrid>
      </ForgeSection>
      <ForgeSection icon="👁️" title="Eyes" subtitle="Pixel gaze">
        <OptionGrid>
          {U.PIXEL_EYES.map((h) => (
            <button
              key={h.v}
              type="button"
              onClick={() => patchOptions({ eyes: [h.v] })}
              className={`${CHIP} ${
                jsonEq(o.eyes, [h.v]) ? "border-uri-keaney bg-uri-keaney/25" : "border-white/12 bg-white/5"
              }`}
            >
              {h.label}
            </button>
          ))}
        </OptionGrid>
      </ForgeSection>
      <ForgeSection icon="🗣️" title="Mouth" subtitle="Battle cries & smiles">
        <OptionGrid>
          {U.PIXEL_MOUTH.map((h) => (
            <button
              key={h.v}
              type="button"
              onClick={() => patchOptions({ mouth: [h.v] })}
              className={`${CHIP} ${
                jsonEq(o.mouth, [h.v]) ? "border-uri-keaney bg-uri-keaney/25" : "border-white/12 bg-white/5"
              }`}
            >
              {h.label}
            </button>
          ))}
        </OptionGrid>
      </ForgeSection>
      <ForgeSection icon="👓" title="Glasses" subtitle="Light & shadow lenses">
        <OptionGrid>
          {U.PIXEL_GLASSES.map((h) => (
            <button
              key={String(h.v)}
              type="button"
              onClick={() =>
                h.v == null
                  ? patchOptions({ glassesProbability: 0 })
                  : patchOptions({ glasses: [h.v], glassesProbability: 100 })
              }
              className={`${CHIP} ${
                h.v == null
                  ? (o.glassesProbability === 0 || !o.glasses) && o.glasses == null
                    ? "border-uri-keaney bg-uri-keaney/25"
                    : "border-white/12 bg-white/5"
                  : jsonEq(o.glasses, [h.v])
                    ? "border-uri-keaney bg-uri-keaney/25"
                    : "border-white/12 bg-white/5"
              }`}
            >
              {h.label}
            </button>
          ))}
        </OptionGrid>
      </ForgeSection>
      <ForgeSection icon="🎩" title="Helm & hat" subtitle="Crowns & caps">
        <OptionGrid>
          {U.PIXEL_HAT.map((h) => (
            <button
              key={String(h.v)}
              type="button"
              onClick={() =>
                h.v == null ? patchOptions({ hatProbability: 0 }) : patchOptions({ hat: [h.v], hatProbability: 100 })
              }
              className={`${CHIP} ${
                h.v == null
                  ? (o.hatProbability === 0 || !o.hat) && !o.hat
                    ? "border-uri-keaney bg-uri-keaney/25"
                    : "border-white/12 bg-white/5"
                  : jsonEq(o.hat, [h.v])
                    ? "border-uri-keaney bg-uri-keaney/25"
                    : "border-white/12 bg-white/5"
              }`}
            >
              {h.label}
            </button>
          ))}
        </OptionGrid>
      </ForgeSection>
      <ForgeSection icon="✨" title="Relics" subtitle="Charms & trinkets">
        <OptionGrid>
          {U.PIXEL_ACCESSORIES.map((h) => (
            <button
              key={String(h.v)}
              type="button"
              onClick={() =>
                h.v == null
                  ? patchOptions({ accessoriesProbability: 0 })
                  : patchOptions({ accessories: [h.v], accessoriesProbability: 100 })
              }
              className={`${CHIP} ${
                h.v == null
                  ? o.accessoriesProbability === 0 || !o.accessories
                    ? "border-uri-keaney bg-uri-keaney/25"
                    : "border-white/12 bg-white/5"
                  : jsonEq(o.accessories, [h.v])
                    ? "border-uri-keaney bg-uri-keaney/25"
                    : "border-white/12 bg-white/5"
              }`}
            >
              {h.label}
            </button>
          ))}
        </OptionGrid>
      </ForgeSection>
    </>
  );

  const advShared = () => (
    <>
      <ForgeSection icon="💇" title="Hairstyles">
        <OptionGrid>
          {U.ADV_HAIR.map((h, i) => (
            <button
              key={h.v}
              type="button"
              onClick={() => patchOptions({ hair: [h.v] })}
              className={`${CHIP} ${
                jsonEq(o.hair, [h.v]) ? "border-uri-keaney bg-uri-keaney/25" : "border-white/12 bg-white/5"
              }`}
            >
              {hairstyleNumberLabel(i)}
            </button>
          ))}
        </OptionGrid>
      </ForgeSection>
      <ForgeSection icon="👁️" title="Eyes">
        <OptionGrid>
          {U.ADV_EYES.map((h) => (
            <button
              key={h.v}
              type="button"
              onClick={() => patchOptions({ eyes: [h.v] })}
              className={`${CHIP} ${
                jsonEq(o.eyes, [h.v]) ? "border-uri-keaney bg-uri-keaney/25" : "border-white/12 bg-white/5"
              }`}
            >
              {h.label}
            </button>
          ))}
        </OptionGrid>
      </ForgeSection>
      <ForgeSection icon="🗣️" title="Mouth">
        <OptionGrid>
          {U.ADV_MOUTH.map((h) => (
            <button
              key={h.v}
              type="button"
              onClick={() => patchOptions({ mouth: [h.v] })}
              className={`${CHIP} ${
                jsonEq(o.mouth, [h.v]) ? "border-uri-keaney bg-uri-keaney/25" : "border-white/12 bg-white/5"
              }`}
            >
              {h.label}
            </button>
          ))}
        </OptionGrid>
      </ForgeSection>
      <ForgeSection icon="👓" title="Glasses">
        <OptionGrid>
          {U.ADV_GLASSES.map((h) => (
            <button
              key={String(h.v)}
              type="button"
              onClick={() =>
                h.v == null
                  ? patchOptions({ glassesProbability: 0 })
                  : patchOptions({ glasses: [h.v], glassesProbability: 100 })
              }
              className={`${CHIP} ${
                jsonEq(h.v ? [h.v] : null, o.glasses as string[] | null) || (h.v == null && !o.glasses)
                  ? "border-uri-keaney bg-uri-keaney/25"
                  : "border-white/12 bg-white/5"
              }`}
            >
              {h.label}
            </button>
          ))}
        </OptionGrid>
      </ForgeSection>
      <ForgeSection icon="🎭" title="Marks & features" subtitle="Tales worn on the face">
        <OptionGrid>
          {U.ADV_FEATURES.map((h) => (
            <button
              key={String(h.v)}
              type="button"
              onClick={() =>
                h.v == null
                  ? patchOptions({ featuresProbability: 0 })
                  : patchOptions({ features: [h.v], featuresProbability: 100 })
              }
              className={`${CHIP} ${
                h.v == null ? !o.features && o.featuresProbability === 0 : jsonEq(o.features, [h.v])
                  ? "border-uri-keaney bg-uri-keaney/25"
                  : "border-white/12 bg-white/5"
              }`}
            >
              {h.label}
            </button>
          ))}
        </OptionGrid>
      </ForgeSection>
    </>
  );

  const micahBlock = (
    <>
      <ForgeSection icon="💇" title="Hairstyles">
        <OptionGrid>
          {U.MICAH_HAIR.map((h, i) => (
            <button
              key={h.v}
              type="button"
              onClick={() => patchOptions({ hair: [h.v], hairProbability: 100 })}
              className={`${CHIP} ${
                jsonEq(o.hair, [h.v]) ? "border-uri-keaney bg-uri-keaney/25" : "border-white/12 bg-white/5"
              }`}
            >
              {hairstyleNumberLabel(i)}
            </button>
          ))}
        </OptionGrid>
      </ForgeSection>
      <ForgeSection icon="👁️" title="Eyes">
        <OptionGrid>
          {U.MICAH_EYES.map((h) => (
            <button
              key={h.v}
              type="button"
              onClick={() => patchOptions({ eyes: [h.v] })}
              className={`${CHIP} ${
                jsonEq(o.eyes, [h.v]) ? "border-uri-keaney bg-uri-keaney/25" : "border-white/12 bg-white/5"
              }`}
            >
              {h.label}
            </button>
          ))}
        </OptionGrid>
      </ForgeSection>
      <ForgeSection icon="🗣️" title="Expression">
        <OptionGrid>
          {U.MICAH_MOUTH.map((h) => (
            <button
              key={h.v}
              type="button"
              onClick={() => patchOptions({ mouth: [h.v] })}
              className={`${CHIP} ${
                jsonEq(o.mouth, [h.v]) ? "border-uri-keaney bg-uri-keaney/25" : "border-white/12 bg-white/5"
              }`}
            >
              {h.label}
            </button>
          ))}
        </OptionGrid>
      </ForgeSection>
      <ForgeSection icon="👓" title="Glasses">
        <OptionGrid>
          {U.MICAH_GLASSES.map((h) => (
            <button
              key={String(h.v)}
              type="button"
              onClick={() =>
                h.v == null
                  ? patchOptions({ glassesProbability: 0 })
                  : patchOptions({ glasses: [h.v], glassesProbability: 100 })
              }
              className={`${CHIP} ${
                h.v == null ? !o.glasses : jsonEq(o.glasses, [h.v]) ? "border-uri-keaney bg-uri-keaney/25" : "border-white/12 bg-white/5"
              }`}
            >
              {h.label}
            </button>
          ))}
        </OptionGrid>
      </ForgeSection>
      <ForgeSection icon="🥋" title="Raiment" subtitle="Shirt & collar">
        <OptionGrid>
          {U.MICAH_SHIRT.map((h) => (
            <button
              key={h.v}
              type="button"
              onClick={() => patchOptions({ shirt: [h.v] })}
              className={`${CHIP} ${
                jsonEq(o.shirt, [h.v]) ? "border-uri-keaney bg-uri-keaney/25" : "border-white/12 bg-white/5"
              }`}
            >
              {h.label}
            </button>
          ))}
        </OptionGrid>
      </ForgeSection>
    </>
  );

  const peepsBlock = (
    <>
      <ForgeSection icon="💇" title="Hairstyles">
        <OptionGrid>
          {U.PEEPS_HEAD.map((h, i) => (
            <button
              key={h.v}
              type="button"
              onClick={() => patchOptions({ head: [h.v] })}
              className={`${CHIP} ${
                jsonEq(o.head, [h.v]) ? "border-uri-keaney bg-uri-keaney/25" : "border-white/12 bg-white/5"
              }`}
            >
              {hairstyleNumberLabel(i)}
            </button>
          ))}
        </OptionGrid>
      </ForgeSection>
      <ForgeSection icon="🎭" title="Face & mood">
        <OptionGrid>
          {U.PEEPS_FACE.map((h) => (
            <button
              key={h.v}
              type="button"
              onClick={() => patchOptions({ face: [h.v] })}
              className={`${CHIP} ${
                jsonEq(o.face, [h.v]) ? "border-uri-keaney bg-uri-keaney/25" : "border-white/12 bg-white/5"
              }`}
            >
              {h.label}
            </button>
          ))}
        </OptionGrid>
      </ForgeSection>
      <ForgeSection icon="🛡️" title="Face accessories" subtitle="Spectacles & badges">
        <OptionGrid>
          {U.PEEPS_ACCESSORIES.map((h) => (
            <button
              key={String(h.v)}
              type="button"
              onClick={() =>
                h.v == null
                  ? patchOptions({ accessoriesProbability: 0 })
                  : patchOptions({ accessories: [h.v], accessoriesProbability: 100 })
              }
              className={`${CHIP} ${
                h.v == null ? !o.accessories : jsonEq(o.accessories, [h.v]) ? "border-uri-keaney bg-uri-keaney/25" : "border-white/12 bg-white/5"
              }`}
            >
              {h.label}
            </button>
          ))}
        </OptionGrid>
      </ForgeSection>
    </>
  );

  const skinSection = supportsSkinTone(st) ? (
    <ForgeSection icon="🎨" title="Skin tones" subtitle="Realm-born palette">
      <SwatchGrid>
        {SKIN_TONE_SWATCHES.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => patchOptions(skinPatch(st, s.skinColor))}
            className={`flex min-w-0 w-full flex-col items-center gap-1.5 rounded-xl border border-transparent px-1 pb-1 pt-1.5 text-center transition-[opacity,transform] ${
              jsonEq(st === "micah" ? o.baseColor : o.skinColor, s.skinColor) ? "opacity-100" : "opacity-90 hover:opacity-100"
            }`}
          >
            <span
              className={`mx-auto h-9 w-9 shrink-0 rounded-full border-2 shadow-[0_0_12px_rgba(104,171,232,0.2)] ${
                jsonEq(st === "micah" ? o.baseColor : o.skinColor, s.skinColor)
                  ? "border-uri-keaney ring-2 ring-uri-keaney/45"
                  : "border-white/25"
              }`}
              style={{ backgroundColor: `#${s.skinColor[0]}` }}
              aria-hidden
            />
            <span className="w-full text-[10px] text-white/55 leading-snug break-words hyphens-auto [overflow-wrap:anywhere]">
              {s.label}
            </span>
          </button>
        ))}
      </SwatchGrid>
    </ForgeSection>
  ) : null;

  const hairColorSection = supportsHairDye(st) ? (
    <ForgeSection icon="🧴" title="Hair color" subtitle={st === "openPeeps" ? "Hair & head contrast" : "Dye the locks"}>
      <SwatchGrid>
        {HAIR_COLOR_SWATCHES.map((s) => {
          const active =
            st === "openPeeps" ? jsonEq(o.headContrastColor, s.hairColor) : jsonEq(o.hairColor, s.hairColor);
          return (
            <button
              key={s.label}
              type="button"
              onClick={() =>
                st === "openPeeps"
                  ? patchOptions({ headContrastColor: s.hairColor })
                  : patchOptions({ hairColor: s.hairColor })
              }
              className="flex min-w-0 w-full flex-col items-center gap-1.5 rounded-xl border border-transparent px-1 pb-1 pt-1.5 text-center"
            >
              <span
                className={`mx-auto h-8 w-8 shrink-0 rounded-lg border-2 ${
                  active ? "border-uri-gold ring-1 ring-amber-300/45" : "border-white/20"
                }`}
                style={{ backgroundColor: `#${s.hairColor[0]}` }}
                aria-hidden
              />
              <span className="w-full text-[10px] text-white/50 leading-snug break-words hyphens-auto [overflow-wrap:anywhere]">
                {s.label}
              </span>
            </button>
          );
        })}
      </SwatchGrid>
    </ForgeSection>
  ) : null;

  let styleBlock: ReactNode = null;

  switch (st) {
    case "lorelei":
      styleBlock = loreleiShared(false);
      break;
    case "loreleiNeutral":
      styleBlock = loreleiShared(true);
      break;
    case "pixelArt":
      styleBlock = pixelShared(false);
      break;
    case "pixelArtNeutral":
      styleBlock = pixelShared(true);
      break;
    case "adventurer":
    case "adventurerNeutral":
      styleBlock = advShared();
      break;
    case "micah":
      styleBlock = micahBlock;
      break;
    case "openPeeps":
      styleBlock = peepsBlock;
      break;
    default:
      styleBlock = null;
  }

  return (
    <div className="space-y-4 min-w-0">
      {!hideBackground ? <DiceBearBackgroundPicker data={data} applyBg={applyBg} /> : null}
      {skinSection}
      {hairColorSection}
      {styleBlock}
    </div>
  );
}

function supportsSkinTone(style: DiceBearStyleId): boolean {
  return (
    style === "lorelei" ||
    style === "loreleiNeutral" ||
    style === "pixelArt" ||
    style === "pixelArtNeutral" ||
    style === "micah" ||
    style === "adventurer" ||
    style === "adventurerNeutral" ||
    style === "openPeeps"
  );
}

function supportsHairDye(style: DiceBearStyleId): boolean {
  return (
    style === "lorelei" ||
    style === "loreleiNeutral" ||
    style === "pixelArt" ||
    style === "pixelArtNeutral" ||
    style === "micah" ||
    style === "adventurer" ||
    style === "adventurerNeutral" ||
    style === "openPeeps"
  );
}
