"use client";

import { useState } from "react";
import { manageableBusinesses, type BusinessGrant } from "@/lib/localBusiness/access";

type SwitchBusiness = BusinessGrant & { name: string };

export function BusinessSwitcher({
  businesses,
  activePartnerId,
  onSwitch,
}: {
  businesses: SwitchBusiness[];
  activePartnerId: string;
  onSwitch: (partnerId: string) => void;
}) {
  const choices = manageableBusinesses(businesses);
  const [open, setOpen] = useState(false);
  if (choices.length < 2) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        className="rounded-full border border-white/20 px-3 py-2 text-xs font-bold"
        aria-expanded={open}
        aria-controls="business-switch-list"
        onClick={() => setOpen((current) => !current)}
      >
        Switch Business
      </button>
      {open ? (
        <ul id="business-switch-list" role="listbox" aria-label="Businesses you manage" className="mt-2 space-y-1">
          {choices.map((business) => {
            const active = business.partnerId === activePartnerId;
            return (
              <li key={business.partnerId}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl px-3 py-2 text-left text-sm font-semibold ${
                    active ? "bg-white text-uri-navy" : "bg-white/10"
                  }`}
                  onClick={() => {
                    setOpen(false);
                    if (!active) onSwitch(business.partnerId);
                  }}
                >
                  <span className="min-w-0 break-words">{business.name}</span>
                  {active ? <span className="shrink-0 text-xs">Active</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
