"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ACTIVITIES } from "@/lib/activities";
import type { ActivityDefinition, StatKey } from "@/lib/types";
import { STAT_ICONS, STAT_LABELS } from "@/lib/types";
import type { LogActivityOptions } from "@/lib/store";
import { MAX_ACTIVITY_MINUTES } from "@/lib/store";
import type { Character } from "@/lib/types";

const STAT_ORDER: StatKey[] = ["strength", "stamina", "knowledge", "social", "focus"];

const STAT_ACCENT: Record<StatKey, string> = {
  strength: "border-l-amber-400/70",
  stamina: "border-l-teal-400/70",
  knowledge: "border-l-uri-keaney/80",
  social: "border-l-emerald-400/70",
  focus: "border-l-violet-400/70",
};

function groupActivitiesByStat(): { stat: StatKey; items: ActivityDefinition[] }[] {
  const groups = new Map<StatKey, ActivityDefinition[]>();
  for (const act of ACTIVITIES) {
    const list = groups.get(act.stat) ?? [];
    list.push(act);
    groups.set(act.stat, list);
  }
  return STAT_ORDER.map((stat) => ({ stat, items: groups.get(stat) ?? [] }));
}

export function ManualLogScreen({
  onLog,
  onBack,
  disabled,
}: {
  onLog: (activityId: string, options?: LogActivityOptions) => Character | null;
  onBack?: () => void;
  disabled?: boolean;
}) {
  const byStat = useMemo(() => groupActivitiesByStat(), []);
  const [selectedStat, setSelectedStat] = useState<StatKey | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<ActivityDefinition | null>(null);
  const [minutes, setMinutes] = useState("");
  const [note, setNote] = useState("");
  const [proof, setProof] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const proofFileRef = useRef<HTMLInputElement>(null);

  const statGroup = selectedStat ? byStat.find((g) => g.stat === selectedStat) : null;
  const needsMinutes = selectedActivity?.usesMinutes ?? false;

  function resetForm() {
    setMinutes("");
    setNote("");
    setProof("");
    setSubmitError(null);
  }

  function handleBack() {
    if (selectedActivity) {
      setSelectedActivity(null);
      resetForm();
      return;
    }
    if (selectedStat) {
      setSelectedStat(null);
      return;
    }
    onBack?.();
  }

  function handleProofFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setSubmitError("Please choose an image file (e.g. JPEG, PNG).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setProof(reader.result as string);
      setSubmitError(null);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedActivity) return;

    const proofValue = proof.trim() || note.trim();
    if (!proofValue) {
      setSubmitError("Add a note or proof link so we can verify your activity.");
      return;
    }

    if (needsMinutes) {
      const m = parseInt(minutes, 10);
      if (Number.isNaN(m) || m < 0) {
        setSubmitError("Enter how many minutes you spent.");
        return;
      }
    }

    const options: LogActivityOptions = { proofUrl: proofValue };
    if (needsMinutes) {
      const raw = parseInt(minutes, 10) || 0;
      options.minutes = Math.min(MAX_ACTIVITY_MINUTES, Math.max(0, raw));
    }
    if (note.trim() && proof.trim()) {
      options.tags = [note.trim()];
    }

    setSubmitError(null);
    const updated = onLog(selectedActivity.id, options);
    if (updated) {
      setSelectedActivity(null);
      setSelectedStat(null);
      resetForm();
    } else {
      setSubmitError("Could not log activity. Check your proof or note and try again.");
    }
  }

  const showForm = Boolean(selectedActivity);
  const showActivities = Boolean(selectedStat && !selectedActivity);
  const showStats = !selectedStat;

  return (
    <div className="cq-tab-shell mx-auto w-full max-w-lg space-y-6 pb-8">
      <header className="cq-screen-header">
        <div className="flex items-start gap-2">
          {(selectedStat || onBack) ? (
            <button
              type="button"
              onClick={handleBack}
              className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/20 text-white/80 transition hover:bg-white/10 hover:text-white active:scale-95 touch-manipulation"
              aria-label="Go back"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2.2} />
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="cq-screen-header__eyebrow">Activity Log</p>
            <h1 className="cq-screen-header__title">Manual Log</h1>
            {showStats ? (
              <p className="cq-screen-header__subtitle">
                Log real activities. Add proof to earn XP and grow your stats.
              </p>
            ) : showActivities && statGroup ? (
              <p className="cq-screen-header__subtitle">
                Choose an activity under {STAT_LABELS[statGroup.stat]}.
              </p>
            ) : selectedActivity ? (
              <p className="cq-screen-header__subtitle">{selectedActivity.label}</p>
            ) : null}
          </div>
        </div>
      </header>

      {showStats ? (
        <ul className="space-y-2">
          {byStat.map(({ stat, items }) => (
            <li key={stat}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setSelectedStat(stat)}
                className={`group flex w-full items-center gap-3 rounded-2xl border border-slate-200 border-l-[3px] bg-cq-card px-4 py-3.5 text-left transition hover:bg-cq-elevated disabled:opacity-50 ${STAT_ACCENT[stat]}`}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cq-elevated text-xl">
                  {STAT_ICONS[stat]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-base font-semibold text-slate-900">{STAT_LABELS[stat]}</span>
                  <span className="block text-xs text-slate-500 mt-0.5">
                    {items.length} activit{items.length === 1 ? "y" : "ies"}
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-400 transition group-hover:text-uri-keaney/80" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {showActivities && statGroup ? (
        <ul className="space-y-2">
          {statGroup.items.map((act) => (
            <li key={act.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  setSelectedActivity(act);
                  resetForm();
                }}
                className="group flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-cq-card px-4 py-3.5 text-left transition hover:bg-cq-elevated disabled:opacity-50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cq-elevated text-lg">
                  {act.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-slate-900 truncate">{act.label}</span>
                  <span className="block text-xs text-slate-500 mt-0.5 truncate">{act.description}</span>
                  <span className="mt-1.5 flex flex-wrap gap-1.5">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      +{act.statGain} {STAT_LABELS[act.stat]}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-uri-keaney/15 text-uri-keaney">
                      +{act.xp} XP
                    </span>
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-400 transition group-hover:text-uri-keaney/80" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {showForm && selectedActivity ? (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-200 bg-cq-card p-4 sm:p-5 space-y-4"
        >
          <div className="flex items-center gap-3 pb-1 border-b border-slate-200">
            <span className="text-2xl">{selectedActivity.icon}</span>
            <div>
              <p className="font-semibold text-slate-900">{selectedActivity.label}</p>
              <p className="text-xs text-slate-500">{selectedActivity.description}</p>
            </div>
          </div>

          {needsMinutes ? (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                Minutes (max {MAX_ACTIVITY_MINUTES})
              </label>
              <input
                type="number"
                min={0}
                max={MAX_ACTIVITY_MINUTES}
                value={minutes}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "") setMinutes("");
                  else {
                    const n = parseInt(v, 10);
                    if (!Number.isNaN(n)) setMinutes(String(Math.min(MAX_ACTIVITY_MINUTES, Math.max(0, n))));
                  }
                }}
                placeholder="e.g. 50"
                className="w-full px-3 py-2.5 rounded-xl bg-cq-elevated border border-slate-200 text-slate-900 placeholder-slate-400 font-mono focus:outline-none focus:ring-2 focus:ring-uri-keaney/40"
              />
            </div>
          ) : null}

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Note (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you do? Where, with who…"
              rows={2}
              className="w-full px-3 py-2.5 rounded-xl bg-cq-elevated border border-slate-200 text-slate-900 placeholder-slate-400 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-uri-keaney/40"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              Proof link or photo (optional if note added)
            </label>
            <input
              type="text"
              value={proof.startsWith("data:") ? "" : proof}
              onChange={(e) => setProof(e.target.value)}
              placeholder="Paste image URL or link"
              className="w-full px-3 py-2.5 rounded-xl bg-cq-elevated border border-slate-200 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-uri-keaney/40"
            />
            <input
              ref={proofFileRef}
              type="file"
              accept="image/*"
              onChange={handleProofFileChange}
              className="hidden"
              aria-label="Add photo proof"
            />
            <button
              type="button"
              onClick={() => proofFileRef.current?.click()}
              className="mt-2 text-xs font-medium text-uri-keaney hover:text-uri-keaney/80 px-3 py-2 rounded-lg border border-uri-keaney/30 hover:bg-uri-keaney/10 transition-colors"
            >
              Add photo from device
            </button>
            {proof.startsWith("data:") ? (
              <div className="mt-2 rounded-xl overflow-hidden border border-slate-200 max-w-[200px]">
                <img src={proof} alt="Proof" className="w-full h-24 object-cover" />
              </div>
            ) : null}
          </div>

          {submitError ? <p className="text-sm text-amber-300/90">{submitError}</p> : null}

          <button
            type="submit"
            disabled={disabled}
            className="w-full py-3 rounded-xl bg-uri-keaney text-white font-semibold hover:bg-uri-keaney/90 disabled:opacity-50 transition-colors shadow-[0_4px_20px_-4px_rgba(104,171,232,0.45)]"
          >
            Submit activity
          </button>
        </form>
      ) : null}
    </div>
  );
}
