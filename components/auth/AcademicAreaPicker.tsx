"use client";

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
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
      <label htmlFor="cq-academic-search" className="cq-onboard-support">
        What are you studying? <span className="text-slate-400">(optional)</span>
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
            />
          </div>
          <div className="cq-onboard-major-list" role="listbox" aria-label="Academic areas and majors">
            {(query.trim() ? choices.majors : []).map((opt) => (
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
            {choices.areas.map((opt) => {
              const selected = academicArea === opt.id && !major;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`cq-onboard-choice cq-onboard-choice--row ${selected ? "cq-onboard-choice--selected" : ""}`}
                  onClick={() => {
                    onChange({
                      academicArea: opt.id,
                      major: null,
                    });
                    setQuery("");
                  }}
                >
                  <span>{opt.label}</span>
                  {selected ? <Check className="h-5 w-5 shrink-0" aria-hidden /> : null}
                </button>
              );
            })}
            {!query.trim() ? (
              <p className="cq-onboard-support mt-2">
                Pick a broad area if you don&apos;t see your major. You can skip this.
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
