"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X, Zap } from "lucide-react";
import {
  MANUAL_LOG_ACTIVITY_BY_STAT,
  MANUAL_LOG_MAX_XP,
  STAT_TRAINING_COPY,
} from "@/lib/manualLogStats";
import { STAT_BORDER_CLASS } from "@/lib/statAssets";
import type { Character, StatKey } from "@/lib/types";
import { STAT_KEYS, STAT_LABELS } from "@/lib/types";
import type { LogActivityOptions } from "@/lib/store";
import { MobileSwipeBackSurface } from "@/components/mobile/MobileSwipeBackSurface";
import { StatIcon } from "@/components/stats/StatIcon";

const STAT_ORDER: StatKey[] = [...STAT_KEYS];

export function ManualLogScreen({
  onLog,
  onBack,
  disabled,
}: {
  character: Character;
  onLog: (activityId: string, options?: LogActivityOptions) => Character | null;
  onBack?: () => void;
  disabled?: boolean;
}) {
  const [pickerStat, setPickerStat] = useState<StatKey | null>(null);
  const [description, setDescription] = useState("");
  const [proof, setProof] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const proofFileRef = useRef<HTMLInputElement>(null);

  function resetForm() {
    setDescription("");
    setProof("");
    setSubmitError(null);
  }

  function closeSheet() {
    setPickerStat(null);
    resetForm();
  }

  function handleBack() {
    if (pickerStat) {
      closeSheet();
      return;
    }
    onBack?.();
  }

  function handleProofFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setSubmitError("Please choose an image file (JPEG or PNG).");
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
    if (!pickerStat) return;

    const note = description.trim();
    if (!note) {
      setSubmitError("Describe what you did.");
      return;
    }

    const proofValue = proof.trim() || note;
    const activityId = MANUAL_LOG_ACTIVITY_BY_STAT[pickerStat];
    const options: LogActivityOptions = {
      proofUrl: proofValue,
      tags: [note],
      maxXp: MANUAL_LOG_MAX_XP,
    };

    setSubmitError(null);
    const updated = onLog(activityId, options);
    if (updated) {
      closeSheet();
    } else {
      setSubmitError("Could not submit. Try again.");
    }
  }

  return (
    <MobileSwipeBackSurface onBack={handleBack} className="cq-manual-log">
      <div className="cq-manual-log-bg" aria-hidden />

      <header className="cq-manual-log-header">
        <button
          type="button"
          onClick={handleBack}
          className="cq-manual-log-back"
          aria-label="Go back"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2.25} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="cq-manual-log-title">Manual Log</h1>
          <p className="cq-manual-log-subtitle">Log real activity. Up to 20 XP per submission.</p>
        </div>
      </header>

      <div className="cq-manual-log-attributes" role="list" aria-label="Train a stat">
        {STAT_ORDER.map((stat) => {
          const trainingCopy = STAT_TRAINING_COPY[stat];

          return (
            <button
              key={stat}
              type="button"
              role="listitem"
              disabled={disabled}
              onClick={() => {
                setPickerStat(stat);
                resetForm();
              }}
              className={`cq-manual-log-attribute ${STAT_BORDER_CLASS[stat]}`}
              aria-label={`${STAT_LABELS[stat]}: ${trainingCopy}`}
            >
              <StatIcon stat={stat} size="lg" label={STAT_LABELS[stat]} />
              <span className="cq-manual-log-attribute-body">
                <span className="cq-manual-log-attribute-name">{STAT_LABELS[stat]}</span>
                <span className="cq-manual-log-attribute-desc">{trainingCopy}</span>
              </span>
              <ChevronRight className="cq-manual-log-attribute-chevron" aria-hidden strokeWidth={2.25} />
            </button>
          );
        })}
      </div>

      {pickerStat && typeof document !== "undefined"
        ? createPortal(
            <ManualLogSheet
              title={STAT_LABELS[pickerStat]}
              subtitle={STAT_TRAINING_COPY[pickerStat]}
              onClose={closeSheet}
            >
              <form onSubmit={handleSubmit} className="cq-manual-log-form">
                <div className="cq-manual-log-xp-preview" aria-label="XP reward">
                  <Zap className="h-3.5 w-3.5" aria-hidden />
                  <span>+{MANUAL_LOG_MAX_XP} XP max</span>
                </div>

                <label className="cq-manual-log-field">
                  <span className="cq-manual-log-field-label">What did you do?</span>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Briefly describe your activity…"
                    rows={3}
                    className="cq-manual-log-input cq-manual-log-textarea"
                    autoFocus
                  />
                </label>

                <div className="cq-manual-log-field">
                  <span className="cq-manual-log-field-label">
                    Proof <span className="cq-manual-log-optional">(optional)</span>
                  </span>
                  <input
                    type="text"
                    value={proof.startsWith("data:") ? "" : proof}
                    onChange={(e) => setProof(e.target.value)}
                    placeholder="Link or photo"
                    className="cq-manual-log-input"
                  />
                  <input
                    ref={proofFileRef}
                    type="file"
                    accept="image/*"
                    onChange={handleProofFileChange}
                    className="sr-only"
                    aria-label="Add photo proof"
                  />
                  <button
                    type="button"
                    onClick={() => proofFileRef.current?.click()}
                    className="cq-manual-log-photo-btn"
                  >
                    Add photo
                  </button>
                  {proof.startsWith("data:") ? (
                    <div className="cq-manual-log-proof-preview">
                      <img src={proof} alt="Proof preview" />
                    </div>
                  ) : null}
                </div>

                {submitError ? <p className="cq-manual-log-error">{submitError}</p> : null}

                <button type="submit" disabled={disabled} className="cq-manual-log-submit">
                  Submit
                </button>
              </form>
            </ManualLogSheet>,
            document.body,
          )
        : null}
    </MobileSwipeBackSurface>
  );
}

function ManualLogSheet({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="cq-manual-log-sheet-root" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="cq-manual-log-sheet-backdrop" aria-label="Close" onClick={onClose} />
      <div className="cq-manual-log-sheet">
        <div className="cq-manual-log-sheet-handle" aria-hidden />
        <header className="cq-manual-log-sheet-header">
          <span className="w-9" />
          <div className="min-w-0 flex-1 text-center">
            <h2 className="cq-manual-log-sheet-title">{title}</h2>
            <p className="cq-manual-log-sheet-subtitle">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="cq-manual-log-sheet-icon-btn" aria-label="Close">
            <X className="h-5 w-5" strokeWidth={2.25} />
          </button>
        </header>
        <div className="cq-manual-log-sheet-body">{children}</div>
      </div>
    </div>
  );
}
