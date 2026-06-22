"use client";

export type ProfileTab = "posts" | "collectibles" | "activity";

const TABS: { id: ProfileTab; label: string }[] = [
  { id: "posts", label: "Posts" },
  { id: "collectibles", label: "The Codex" },
  { id: "activity", label: "Activity" },
];

export function ProfileTabNav({
  active,
  onChange,
  locked = false,
}: {
  active: ProfileTab;
  onChange: (tab: ProfileTab) => void;
  locked?: boolean;
}) {
  return (
    <nav className="cq-profile-tabs sticky top-0 z-10 flex border-b" aria-label="Profile sections">
      {TABS.map((tab) => {
        const selected = active === tab.id;
        const isLockedTab = locked && tab.id !== "posts";
        return (
          <button
            key={tab.id}
            type="button"
            disabled={locked}
            onClick={() => onChange(tab.id)}
            className={`relative flex flex-1 items-center justify-center gap-1 px-1 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ${
              selected ? "text-white" : "text-white/45 hover:text-white/75"
            } ${locked ? "cursor-default opacity-55" : ""}`}
            aria-current={selected ? "page" : undefined}
            aria-disabled={isLockedTab || locked ? true : undefined}
          >
            <span>{tab.label}</span>
            {isLockedTab ? <span aria-hidden>🔒</span> : null}
            {selected ? (
              <span className="absolute inset-x-2 bottom-0 h-px bg-white" aria-hidden />
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
