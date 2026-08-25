"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import type { EventsFeedTimeframe } from "@/lib/client/eventsFeedFilters";

export type EventsFilterValues = {
  category: string;
  organizationKey: string;
  isPaid: "all" | "free" | "paid";
  location: string;
  timeframe: EventsFeedTimeframe;
};

export function EventsFilterSheet({
  open,
  values,
  categories,
  organizations,
  onChange,
  onClose,
  onClear,
}: {
  open: boolean;
  values: EventsFilterValues;
  categories: string[];
  organizations: Array<{ key: string; label: string }>;
  onChange: (patch: Partial<EventsFilterValues>) => void;
  onClose: () => void;
  onClear: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="cq-create-sheet-overlay cq-events-filter-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="cq-create-sheet cq-events-filter-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="cq-create-sheet-grip" aria-hidden />
        <div className="cq-create-sheet-head">
          <h2 id={titleId} className="cq-create-sheet-title">
            Filters
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="cq-create-sheet-close"
            onClick={onClose}
            aria-label="Close filters"
          >
            <X className="h-5 w-5" strokeWidth={2.4} />
          </button>
        </div>

        <div className="cq-events-filter-fields">
          <label className="cq-events-filter-label">
            Category
            <select
              value={values.category}
              onChange={(event) => onChange({ category: event.target.value })}
              className="cq-events-filter-control"
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label className="cq-events-filter-label">
            Organization
            <select
              value={values.organizationKey}
              onChange={(event) => onChange({ organizationKey: event.target.value })}
              className="cq-events-filter-control"
            >
              <option value="">All organizations</option>
              {organizations.map((organization) => (
                <option key={organization.key} value={organization.key}>
                  {organization.label}
                </option>
              ))}
            </select>
          </label>

          <label className="cq-events-filter-label">
            Cost
            <select
              value={values.isPaid}
              onChange={(event) => onChange({ isPaid: event.target.value as EventsFilterValues["isPaid"] })}
              className="cq-events-filter-control"
            >
              <option value="all">Free + Paid</option>
              <option value="free">Free only</option>
              <option value="paid">Paid only</option>
            </select>
          </label>

          <label className="cq-events-filter-label">
            Location
            <input
              value={values.location}
              onChange={(event) => onChange({ location: event.target.value })}
              placeholder="Memorial Union, Ryan Center…"
              className="cq-events-filter-control"
            />
          </label>

          <fieldset className="cq-events-filter-fieldset">
            <legend className="cq-events-filter-legend">Date</legend>
            <div className="cq-events-filter-dates">
              {(
                [
                  { value: "tomorrow", label: "Tomorrow" },
                  { value: "this_month", label: "This Month" },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    onChange({
                      timeframe: values.timeframe === option.value ? "for_you" : option.value,
                    })
                  }
                  aria-pressed={values.timeframe === option.value}
                  className={`cq-events-filter-chip ${
                    values.timeframe === option.value ? "cq-events-filter-chip--on" : ""
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="cq-events-filter-footer">
          <button type="button" className="cq-events-filter-clear" onClick={onClear}>
            Clear filters
          </button>
          <button type="button" className="cq-events-filter-apply" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
