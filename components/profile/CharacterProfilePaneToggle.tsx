"use client";

export type CharacterPane = "sheet" | "profile";

/** Flat Character / Profile switch — no card chrome, flows with the page. */
export function CharacterProfilePaneToggle({
  value,
  onChange,
}: {
  value: CharacterPane;
  onChange: (pane: CharacterPane) => void;
}) {
  return (
    <div className="cq-profile-pane-toggle border-b border-white/10" role="tablist" aria-label="Character or profile">
      {(
        [
          { id: "sheet" as const, label: "Character", icon: "⚔️" },
          { id: "profile" as const, label: "Profile", icon: "👤" },
        ] as const
      ).map((pane) => {
        const selected = value === pane.id;
        return (
          <button
            key={pane.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(pane.id)}
            className={`relative flex flex-1 items-center justify-center gap-1.5 py-3 text-xs font-bold uppercase tracking-wide transition-colors ${
              selected ? "text-white" : "text-white/45 hover:text-white/75"
            }`}
          >
            <span className="text-sm leading-none" aria-hidden>
              {pane.icon}
            </span>
            <span>{pane.label}</span>
            {selected ? (
              <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-uri-keaney" aria-hidden />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
