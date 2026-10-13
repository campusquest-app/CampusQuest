"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  ACADEMIC_AREA_OPTIONS,
  academicAreaLabel,
  filterAcademicChoices,
  type AcademicAreaId,
} from "@/lib/onboarding/academicAreas";

export function AcademicAreaPicker({
  academicArea,
  major,
  onChange,
}: {
  academicArea: AcademicAreaId | null;
  major: string | null;
  onChange: (next: { academicArea: AcademicAreaId | null; major: string | null }) => void;
}) {
  const [query, setQuery] = useState("");
  const choices = useMemo(() => filterAcademicChoices(query), [query]);
  const selectedLabel = major || academicAreaLabel(academicArea);

  return (
    <div className="cq-onboard-major">
      <label htmlFor="cq-academic-search" className="cq-onboard-field-label">
        Major or academic area <span className="font-semibold text-slate-400">(optional)</span>
      </label>
      {selectedLabel ? (
        <button
          type="button"
          className="cq-onboard-major-selected"
          onClick={() => {
            onChange({ academicArea: null, major: null });
            setQuery("");
          }}
        >
          <span>{selectedLabel}</span>
          <span className="cq-onboard-major-clear">Clear</span>
        </button>
      ) : (
        <>
          <div className="cq-onboard-search cq-onboard-search--input">
            <Search className="h-4 w-4 text-slate-400" aria-hidden />
            <input
              id="cq-academic-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search majors or academic areas"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              role="combobox"
              aria-expanded={query.trim().length > 0}
              aria-controls="cq-academic-suggestions"
              aria-autocomplete="list"
            />
          </div>
          {query.trim() ? (
            <div
              id="cq-academic-suggestions"
              className="cq-onboard-major-list"
              role="listbox"
              aria-label="Academic areas and majors"
            >
              {choices.majors.slice(0, 6).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  className="cq-onboard-choice cq-onboard-choice--row"
                  onClick={() => {
                    onChange({ academicArea: opt.academicArea, major: opt.label });
                    setQuery("");
                  }}
                  aria-selected={false}
                >
                  <span>
                    <span className="block">{opt.label}</span>
                    <span className="block text-xs text-slate-500">{academicAreaLabel(opt.academicArea)}</span>
                  </span>
                </button>
              ))}
              {choices.areas.slice(0, 4).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="cq-onboard-choice cq-onboard-choice--row"
                  onClick={() => {
                    onChange({ academicArea: opt.id, major: null });
                    setQuery("");
                  }}
                >
                  <span>{opt.label}</span>
                </button>
              ))}
              {choices.majors.length === 0 && choices.areas.length === 0 ? (
                <p className="cq-onboard-support">No matches. Try another major or area.</p>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              className="cq-onboard-choice cq-onboard-choice--row mt-3"
              onClick={() => onChange({ academicArea: "undecided", major: null })}
            >
              Undecided / Not sure
            </button>
          )}
        </>
      )}
    </div>
  );
}
