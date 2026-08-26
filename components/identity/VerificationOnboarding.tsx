"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { createPortal } from "react-dom";
import { useRegisterImmersiveScreen } from "@/lib/client/nestedImmersiveScreen";
import { OnboardingAmbient } from "@/components/onboarding/OnboardingAmbient";
import { KnightStage, OnboardingProgressHeader } from "@/components/onboarding/KnightStage";
import { BRAND_KNIGHT } from "@/lib/onboarding/taxonomy";
import { BUSINESS_VERIFICATION_CATEGORIES, IDENTITY_TYPE_LABELS, VERIFICATION_STATUS_LABELS } from "@/lib/identity/policy";
import { ORGANIZATION_REQUEST_CATEGORIES, ORGANIZATION_REQUEST_CATEGORY_LABELS } from "@/lib/organizationRequestCategories";
import type { OrganizationClaimMatch, VerificationApplicantSnapshot, VerificationIdentityType } from "@/lib/identity/types";
import {
  searchOrganizationMatches,
  submitVerificationRequest,
  uploadVerificationImage,
} from "@/lib/client/verificationClient";
import { ApiRequestError } from "@/lib/client/dashboardApi";
import { loadCampusIdentities } from "@/lib/client/identityStore";

type Step =
  | "type"
  | "name"
  | "claim"
  | "category"
  | "about"
  | "image"
  | "confirm"
  | "success";

function knightForStep(step: Step): { src: string; size: "sm" | "md" | "lg"; nudge: "center" | "left" | "right" | "up" } {
  if (step === "type") return { src: BRAND_KNIGHT.welcoming, size: "lg", nudge: "center" };
  if (step === "name") return { src: BRAND_KNIGHT.pointing, size: "md", nudge: "left" };
  if (step === "claim") return { src: BRAND_KNIGHT.presenting, size: "md", nudge: "up" };
  if (step === "category") return { src: BRAND_KNIGHT.presentingRight, size: "sm", nudge: "right" };
  if (step === "about") return { src: BRAND_KNIGHT.presenting, size: "sm", nudge: "left" };
  if (step === "image") return { src: BRAND_KNIGHT.reaching, size: "md", nudge: "center" };
  if (step === "confirm") return { src: BRAND_KNIGHT.heroic, size: "md", nudge: "up" };
  return { src: BRAND_KNIGHT.thumbsUp, size: "lg", nudge: "center" };
}

export function VerificationOnboarding({
  applicant,
  userId,
  presetType = null,
  onClose,
}: {
  applicant: VerificationApplicantSnapshot | null;
  userId: string;
  presetType?: VerificationIdentityType | null;
  onClose: () => void;
}) {
  useRegisterImmersiveScreen(true);
  const [step, setStep] = useState<Step>(presetType ? "name" : "type");
  const [identityType, setIdentityType] = useState<VerificationIdentityType | null>(presetType);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [socialUrl, setSocialUrl] = useState("");
  const [organizationEmail, setOrganizationEmail] = useState("");
  const [urinvolvedUrl, setUrinvolvedUrl] = useState("");
  const [applicantRole, setApplicantRole] = useState("");
  const [reasonForAccess, setReasonForAccess] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [matches, setMatches] = useState<OrganizationClaimMatch[]>([]);
  const [claimedOrg, setClaimedOrg] = useState<OrganizationClaimMatch | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedName, setSubmittedName] = useState("");
  const [submittedAt, setSubmittedAt] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const progress = useMemo(() => {
    const org = identityType === "organization";
    const sequence: Step[] = org
      ? ["type", "name", "claim", "category", "about", "image", "confirm"]
      : ["type", "name", "category", "about", "image", "confirm"];
    const current = Math.max(1, sequence.indexOf(step) + 1);
    return { current: step === "success" ? sequence.length : current, total: sequence.length };
  }, [identityType, step]);

  const knight = knightForStep(step);
  const title =
    identityType === "organization" ? "Campus Organization" : identityType === "student_business" ? "Student Business" : "Campus presence";

  function goBack() {
    setError(null);
    if (step === "type" || (presetType && step === "name")) {
      onClose();
      return;
    }
    if (step === "name") setStep("type");
    else if (step === "claim") setStep("name");
    else if (step === "category") setStep(identityType === "organization" ? "claim" : "name");
    else if (step === "about") setStep("category");
    else if (step === "image") setStep("about");
    else if (step === "confirm") setStep("image");
  }

  async function continueFromName() {
    if (name.trim().length < 2) {
      setError("Add a name to continue.");
      return;
    }
    setError(null);
    if (identityType === "organization") {
      setBusy(true);
      try {
        const found = await searchOrganizationMatches(name.trim());
        setMatches(found);
        setClaimedOrg(found[0] && found[0].name.trim().toLowerCase() === name.trim().toLowerCase() ? found[0] : null);
        setStep("claim");
      } catch {
        setMatches([]);
        setStep("claim");
      } finally {
        setBusy(false);
      }
      return;
    }
    setStep("category");
  }

  async function onPickFile(file: File | null) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      setLogoUrl(await uploadVerificationImage(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload that image.");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!identityType || !confirmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await submitVerificationRequest({
        identityType,
        name: name.trim(),
        category,
        description: description.trim(),
        websiteUrl: websiteUrl.trim() || null,
        socialUrl: socialUrl.trim() || null,
        organizationEmail: organizationEmail.trim() || null,
        urinvolvedUrl: urinvolvedUrl.trim() || null,
        applicantRole: applicantRole.trim() || null,
        logoUrl,
        reasonForAccess: reasonForAccess.trim() || null,
        requestedIdentityId: claimedOrg?.id ?? null,
        applicantConfirmation: true,
      });
      setSubmittedName(result.request.name);
      setSubmittedAt(result.request.submittedAt ?? result.request.createdAt);
      setStep("success");
      void loadCampusIdentities(userId).catch(() => undefined);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Could not submit this request. Try again in a moment.",
      );
    } finally {
      setBusy(false);
    }
  }

  const body = (
    <div className="cq-onboard-shell cq-onboard-shell--light cq-verify-shell" role="dialog" aria-modal="true" aria-label="Verification">
      <OnboardingAmbient density={step === "success" ? "celebrate" : "normal"} showCampusHaze={step === "type"} />
      {step !== "success" ? (
        <button type="button" className="cq-onboard-back" aria-label="Back" onClick={goBack}>
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
      ) : null}
      {step !== "type" && step !== "success" ? (
        <OnboardingProgressHeader label={title} current={progress.current} total={progress.total} />
      ) : null}

      <div className="cq-onboard-inner cq-verify-inner">
        <KnightStage src={knight.src} size={knight.size} ring="md" nudge={knight.nudge} />

        {step === "type" ? (
          <>
            <h1 className="cq-onboard-title">Create Your Campus Presence</h1>
            <p className="cq-onboard-sub">Build an official presence for your business or organization on CampusQuest.</p>
            <button
              type="button"
              className="cq-verify-choice"
              onClick={() => {
                setIdentityType("student_business");
                setStep("name");
              }}
            >
              <span className="cq-verify-choice-title">Student Business</span>
              <span className="cq-verify-choice-sub">For student-run brands, startups, products and services.</span>
            </button>
            <button
              type="button"
              className="cq-verify-choice"
              onClick={() => {
                setIdentityType("organization");
                setStep("name");
              }}
            >
              <span className="cq-verify-choice-title">Campus Organization</span>
              <span className="cq-verify-choice-sub">For clubs, organizations, departments and campus groups.</span>
            </button>
          </>
        ) : null}

        {step === "name" ? (
          <>
            <h1 className="cq-onboard-title">
              {identityType === "organization" ? "What's your organization called?" : "What's your business called?"}
            </h1>
            <label className="cq-verify-label" htmlFor="cq-verify-name">
              {identityType === "organization" ? "Organization name" : "Business name"}
            </label>
            <input
              id="cq-verify-name"
              className="cq-verify-input"
              value={name}
              maxLength={120}
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
            />
            <button type="button" className="cq-onboard-btn-primary cq-onboard-btn-primary--glow mt-6 disabled:opacity-50" disabled={busy} onClick={() => void continueFromName()}>
              Continue
            </button>
          </>
        ) : null}

        {step === "claim" ? (
          <>
            <h1 className="cq-onboard-title">{matches.length > 0 ? "Is this your organization?" : "Create a new organization"}</h1>
            <p className="cq-onboard-sub">
              {matches.length > 0
                ? "CampusQuest already has matching campus records. Claim yours instead of creating a duplicate."
                : "We didn't find a matching imported organization. You can still request a new verified page."}
            </p>
            {matches.map((match) => (
              <button
                key={match.id}
                type="button"
                className={`cq-verify-choice ${claimedOrg?.id === match.id ? "cq-verify-choice--on" : ""}`}
                onClick={() => setClaimedOrg(match)}
              >
                <span className="cq-verify-choice-title">{match.name}</span>
                <span className="cq-verify-choice-sub">{match.category || "Campus organization"}</span>
              </button>
            ))}
            <button type="button" className="cq-verify-text-btn" onClick={() => setClaimedOrg(null)}>
              This is a new organization
            </button>
            <button type="button" className="cq-onboard-btn-primary cq-onboard-btn-primary--glow mt-6 disabled:opacity-50" onClick={() => setStep("category")}>
              Continue
            </button>
          </>
        ) : null}

        {step === "category" ? (
          <>
            <h1 className="cq-onboard-title">
              {identityType === "organization" ? "What kind of organization is it?" : "What kind of business is it?"}
            </h1>
            <div className="cq-verify-chips">
              {identityType === "organization"
                ? ORGANIZATION_REQUEST_CATEGORIES.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className={`cq-verify-chip ${category === id ? "cq-verify-chip--on" : ""}`}
                      onClick={() => setCategory(id)}
                    >
                      {ORGANIZATION_REQUEST_CATEGORY_LABELS[id]}
                    </button>
                  ))
                : BUSINESS_VERIFICATION_CATEGORIES.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className={`cq-verify-chip ${category === row.id ? "cq-verify-chip--on" : ""}`}
                      onClick={() => setCategory(row.id)}
                    >
                      {row.label}
                    </button>
                  ))}
            </div>
            <button type="button" className="cq-onboard-btn-primary cq-onboard-btn-primary--glow mt-6 disabled:opacity-50" disabled={!category} onClick={() => setStep("about")}>
              Continue
            </button>
          </>
        ) : null}

        {step === "about" ? (
          <>
            <h1 className="cq-onboard-title">Tell us about it</h1>
            <label className="cq-verify-label" htmlFor="cq-verify-bio">
              Short description
            </label>
            <textarea id="cq-verify-bio" className="cq-verify-textarea" value={description} maxLength={2000} onChange={(event) => setDescription(event.target.value)} />
            {identityType === "organization" ? (
              <>
                <label className="cq-verify-label" htmlFor="cq-verify-uri">
                  URInvolved page
                </label>
                <input id="cq-verify-uri" className="cq-verify-input" value={urinvolvedUrl} onChange={(event) => setUrinvolvedUrl(event.target.value)} placeholder="Optional" />
                <label className="cq-verify-label" htmlFor="cq-verify-email">
                  Organization email
                </label>
                <input id="cq-verify-email" className="cq-verify-input" value={organizationEmail} onChange={(event) => setOrganizationEmail(event.target.value)} placeholder="Optional" />
                <label className="cq-verify-label" htmlFor="cq-verify-role">
                  Your role
                </label>
                <input id="cq-verify-role" className="cq-verify-input" value={applicantRole} onChange={(event) => setApplicantRole(event.target.value)} placeholder="President, treasurer, manager…" />
                <label className="cq-verify-label" htmlFor="cq-verify-reason">
                  Why you are requesting management access
                </label>
                <textarea id="cq-verify-reason" className="cq-verify-textarea" value={reasonForAccess} maxLength={1000} onChange={(event) => setReasonForAccess(event.target.value)} />
              </>
            ) : null}
            <label className="cq-verify-label" htmlFor="cq-verify-ig">
              Instagram
            </label>
            <input id="cq-verify-ig" className="cq-verify-input" value={socialUrl} onChange={(event) => setSocialUrl(event.target.value)} placeholder="Optional" />
            <label className="cq-verify-label" htmlFor="cq-verify-web">
              Website
            </label>
            <input id="cq-verify-web" className="cq-verify-input" value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="Optional" />
            <button type="button" className="cq-onboard-btn-primary cq-onboard-btn-primary--glow mt-6 disabled:opacity-50" disabled={description.trim().length < 1} onClick={() => setStep("image")}>
              Continue
            </button>
          </>
        ) : null}

        {step === "image" ? (
          <>
            <h1 className="cq-onboard-title">{identityType === "organization" ? "Organization image" : "Business image"}</h1>
            <p className="cq-onboard-sub">A logo or photo is optional, but it helps students recognize you.</p>
            <label className="cq-verify-upload">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(event) => void onPickFile(event.target.files?.[0] ?? null)}
              />
              {logoUrl ? "Change image" : "Upload logo or image"}
            </label>
            {logoUrl ? <img src={logoUrl} alt="" className="cq-verify-preview" /> : null}
            <button type="button" className="cq-onboard-btn-primary cq-onboard-btn-primary--glow mt-6 disabled:opacity-50" disabled={uploading} onClick={() => setStep("confirm")}>
              {uploading ? "Uploading…" : "Continue"}
            </button>
          </>
        ) : null}

        {step === "confirm" ? (
          <>
            <h1 className="cq-onboard-title">Confirm and submit</h1>
            <div className="cq-verify-card">
              <p><strong>{applicant?.displayName || "Student"}</strong></p>
              <p>{applicant?.email || "Verified campus email on file"}</p>
              <p>@{applicant?.username || "username"}</p>
            </div>
            <label className="cq-verify-check">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
              <span>
                I confirm that I own, operate, or am authorized to represent this{" "}
                {identityType === "organization" ? "organization" : "business"}.
              </span>
            </label>
            <button type="button" className="cq-onboard-btn-primary cq-onboard-btn-primary--glow mt-6 disabled:opacity-50" disabled={!confirmed || busy} onClick={() => void submit()}>
              {busy ? "Submitting…" : "Submit for Verification"}
            </button>
          </>
        ) : null}

        {step === "success" ? (
          <>
            <h1 className="cq-onboard-title">Verification Submitted</h1>
            <p className="cq-onboard-sub">
              Your request has been sent to the CampusQuest team for review. You can keep using CampusQuest while we review it.
            </p>
            <div className="cq-verify-card">
              <p className="cq-verify-choice-title">{submittedName}</p>
              <p className="cq-verify-choice-sub">{identityType ? IDENTITY_TYPE_LABELS[identityType] : title}</p>
              <p className="cq-verify-status">{VERIFICATION_STATUS_LABELS.pending_review}</p>
              <p className="cq-verify-choice-sub">
                {submittedAt ? new Date(submittedAt).toLocaleDateString() : "Today"}
              </p>
            </div>
            <button type="button" className="cq-onboard-btn-primary cq-onboard-btn-primary--glow mt-6 disabled:opacity-50" onClick={onClose}>
              Back to CampusQuest
            </button>
          </>
        ) : null}

        {error ? <p className="cq-onboard-error" role="alert">{error}</p> : null}
      </div>
    </div>
  );

  if (typeof document === "undefined") return body;
  return createPortal(body, document.body);
}
