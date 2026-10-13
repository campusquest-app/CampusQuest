"use client";

import { useEffect, useId, useRef } from "react";
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

function showEventsLabel(count: number): string {
  return `Show ${count} ${count === 1 ? "event" : "events"}`;
}

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
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = Array.from(root.querySelectorAll<HTMLElement>("button, input, select, textarea, [href], [tabindex]:not([tabindex='-1'])")).filter(
        (element) => !element.hasAttribute("disabled") && element.tabIndex !== -1,
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  if (!open) return null;

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
    <div className="cq-create-sheet-overlay cq-events-filter-overlay" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className="cq-create-sheet cq-events-filter-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="cq-create-sheet-grip cq-events-filter-grip" aria-hidden />
        <div className="cq-create-sheet-head">
          <h2 id={titleId} className="cq-create-sheet-title">
            Filter Events
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

        <div className="cq-events-filter-grid">
          <fieldset className="cq-events-filter-fieldset">
            <legend className="cq-events-filter-legend">Categories</legend>
            <div className="cq-events-filter-checks">
              {EVENTS_CATEGORY_RAIL.map((category) => {
                const Icon = ICONS[category.icon] ?? Trophy;
                const checked = draft.categories.includes(category.id);
                return (
                  <label key={category.id} className={`cq-events-filter-check cq-events-filter-check--${category.accent}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCategory(category.id)}
                    />
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
              {WHEN_OPTIONS.map((option) => (
                <label key={option.value} className="cq-events-filter-check">
                  <input
                    type="checkbox"
                    checked={draft.when.includes(option.value)}
                    onChange={() => toggleWhen(option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="cq-events-filter-fieldset">
            <legend className="cq-events-filter-legend">Other</legend>
            <div className="cq-events-filter-checks">
              <label className="cq-events-filter-check">
                <input
                  type="checkbox"
                  checked={draft.isPaid === "free"}
                  onChange={() => onChange({ ...draft, isPaid: draft.isPaid === "free" ? "all" : "free" })}
                />
                <span>Free events</span>
              </label>
              <label className="cq-events-filter-check">
                <input
                  type="checkbox"
                  checked={draft.foodOnly}
                  onChange={() => onChange({ ...draft, foodOnly: !draft.foodOnly })}
                />
                <span>Events with food</span>
              </label>
              {/* Nearby stays unavailable: events have venues, but the feed has no viewer location or distance. */}
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

        <div className="cq-events-filter-footer">
          <button type="button" className="cq-events-filter-clear" onClick={onClear}>
            Clear all
          </button>
          <button type="button" className="cq-events-filter-apply" onClick={onApply}>
            {showEventsLabel(resultCount)}
          </button>
        </div>
      </div>
    </div>
  );
}
