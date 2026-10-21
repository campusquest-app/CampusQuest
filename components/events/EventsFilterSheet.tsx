"use client";

import { useId } from "react";
import {
  Briefcase,
  Dumbbell,
  GraduationCap,
  MessageCircle,
  Theater,
  Trophy,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { CqModalLayer } from "@/components/ui/CqModalLayer";
import { EVENTS_CATEGORY_RAIL, EVENTS_FILTER_CATEGORY_LABELS } from "@/lib/client/eventCardPresentation";
import type { EventsFeedFilterState } from "@/lib/client/eventsFeedQuery";
import type { EventsWhenFilter } from "@/lib/client/eventsFeedFilters";

const ICONS: Record<string, LucideIcon> = {
  trophy: Trophy,
  users: Users,
  drama: Theater,
  briefcase: Briefcase,
  cap: GraduationCap,
  dumbbell: Dumbbell,
  chat: MessageCircle,
};

const WHEN_OPTIONS: Array<{ value: EventsWhenFilter; label: string }> = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "this_weekend", label: "This Weekend" },
  { value: "this_week", label: "This Week" },
];

export function EventsFilterSheet({
  open,
  draft,
  resultCount,
  organizations,
  sports,
  onChange,
  onApply,
  onClear,
  onClose,
}: {
  open: boolean;
  draft: EventsFeedFilterState;
  resultCount: number;
  organizations: Array<{ key: string; label: string }>;
  sports?: string[];
  onChange: (next: EventsFeedFilterState) => void;
  onApply: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const titleId = useId();

  function toggleCategory(id: string) {
    const selected = draft.categories.includes(id);
    const categories = selected ? draft.categories.filter((entry) => entry !== id) : [...draft.categories, id];
    onChange({
      ...draft,
      categories,
      sport: id === "Athletics" && selected ? "" : draft.sport,
    });
  }

  function toggleWhen(value: EventsWhenFilter) {
    const selected = draft.when.includes(value);
    onChange({
      ...draft,
      when: selected ? draft.when.filter((entry) => entry !== value) : [...draft.when, value],
    });
  }

  return (
    <CqModalLayer
      open={open}
      onDismiss={onClose}
      labelledBy={titleId}
      placement="dialog"
      panelClassName="cq-events-filter-panel border border-white/15 bg-uri-navy shadow-2xl"
    >
      <header className="cq-modal-header cq-events-filter-header">
        <div>
          <h2 id={titleId} className="cq-events-filter-title">
            Filter Events
          </h2>
          <p className="cq-events-filter-subtitle">
            {resultCount === 1 ? "1 matching event" : `${resultCount} matching events`}
          </p>
        </div>
        <button type="button" className="cq-events-filter-close" onClick={onClose} aria-label="Close filters">
          <X className="h-5 w-5" strokeWidth={2.4} />
        </button>
      </header>

      <div className="cq-modal-body cq-events-filter-grid">
        <fieldset className="cq-events-filter-fieldset">
          <legend className="cq-events-filter-legend">Categories</legend>
          <div className="cq-events-filter-checks">
            {EVENTS_CATEGORY_RAIL.map((category) => {
              const Icon = ICONS[category.icon] ?? Trophy;
              const checked = draft.categories.includes(category.id);
              return (
                <label
                  key={category.id}
                  className={`cq-events-filter-check cq-events-filter-check--${category.accent}${
                    checked ? " cq-events-filter-check--on" : ""
                  }`}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggleCategory(category.id)} />
                  <span className="cq-events-filter-check-icon" aria-hidden>
                    <Icon className="h-4 w-4" strokeWidth={2.1} />
                  </span>
                  <span>{EVENTS_FILTER_CATEGORY_LABELS[category.id]}</span>
                </label>
              );
            })}
          </div>
          {draft.categories.includes("Athletics") && (sports?.length ?? 0) > 0 ? (
            <label className="cq-events-filter-label">
              Sport
              <select
                value={draft.sport}
                onChange={(event) => onChange({ ...draft, sport: event.target.value })}
                className="cq-events-filter-control"
              >
                <option value="">All sports</option>
                {sports!.map((sport) => (
                  <option key={sport} value={sport}>
                    {sport}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </fieldset>

        <fieldset className="cq-events-filter-fieldset">
          <legend className="cq-events-filter-legend">When</legend>
          <div className="cq-events-filter-checks">
            {WHEN_OPTIONS.map((option) => {
              const checked = draft.when.includes(option.value);
              return (
                <label
                  key={option.value}
                  className={`cq-events-filter-check${checked ? " cq-events-filter-check--on" : ""}`}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggleWhen(option.value)} />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="cq-events-filter-fieldset">
          <legend className="cq-events-filter-legend">Other</legend>
          <div className="cq-events-filter-checks">
            <label className={`cq-events-filter-check${draft.isPaid === "free" ? " cq-events-filter-check--on" : ""}`}>
              <input
                type="checkbox"
                checked={draft.isPaid === "free"}
                onChange={() => onChange({ ...draft, isPaid: draft.isPaid === "free" ? "all" : "free" })}
              />
              <span>Free events</span>
            </label>
            <label className={`cq-events-filter-check${draft.foodOnly ? " cq-events-filter-check--on" : ""}`}>
              <input
                type="checkbox"
                checked={draft.foodOnly}
                onChange={() => onChange({ ...draft, foodOnly: !draft.foodOnly })}
              />
              <span>Events with food</span>
            </label>
          </div>
          {organizations.length > 0 ? (
            <label className="cq-events-filter-label">
              Organization
              <select
                value={draft.organizationKey}
                onChange={(event) => onChange({ ...draft, organizationKey: event.target.value })}
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
          ) : null}
          <label className="cq-events-filter-label">
            Location
            <input
              value={draft.location}
              onChange={(event) => onChange({ ...draft, location: event.target.value })}
              placeholder="Memorial Union, Ryan Center…"
              className="cq-events-filter-control"
            />
          </label>
        </fieldset>
      </div>

      <footer className="cq-modal-footer cq-events-filter-footer">
        <button type="button" className="cq-events-filter-clear" onClick={onClear}>
          Reset
        </button>
        <button type="button" className="cq-events-filter-apply" onClick={onApply}>
          Apply Filters
        </button>
      </footer>
    </CqModalLayer>
  );
}
