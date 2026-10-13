"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, Send, X } from "lucide-react";
import { PartnerOverlayPortal } from "@/components/partners/PartnerOverlayPortal";
import { useRegisterImmersiveScreen } from "@/lib/client/nestedImmersiveScreen";
import { errorMessage, sendPartnerSuggestion } from "@/lib/client/partnersApi";
import { parsePartnerSuggestion, PARTNER_SUGGESTION_LIMITS } from "@/lib/partners/partnerSuggestion";

type SubmitState = { status: "idle" } | { status: "sending" } | { status: "sent" } | { status: "error"; message: string };

export function SuggestBusinessSheet({ onClose }: { onClose: () => void }) {
  useRegisterImmersiveScreen(true);
  return (
    <PartnerOverlayPortal>
      <SuggestBusinessForm onClose={onClose} onSubmit={sendPartnerSuggestion} />
    </PartnerOverlayPortal>
  );
}

export function SuggestBusinessForm({
  onClose,
  onSubmit,
  initialState = { status: "idle" },
}: {
  onClose: () => void;
  onSubmit: typeof sendPartnerSuggestion;
  initialState?: SubmitState;
}) {
  const [businessName, setBusinessName] = useState("");
  const [location, setLocation] = useState("");
  const [reason, setReason] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<SubmitState>(initialState);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    nameRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (state.status === "sending") return;
    const parsed = parsePartnerSuggestion({ businessName, location, reason, website });
    if (!parsed.ok) {
      setFieldError(parsed.message);
      nameRef.current?.focus();
      return;
    }
    setFieldError(null);
    setState({ status: "sending" });
    try {
      await onSubmit({ businessName, location, reason, website });
      setState({ status: "sent" });
    } catch (error) {
      setState({ status: "error", message: errorMessage(error, "Couldn\u2019t send your suggestion. Try again.") });
    }
  };

  return (
    <div
      className="cq-perk-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cq-suggest-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="cq-perk-modal__panel">
        <header className="cq-perk-modal__header">
          <h2 id="cq-suggest-title" className="cq-perk-modal__title">
            Suggest a Business
          </h2>
          <button
            type="button"
            className="cq-perk-iconbtn cq-perk-iconbtn--flat cq-tap-press touch-manipulation"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden strokeWidth={2.4} />
          </button>
        </header>

        {state.status === "sent" ? (
          <div className="cq-perk-modal__done" role="status">
            <CheckCircle2 className="h-10 w-10" aria-hidden strokeWidth={2} />
            <p className="cq-perk-modal__done-title">Thanks for the suggestion!</p>
            <p className="cq-perk-modal__done-text">Our team reviews every suggestion before reaching out to a business.</p>
            <button type="button" className="cq-perk-btn cq-perk-btn--primary cq-tap-press touch-manipulation" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <form className="cq-perk-form" onSubmit={submit} noValidate>
            <p className="cq-perk-modal__lead">Tell us which local businesses you&apos;d love to see on CampusQuest.</p>
            <label className="cq-perk-field">
              <span className="cq-perk-field__label">Business name</span>
              <input
                ref={nameRef}
                className="cq-perk-field__input"
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
                maxLength={PARTNER_SUGGESTION_LIMITS.businessName}
                autoComplete="off"
                enterKeyHint="next"
                required
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? "cq-suggest-error" : undefined}
              />
            </label>
            <label className="cq-perk-field">
              <span className="cq-perk-field__label">
                Location <span className="cq-perk-field__optional">optional</span>
              </span>
              <input
                className="cq-perk-field__input"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                maxLength={PARTNER_SUGGESTION_LIMITS.location}
                placeholder="e.g. Kingston, Narragansett"
                autoComplete="off"
              />
            </label>
            <label className="cq-perk-field">
              <span className="cq-perk-field__label">
                Why should we partner with them? <span className="cq-perk-field__optional">optional</span>
              </span>
              <textarea
                className="cq-perk-field__input cq-perk-field__input--area"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={PARTNER_SUGGESTION_LIMITS.reason}
                rows={3}
              />
            </label>
            <label className="cq-perk-honeypot" aria-hidden="true">
              Website
              <input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
            </label>
            {fieldError ? (
              <p id="cq-suggest-error" className="cq-perk-form__error" role="alert">
                {fieldError}
              </p>
            ) : null}
            {state.status === "error" ? (
              <p className="cq-perk-form__error" role="alert">
                {state.message}
              </p>
            ) : null}
            <button
              type="submit"
              className="cq-perk-btn cq-perk-btn--primary cq-perk-btn--block cq-tap-press touch-manipulation"
              disabled={state.status === "sending"}
            >
              {state.status === "sending" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden strokeWidth={2.4} />
              ) : (
                <Send className="h-4 w-4" aria-hidden strokeWidth={2.3} />
              )}
              {state.status === "sending" ? "Sending\u2026" : "Send suggestion"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
