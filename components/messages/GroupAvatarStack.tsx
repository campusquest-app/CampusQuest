"use client";

import { AvatarDisplay } from "@/components/AvatarDisplay";

export function GroupAvatarStack({
  avatars,
  size = 56,
}: {
  avatars: string[];
  size?: number;
}) {
  const shown = avatars.filter(Boolean).slice(0, 3);
  if (shown.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-full bg-[#262626] text-lg text-white/70"
        style={{ width: size, height: size }}
        aria-hidden
      >
        👥
      </div>
    );
  }

  if (shown.length === 1) {
    return (
      <div className="overflow-hidden rounded-full bg-[#262626]" style={{ width: size, height: size }}>
        <AvatarDisplay avatar={shown[0]!} fitParent size={size} />
      </div>
    );
  }

  const tile = Math.round(size * divisorForCount(shown.length));
  return (
    <div className="relative rounded-full bg-[#262626]" style={{ width: size, height: size }} aria-hidden>
      {shown.map((avatar, index) => (
        <div
          key={`${avatar}-${index}`}
          className="absolute overflow-hidden rounded-full border border-black bg-[#262626]"
          style={{
            width: tile,
            height: tile,
            ...positionForIndex(index, shown.length, size, tile),
          }}
        >
          <AvatarDisplay avatar={avatar} fitParent size={tile} />
        </div>
      ))}
    </div>
  );
}

function divisorForCount(count: number): number {
  if (count === 2) return 0.58;
  return 0.5;
}

function positionForIndex(
  index: number,
  count: number,
  container: number,
  tile: number,
): { top: number; left: number } {
  if (count === 2) {
    return index === 0
      ? { top: Math.round(container * 0.06), left: Math.round(container * 0.04) }
      : { top: Math.round(container * 0.36), left: Math.round(container * 0.38) };
  }
  const positions = [
    { top: Math.round(container * 0.04), left: Math.round(container * 0.22) },
    { top: Math.round(container * 0.34), left: Math.round(container * 0.02) },
    { top: Math.round(container * 0.34), left: Math.round(container * 0.42) },
  ];
  return positions[index] ?? positions[0]!;
}
