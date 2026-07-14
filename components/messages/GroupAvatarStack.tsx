"use client";

import { AvatarDisplay } from "@/components/AvatarDisplay";
import { Users } from "lucide-react";

export type GroupAvatarMember = {
  avatarUrl?: string | null;
  displayName?: string;
};

/**
 * Polished stacked group avatar — up to 3 circular crops with consistent
 * borders (not the old cramped overlap). Falls back to initials / icon.
 */
export function GroupAvatarStack({
  members,
  avatars,
  size = 44,
}: {
  /** Preferred: members with avatar + name for initials fallback. */
  members?: GroupAvatarMember[];
  /** Legacy path used by Inbox list rows. */
  avatars?: string[];
  size?: number;
}) {
  const fromMembers =
    members
      ?.slice(0, 3)
      .map((m) => ({
        avatar: (m.avatarUrl ?? "").trim(),
        label: (m.displayName ?? "").trim(),
      }))
      .filter((m) => m.avatar || m.label) ?? [];

  const fromAvatars =
    avatars
      ?.filter(Boolean)
      .slice(0, 3)
      .map((avatar) => ({ avatar, label: "" })) ?? [];

  const shown = fromMembers.length > 0 ? fromMembers : fromAvatars;

  if (shown.length === 0) {
    return (
      <div
        className="cq-group-avatar cq-group-avatar--empty flex items-center justify-center rounded-full bg-[#1c1c1e]"
        style={{ width: size, height: size }}
        aria-hidden
      >
        <Users className="text-white/55" style={{ width: size * 0.42, height: size * 0.42 }} strokeWidth={1.75} />
      </div>
    );
  }

  if (shown.length === 1) {
    return (
      <div
        className="cq-group-avatar overflow-hidden rounded-full bg-[#262626] ring-1 ring-white/10"
        style={{ width: size, height: size }}
        aria-hidden
      >
        <MemberTile avatar={shown[0]!.avatar} label={shown[0]!.label} size={size} />
      </div>
    );
  }

  const tile = Math.round(size * (shown.length === 2 ? 0.62 : 0.52));
  const positions =
    shown.length === 2
      ? [
          { top: Math.round(size * 0.02), left: Math.round(size * 0.02) },
          { top: Math.round(size * 0.34), left: Math.round(size * 0.36) },
        ]
      : [
          { top: Math.round(size * 0.02), left: Math.round(size * 0.24) },
          { top: Math.round(size * 0.4), left: Math.round(size * 0.02) },
          { top: Math.round(size * 0.4), left: Math.round(size * 0.46) },
        ];

  return (
    <div className="cq-group-avatar relative" style={{ width: size, height: size }} aria-hidden>
      {shown.map((member, index) => (
        <div
          key={`${member.avatar || member.label}-${index}`}
          className="absolute overflow-hidden rounded-full bg-[#262626] ring-[1.5px] ring-black"
          style={{
            width: tile,
            height: tile,
            top: positions[index]?.top ?? 0,
            left: positions[index]?.left ?? 0,
            zIndex: index + 1,
          }}
        >
          <MemberTile avatar={member.avatar} label={member.label} size={tile} />
        </div>
      ))}
    </div>
  );
}

function MemberTile({ avatar, label, size }: { avatar: string; label: string; size: number }) {
  if (avatar) {
    return <AvatarDisplay avatar={avatar} fitParent size={size} />;
  }
  const initial = (label.trim().charAt(0) || "?").toUpperCase();
  return (
    <div
      className="flex h-full w-full items-center justify-center bg-[#2c2c2e] font-semibold text-white/80"
      style={{ fontSize: Math.max(10, Math.round(size * 0.36)) }}
    >
      {initial}
    </div>
  );
}
